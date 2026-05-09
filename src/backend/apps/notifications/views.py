from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer
from apps.notifications.services import NotificationNotFound, NotificationService


class NotificationListView(generics.ListAPIView):
    queryset = Notification.objects.none()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return self.queryset
        return NotificationService.list_for_user(self.request.user)

    @extend_schema(
        responses={200: NotificationSerializer(many=True)},
        description='List notifications for the authenticated recipient only.',
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={200: NotificationSerializer, 404: None},
        description='Mark one authenticated-recipient notification as read. Missing and foreign IDs both return 404.',
    )
    def patch(self, request, notification_id):
        try:
            notification = NotificationService.mark_read(notification_id, request.user)
        except NotificationNotFound as exc:
            raise NotFound('Notification not found.') from exc

        serializer = NotificationSerializer(notification, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
