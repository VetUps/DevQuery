from django.test import TestCase
from rest_framework.test import APIClient

from apps.user.models import CustomUser
from apps.user.serializers import UserRegisterSerializer


class UserRegisterSerializerTests(TestCase):
    def setUp(self):
        CustomUser.objects.create_user(
            user_email='existing@example.com',
            user_name='existing_user',
            password='password123',
        )

    def test_rejects_duplicate_user_name(self):
        serializer = UserRegisterSerializer(data={
            'user_name': 'existing_user',
            'user_email': 'new@example.com',
            'password': 'password123',
            'password_confirm': 'password123',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('user_name', serializer.errors)
        self.assertIn('Пользователь с таким логином уже существует', str(serializer.errors['user_name']))

    def test_rejects_duplicate_user_email(self):
        serializer = UserRegisterSerializer(data={
            'user_name': 'new_user',
            'user_email': 'existing@example.com',
            'password': 'password123',
            'password_confirm': 'password123',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('user_email', serializer.errors)
        self.assertIn('Пользователь с такой почтой уже существует', str(serializer.errors['user_email']))


class TokenRefreshTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            user_email='refresh@example.com',
            user_name='refresh_user',
            password='password123',
        )

    def login(self):
        return self.client.post(
            '/user/login/',
            {'user_email': 'refresh@example.com', 'password': 'password123'},
            format='json',
        )

    def test_refresh_returns_new_access_token_for_existing_user(self):
        login_response = self.login()
        self.assertEqual(login_response.status_code, 200, login_response.data)

        response = self.client.post(
            '/token/refresh/',
            {'refresh': login_response.data['refresh']},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)

    def test_refresh_for_deleted_user_returns_401_instead_of_500(self):
        login_response = self.login()
        self.assertEqual(login_response.status_code, 200, login_response.data)
        refresh_token = login_response.data['refresh']
        self.user.delete()

        response = self.client.post('/token/refresh/', {'refresh': refresh_token}, format='json')

        self.assertEqual(response.status_code, 401, response.data)
        self.assertEqual(response.data['code'], 'token_not_valid')
