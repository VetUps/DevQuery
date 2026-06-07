# Кратко: проверяет данные и готовит ответы API для уведомлений.
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.notifications.models import Notification
from apps.qa.services.question_protection_service import QuestionProtectionService
from apps.user.services.reputation_service import ReputationService


class NotificationSerializer(serializers.ModelSerializer):
    INVITATION_STATUS_ACTIVE = 'active'
    INVITATION_STATUS_EXPIRED = 'expired'
    INVITATION_STATUS_PROTECTED_ENDED = 'protected_ended'
    INVITATION_STATUS_UNAVAILABLE = 'unavailable'

    source_question_id = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    invitation_status = serializers.SerializerMethodField()
    protected_window_active = serializers.SerializerMethodField()
    protected_window_ended = serializers.SerializerMethodField()
    protected_until = serializers.SerializerMethodField()
    cta_url = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            'notification_id',
            'notification_type',
            'title',
            'message',
            'payload',
            'source_question_id',
            'created_at',
            'read_at',
            'expires_at',
            'is_read',
            'is_expired',
            'invitation_status',
            'protected_window_active',
            'protected_window_ended',
            'protected_until',
            'cta_url',
        )
        read_only_fields = fields

    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_source_question_id(self, obj) -> str | None:
        """Возвращает данные source вопроса id."""
        if obj.source_question_id is None:
            return None
        return str(obj.source_question_id)

    @extend_schema_field(serializers.BooleanField())
    def get_is_read(self, obj) -> bool:
        """Возвращает данные данных."""
        return obj.read_at is not None

    @extend_schema_field(serializers.BooleanField())
    def get_is_expired(self, obj) -> bool:
        """Возвращает данные expired."""
        return self._is_expired(obj)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_invitation_status(self, obj) -> str | None:
        """Возвращает данные приглашения status."""
        metadata = self._get_invitation_metadata(obj)
        return metadata['invitation_status']

    @extend_schema_field(serializers.BooleanField())
    def get_protected_window_active(self, obj) -> bool:
        """Возвращает данные protected window active."""
        metadata = self._get_invitation_metadata(obj)
        return metadata['protected_window_active']

    @extend_schema_field(serializers.BooleanField())
    def get_protected_window_ended(self, obj) -> bool:
        """Возвращает данные protected window ended."""
        metadata = self._get_invitation_metadata(obj)
        return metadata['protected_window_ended']

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_protected_until(self, obj) -> str | None:
        """Возвращает данные protected until."""
        metadata = self._get_invitation_metadata(obj)
        protected_until = metadata['protected_until']
        return protected_until.isoformat() if protected_until is not None else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_cta_url(self, obj) -> str | None:
        """Возвращает данные cta url."""
        metadata = self._get_invitation_metadata(obj)
        return metadata['cta_url']

    def _get_invitation_metadata(self, obj) -> dict:
        """Возвращает приглашение метаданные."""
        if not hasattr(obj, '_notification_serializer_invitation_metadata'):
            obj._notification_serializer_invitation_metadata = self._build_invitation_metadata(obj)
        return obj._notification_serializer_invitation_metadata

    def _build_invitation_metadata(self, obj) -> dict:
        """Собирает приглашение метаданные."""
        default = {
            'invitation_status': None,
            'protected_window_active': False,
            'protected_window_ended': False,
            'protected_until': None,
            'cta_url': None,
        }
        if obj.notification_type != Notification.NotificationType.EXPERT_INVITATION:
            return default

        source_question = getattr(obj, 'source_question', None)
        if source_question is None:
            return {
                **default,
                'invitation_status': self.INVITATION_STATUS_UNAVAILABLE,
            }

        protection_state = QuestionProtectionService.get_protection_state(source_question)
        protected_until = protection_state.protected_until
        if protected_until is None and source_question.question_created_at is not None:
            protected_until = source_question.question_created_at + ReputationService.get_protected_newcomer_window()
        protected_window_active = protection_state.is_protected
        protected_window_ended = not protected_window_active

        if self._is_expired(obj):
            invitation_status = self.INVITATION_STATUS_EXPIRED
        elif protected_window_ended:
            invitation_status = self.INVITATION_STATUS_PROTECTED_ENDED
        else:
            invitation_status = self.INVITATION_STATUS_ACTIVE

        return {
            'invitation_status': invitation_status,
            'protected_window_active': protected_window_active,
            'protected_window_ended': protected_window_ended,
            'protected_until': protected_until,
            'cta_url': f'/questions/{source_question.pk}',
        }

    def _is_expired(self, obj) -> bool:
        """Проверяет условие: истечение срока."""
        return obj.expires_at is not None and obj.expires_at <= timezone.now()
