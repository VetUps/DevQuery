import uuid

from django.db import models

from apps.qa.models import Question
from apps.user.models import CustomUser


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        EXPERT_INVITATION = 'expert_invitation', 'Expert invitation'

    notification_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        blank=False,
        help_text='Уникальный идентификатор уведомления',
    )
    recipient = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='notifications',
        blank=False,
        null=False,
        help_text='Получатель уведомления',
    )
    notification_type = models.CharField(
        max_length=64,
        choices=NotificationType.choices,
        blank=False,
        null=False,
        help_text='Тип уведомления',
    )
    title = models.CharField(max_length=200, blank=False, null=False, help_text='Заголовок уведомления')
    message = models.TextField(blank=False, null=False, help_text='Текст уведомления')
    payload = models.JSONField(default=dict, blank=True, help_text='Структурированный контекст уведомления')
    source_question = models.ForeignKey(
        Question,
        on_delete=models.SET_NULL,
        related_name='notifications',
        blank=True,
        null=True,
        help_text='Вопрос-источник уведомления, если применимо',
    )
    created_at = models.DateTimeField(auto_now_add=True, help_text='Дата создания уведомления')
    read_at = models.DateTimeField(blank=True, null=True, help_text='Дата прочтения уведомления')
    expires_at = models.DateTimeField(blank=True, null=True, help_text='Дата истечения актуальности уведомления')
    dedupe_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Ключ идемпотентности для предотвращения дублей',
    )

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'notification_type', 'dedupe_key'],
                name='notif_rec_type_dedupe_uniq',
            ),
        ]
        indexes = [
            models.Index(fields=['recipient', '-created_at'], name='notif_recipient_created_idx'),
            models.Index(fields=['recipient', 'read_at'], name='notif_recipient_read_idx'),
            models.Index(fields=['notification_type'], name='notif_type_idx'),
            models.Index(fields=['dedupe_key'], name='notif_dedupe_key_idx'),
        ]

    def __str__(self):
        return f'{self.notification_type} for {self.recipient_id}'
