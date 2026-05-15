from django.db.models import Q
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
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
    ReputationLedgerEntrySerializer,
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

    @extend_schema(
        responses={200: PublicUserProfileSerializer(many=True)}
    )
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='top-global')
    def top_global(self, request):
        queryset = CustomUser.objects.filter(is_active=True).order_by('-user_reputation_score')
        
        paginator = PageNumberPagination()
        paginator.page_size = 5
        paginator.page_size_query_param = 'page_size'
        page = paginator.paginate_queryset(queryset, request, view=self)
        if page is not None:
            serializer = PublicUserProfileSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = PublicUserProfileSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        responses={200: PublicUserProfileSerializer(many=True)}
    )
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='top-weekly')
    def top_weekly(self, request):
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Sum, Q, IntegerField
        from django.db.models.functions import Coalesce
        
        seven_days_ago = timezone.now() - timedelta(days=7)
        queryset = CustomUser.objects.filter(is_active=True).annotate(
            weekly_score=Coalesce(
                Sum('reputation_transactions__reputation_transaction_amount', 
                    filter=Q(reputation_transactions__created_at__gte=seven_days_ago)),
                0,
                output_field=IntegerField()
            )
        ).filter(weekly_score__gt=0).order_by('-weekly_score')
        
        paginator = PageNumberPagination()
        paginator.page_size = 5
        paginator.page_size_query_param = 'page_size'
        page = paginator.paginate_queryset(queryset, request, view=self)
        if page is not None:
            serializer = PublicUserProfileSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = PublicUserProfileSerializer(queryset, many=True)
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
        if self.action == 'reputation_ledger':
            return ReputationLedgerEntrySerializer
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
        page = query_serializer.validated_data['page']
        activity_types = query_serializer.validated_data['type']
        items, total_count = AdminActivityService.timeline(
            user=target_user,
            activity_types=activity_types,
            page=page,
            page_size=limit,
        )
        return Response(
            {
                'items': items,
                'count': total_count,
                'page': page,
                'limit': limit,
                'available_types': sorted(AdminActivityService.ALLOWED_TYPES),
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(responses={200: ReputationLedgerEntrySerializer(many=True)})
    @action(detail=True, methods=['get'], url_path='reputation-ledger')
    def reputation_ledger(self, request, *args, **kwargs):
        target_user = self.get_object()
        queryset = target_user.reputation_transactions.select_related('actor').order_by('-created_at')
        
        paginator = PageNumberPagination()
        paginator.page_size = 10
        paginator.page_size_query_param = 'page_size'
        paginator.max_page_size = 50
        
        page = paginator.paginate_queryset(queryset, request, view=self)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
