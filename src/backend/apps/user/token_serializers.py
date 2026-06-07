# Кратко: проверяет данные и готовит ответы API для пользователей.
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from .models import CustomUser


class SafeTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        """Проверяет связанные поля перед сохранением."""
        try:
            return super().validate(attrs)
        except CustomUser.DoesNotExist as exc:
            raise InvalidToken('User not found') from exc
