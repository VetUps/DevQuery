from django.db.models import Q
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from shared.permissions import IsAdmin
from .models import CustomUser
from .serializers import (
    AdminActivityTimelineQuerySerializer,
    AdminActivityTimelineResponseSerializer,
    AdminManualReputationOverrideSerializer,
    AdminReputationPolicySerializer,
    AdminUserListSerializer,
    AdminUserReputationDetailSerializer,
    UserRegisterSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    PublicUserProfileSerializer,
    UserLoginResponseSerializer,
    UserLogoutSerializer,
)
from .services.user_service import UserService
from .services.reputation_service import ReputationService
from .services.admin_activity_service import AdminActivityService


class UserViewSet(viewsets.GenericViewSet):
    lookup_field = 'user_id'
    serializer_class = UserRegisterSerializer

    def get_serializer_class(self):
        if self.action == 'register':
            return UserRegisterSerializer
        if self.action == 'login':
            return UserLoginSerializer
        if self.action == 'logout':
            return UserLogoutSerializer
        if self.action == 'profile':
            return UserProfileSerializer
        if self.action == 'public_profile':
            return PublicUserProfileSerializer
        return self.serializer_class

    @extend_schema(
        request=UserRegisterSerializer,
        responses={201: UserProfileSerializer}
    )
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def register(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = UserService.register_user(serializer.validated_data)
        response_serializer = UserProfileSerializer(instance=user)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=UserLoginSerializer,
        responses={200: UserLoginResponseSerializer}
    )
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def login(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user, tokens = UserService.login_user(
            user_email=serializer.validated_data['user_email'],
            password=serializer.validated_data['password']
        )

        return Response({
            'access': tokens['access'],
            'refresh': tokens['refresh'],
            'user': UserProfileSerializer(instance=user).data,
        }, status=status.HTTP_200_OK)

    @extend_schema(
        request=UserLogoutSerializer,
        responses={200: None}
    )
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        UserService.logout_user(serializer.validated_data['refresh'])
        return Response(status=status.HTTP_200_OK)

    @extend_schema(
        responses={200: UserProfileSerializer}
    )
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='profile')
    def profile(self, request):
        user = UserService.get_user_profile(request.user)
        serializer = self.get_serializer(instance=user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        responses={200: PublicUserProfileSerializer}
    )
    @action(detail=True, methods=['get'], permission_classes=[AllowAny], url_path='public-profile')
    def public_profile(self, request, user_id=None):
        user = UserService.get_public_user_profile(user_id)
        serializer = self.get_serializer(instance=user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminReputationPolicyView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(responses={200: AdminReputationPolicySerializer})
    def get(self, request):
        config = ReputationService.get_policy_config()
        serializer = AdminReputationPolicySerializer(instance=config)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=AdminReputationPolicySerializer,
        responses={200: AdminReputationPolicySerializer},
    )
    def patch(self, request):
        serializer = AdminReputationPolicySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = ReputationService.update_protected_newcomer_window_hours(
            serializer.validated_data['protected_newcomer_window_hours']
        )
        response_serializer = AdminReputationPolicySerializer(instance=config)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class AdminUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    lookup_field = 'user_id'
    lookup_value_regex = '[0-9a-fA-F-]{36}'
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserListSerializer
    MAX_LIST_LIMIT = 50
    DEFAULT_LIST_LIMIT = 20
    DETAIL_LEDGER_LIMIT = 10

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AdminUserReputationDetailSerializer
        if self.action == 'reputation_override':
            return AdminManualReputationOverrideSerializer
        if self.action == 'activity':
            return AdminActivityTimelineQuerySerializer
        return AdminUserListSerializer

    def get_queryset(self):
        queryset = CustomUser.objects.all().order_by('-user_created_at', 'user_id')
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
        if search:
            queryset = queryset.filter(
                Q(user_name__icontains=search) |
                Q(user_email__icontains=search) |
                Q(user_role__icontains=search)
            )
        return queryset

    def _list_limit(self) -> int:
        try:
            requested_limit = int(self.request.query_params.get('limit', self.DEFAULT_LIST_LIMIT))
        except (TypeError, ValueError):
            requested_limit = self.DEFAULT_LIST_LIMIT
        return max(0, min(requested_limit, self.MAX_LIST_LIMIT))

    @extend_schema(responses={200: AdminUserListSerializer(many=True)})
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())[:self._list_limit()]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(responses={200: AdminUserReputationDetailSerializer})
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            context={'request': request, 'reputation_ledger_limit': self.DETAIL_LEDGER_LIMIT},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=AdminManualReputationOverrideSerializer,
        responses={200: AdminUserReputationDetailSerializer},
    )
    @action(detail=True, methods=['patch'], url_path='reputation-override')
    def reputation_override(self, request, *args, **kwargs):
        target_user = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_user = ReputationService.set_manual_level_override(
            user=target_user,
            manual_level=serializer.validated_data['manual_reputation_level'],
            actor=request.user,
            note=serializer.validated_data['note'],
        )
        response_serializer = AdminUserReputationDetailSerializer(
            updated_user,
            context={'request': request, 'reputation_ledger_limit': self.DETAIL_LEDGER_LIMIT},
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        parameters=[AdminActivityTimelineQuerySerializer],
        responses={200: AdminActivityTimelineResponseSerializer},
    )
    @action(detail=True, methods=['get'], url_path='activity')
    def activity(self, request, *args, **kwargs):
        target_user = self.get_object()
        query_serializer = self.get_serializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        limit = query_serializer.validated_data['limit']
        activity_types = query_serializer.validated_data['type']
        items = AdminActivityService.timeline(
            user=target_user,
            activity_types=activity_types,
            limit=limit,
        )
        return Response(
            {
                'items': items,
                'count': len(items),
                'limit': limit,
                'available_types': sorted(AdminActivityService.ALLOWED_TYPES),
            },
            status=status.HTTP_200_OK,
        )
