from django.contrib import admin

from apps.notifications.models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('notification_id', 'recipient', 'notification_type', 'created_at', 'read_at', 'expires_at', 'dedupe_key')
    list_filter = ('notification_type', 'created_at', 'read_at', 'expires_at')
    search_fields = ('recipient__user_email', 'recipient__user_name', 'title', 'dedupe_key')
    readonly_fields = ('notification_id', 'created_at', 'read_at')
    raw_id_fields = ('recipient', 'source_question')
    date_hierarchy = 'created_at'
