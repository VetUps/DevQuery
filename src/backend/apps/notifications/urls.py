from django.urls import path

from apps.notifications.views import NotificationListView, NotificationMarkReadView

app_name = 'notifications'

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<uuid:notification_id>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
]
