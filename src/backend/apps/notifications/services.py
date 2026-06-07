# Кратко: держит основную логику этого файла.
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.notifications.models import Notification


class NotificationNotFound(Exception):
    """Ошибка для отсутствующего или чужого уведомления."""


class NotificationService:
    @staticmethod
    def create_notification(
        *,
        recipient,
        notification_type,
        title,
        message,
        payload=None,
        source_question=None,
        expires_at=None,
        dedupe_key=None,
    ):
        """Создаёт данные уведомления."""
        if payload is None:
            payload = {}
        elif not isinstance(payload, dict):
            raise ValidationError({'payload': 'Notification payload must be a JSON object.'})

        normalized_dedupe_key = dedupe_key or None
        defaults = {
            'title': title,
            'message': message,
            'payload': payload,
            'source_question': source_question,
            'expires_at': expires_at,
        }

        if normalized_dedupe_key is None:
            return Notification.objects.create(
                recipient=recipient,
                notification_type=notification_type,
                dedupe_key=None,
                **defaults,
            )

        lookup = {
            'recipient': recipient,
            'notification_type': notification_type,
            'dedupe_key': normalized_dedupe_key,
        }
        try:
            with transaction.atomic():
                notification, _created = Notification.objects.get_or_create(defaults=defaults, **lookup)
                return notification
        except IntegrityError:
            return Notification.objects.get(**lookup)

    @staticmethod
    def list_for_user(user):
        """Обрабатывает пользователя."""
        return NotificationService.notifications_for_user(user)

    @staticmethod
    def notifications_for_user(user, *, status='all'):
        """Обрабатывает уведомления пользователя."""
        queryset = Notification.objects.filter(recipient=user).select_related('recipient', 'source_question').order_by('-created_at')
        if status == 'unread':
            return queryset.filter(read_at__isnull=True)
        return queryset

    @staticmethod
    def unread_count_for_user(user):
        """Обрабатывает unread счётчик пользователя."""
        return NotificationService.notifications_for_user(user, status='unread').count()

    @staticmethod
    def latest_for_user(user, *, limit=5):
        """Обрабатывает latest пользователя."""
        return NotificationService.notifications_for_user(user)[:limit]

    @staticmethod
    def mark_read(notification_id, user):
        """Помечает состояние данных."""
        try:
            notification = Notification.objects.get(notification_id=notification_id, recipient=user)
        except Notification.DoesNotExist as exc:
            raise NotificationNotFound('Notification not found.') from exc

        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return notification

    @staticmethod
    def mark_all_read(user):
        """Помечает состояние all."""
        marked_count = Notification.objects.filter(recipient=user, read_at__isnull=True).update(read_at=timezone.now())
        unread_count = NotificationService.unread_count_for_user(user)
        return {
            'marked_count': marked_count,
            'unread_count': unread_count,
        }
