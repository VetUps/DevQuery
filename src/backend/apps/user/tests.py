from django.test import TestCase

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
