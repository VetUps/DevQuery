# Кратко: держит общие проверки прав доступа.
from rest_framework.permissions import BasePermission
from apps.user.models import CustomUser


class IsAdmin(BasePermission):
    """
    Доступ только для администраторов.
    """

    def has_permission(self, request, view):
        """Проверяет условие для permission."""
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.user_role == CustomUser.Roles.ADMIN_ROLE
        )