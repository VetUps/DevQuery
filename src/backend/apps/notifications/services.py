from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.notifications.models import Notification


class NotificationNotFound(Exception):
    """Raised when a notification is missing or not owned by the requesting user."""


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
        return Notification.objects.filter(recipient=user).select_related('recipient', 'source_question').order_by('-created_at')

    @staticmethod
    def mark_read(notification_id, user):
        try:
            notification = Notification.objects.get(notification_id=notification_id, recipient=user)
        except Notification.DoesNotExist as exc:
            raise NotificationNotFound('Notification not found.') from exc

        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return notification
