from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from .serializers import (
    UserRegisterSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    PublicUserProfileSerializer,
    UserLoginResponseSerializer,
    UserLogoutSerializer,
)
from .services.user_service import UserService


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
