from django.urls import path

from apps.notifications.views import NotificationListView, NotificationMarkReadView, NotificationSummaryView

app_name = 'notifications'

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/summary/', NotificationSummaryView.as_view(), name='notification-summary'),
    path('notifications/<uuid:notification_id>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
]
