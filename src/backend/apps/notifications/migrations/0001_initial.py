# Generated manually for the durable notifications foundation.

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('qa', '0004_questioneditproposal_questionrevision_and_more'),
        ('user', '0004_remove_expert_user_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                (
                    'notification_id',
                    models.UUIDField(
                        blank=False,
                        default=uuid.uuid4,
                        editable=False,
                        help_text='Уникальный идентификатор уведомления',
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    'notification_type',
                    models.CharField(
                        choices=[('expert_invitation', 'Expert invitation')],
                        help_text='Тип уведомления',
                        max_length=64,
                    ),
                ),
                ('title', models.CharField(help_text='Заголовок уведомления', max_length=200)),
                ('message', models.TextField(help_text='Текст уведомления')),
                ('payload', models.JSONField(blank=True, default=dict, help_text='Структурированный контекст уведомления')),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Дата создания уведомления')),
                ('read_at', models.DateTimeField(blank=True, help_text='Дата прочтения уведомления', null=True)),
                ('expires_at', models.DateTimeField(blank=True, help_text='Дата истечения актуальности уведомления', null=True)),
                (
                    'dedupe_key',
                    models.CharField(
                        blank=True,
                        help_text='Ключ идемпотентности для предотвращения дублей',
                        max_length=255,
                        null=True,
                    ),
                ),
                (
                    'recipient',
                    models.ForeignKey(
                        help_text='Получатель уведомления',
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='notifications',
                        to='user.customuser',
                    ),
                ),
                (
                    'source_question',
                    models.ForeignKey(
                        blank=True,
                        help_text='Вопрос-источник уведомления, если применимо',
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='notifications',
                        to='qa.question',
                    ),
                ),
            ],
            options={
                'db_table': 'notifications',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['recipient', '-created_at'], name='notif_recipient_created_idx'),
                    models.Index(fields=['recipient', 'read_at'], name='notif_recipient_read_idx'),
                    models.Index(fields=['notification_type'], name='notif_type_idx'),
                    models.Index(fields=['dedupe_key'], name='notif_dedupe_key_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('recipient', 'notification_type', 'dedupe_key'),
                        name='notif_rec_type_dedupe_uniq',
                    ),
                ],
            },
        ),
    ]
