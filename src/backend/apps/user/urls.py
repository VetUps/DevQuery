from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .token_views import SafeTokenRefreshView
from .views import UserViewSet

app_name = 'user'

router = DefaultRouter()
router.register(r'user', UserViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
    path('token/refresh/', SafeTokenRefreshView.as_view(), name='token_refresh'),
]
