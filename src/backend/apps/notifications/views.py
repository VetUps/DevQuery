from django.core.paginator import InvalidPage
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer
from apps.notifications.services import NotificationNotFound, NotificationService


class NotificationPageNumberPagination(PageNumberPagination):
    page_size = 5

    def paginate_queryset(self, queryset, request, view=None):
        self.request = request
        page_size = self.get_page_size(request)
        if not page_size:
            return None

        paginator = self.django_paginator_class(queryset, page_size)
        page_number = self.get_page_number(request, paginator)

        try:
            self.page = paginator.page(page_number)
        except InvalidPage as exc:
            raise ValidationError({'page': 'Invalid page.'}) from exc

        if paginator.num_pages > 1 and self.template is not None:
            self.display_page_controls = True

        return list(self.page)


class NotificationListView(generics.ListAPIView):
    queryset = Notification.objects.none()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NotificationPageNumberPagination
    VALID_STATUSES = {'all', 'unread'}

    def get_requested_status(self):
        requested_status = self.request.query_params.get('status', 'all')
        if requested_status not in self.VALID_STATUSES:
            raise ValidationError({'status': 'Unsupported status. Use "all" or "unread".'})
        return requested_status

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return self.queryset
        return NotificationService.notifications_for_user(self.request.user, status=self.get_requested_status())

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='status',
                type=str,
                location=OpenApiParameter.QUERY,
                enum=['all', 'unread'],
                required=False,
                description='Filter current-recipient notifications. Defaults to all.',
            ),
            OpenApiParameter(
                name='page',
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Page number within the paginated notification result set.',
            ),
        ],
        responses={200: NotificationSerializer(many=True), 400: None},
        description='List notifications for the authenticated recipient only, optionally filtered by read status.',
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class NotificationSummaryView(APIView):
    permission_classes = [IsAuthenticated]
    latest_limit = 5

    @extend_schema(
        responses={
            200: inline_serializer(
                name='NotificationSummary',
                fields={
                    'unread_count': serializers.IntegerField(),
                    'latest': NotificationSerializer(many=True),
                },
            )
        },
        description='Return the authenticated recipient notification unread count and latest bounded preview items.',
    )
    def get(self, request):
        latest_notifications = NotificationService.latest_for_user(request.user, limit=self.latest_limit)
        serializer = NotificationSerializer(latest_notifications, many=True, context={'request': request})
        return Response(
            {
                'unread_count': NotificationService.unread_count_for_user(request.user),
                'latest': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


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


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={
            200: inline_serializer(
                name='NotificationMarkAllReadResponse',
                fields={
                    'marked_count': serializers.IntegerField(),
                    'unread_count': serializers.IntegerField(),
                },
            )
        },
        description='Mark all authenticated-recipient notifications as read and return deterministic counters.',
    )
    def patch(self, request):
        return Response(NotificationService.mark_all_read(request.user), status=status.HTTP_200_OK)
