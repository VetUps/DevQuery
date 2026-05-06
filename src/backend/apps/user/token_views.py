from rest_framework_simplejwt.views import TokenRefreshView

from .token_serializers import SafeTokenRefreshSerializer


class SafeTokenRefreshView(TokenRefreshView):
    serializer_class = SafeTokenRefreshSerializer
