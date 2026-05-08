from rest_framework.permissions import BasePermission
from apps.user.models import CustomUser


class IsAdmin(BasePermission):
    """
    Доступ только для администраторов.
    """

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.user_role == CustomUser.Roles.ADMIN_ROLE
        )