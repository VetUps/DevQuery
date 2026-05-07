from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .token_views import SafeTokenRefreshView
from .views import AdminReputationPolicyView, AdminUserViewSet, UserViewSet

app_name = 'user'

router = DefaultRouter()
router.register(r'user', UserViewSet, basename='user')
router.register(r'admin-api/users', AdminUserViewSet, basename='admin-users')

urlpatterns = [
    path('', include(router.urls)),
    path('admin-api/reputation-policy/', AdminReputationPolicyView.as_view(), name='admin-reputation-policy'),
    path('token/refresh/', SafeTokenRefreshView.as_view(), name='token_refresh'),
]
