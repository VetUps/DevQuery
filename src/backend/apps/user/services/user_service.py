# Кратко: держит основную логику этого файла.
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth import authenticate
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import CustomUser


class UserService:
    @staticmethod
    def register_user(validated_data: dict) -> CustomUser:
        """Обрабатывает register пользователя."""
        validated_data = validated_data.copy()
        validated_data.pop('password_confirm', None)
        return CustomUser.objects.create_user(**validated_data)

    @staticmethod
    def get_tokens_for_user(user: CustomUser) -> dict:
        """Возвращает данные tokens for пользователя."""
        refresh = RefreshToken.for_user(user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }

    @staticmethod
    def get_user_profile(user: CustomUser) -> CustomUser:
        """Возвращает данные пользователя профиля."""
        return user

    @staticmethod
    def get_public_user_profile(user_id: str) -> CustomUser:
        """Возвращает данные public пользователя профиля."""
        try:
            return CustomUser.objects.get(user_id=user_id, is_active=True)
        except (CustomUser.DoesNotExist, DjangoValidationError, ValueError):
            raise NotFound('Пользователь не найден')

    @staticmethod
    def login_user(user_email: str, password: str) -> tuple[CustomUser, dict]:
        """Обрабатывает login пользователя."""
        user = authenticate(username=user_email, password=password)

        if not user:
            raise ValidationError('Неверные учётные данные')

        if not user.is_active:
            raise PermissionDenied('Аккаунт заблокирован')

        tokens = UserService.get_tokens_for_user(user)
        return user, tokens

    @staticmethod
    def logout_user(refresh_token: str) -> None:
        """Обрабатывает logout пользователя."""
        try:
            refresh = RefreshToken(refresh_token)
            refresh.blacklist()
        except TokenError as exc:
            raise ValidationError('Токен не существует/истёк/запрещён')
