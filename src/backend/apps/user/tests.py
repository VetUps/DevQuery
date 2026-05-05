from django.contrib import admin
from django.test import TestCase
from rest_framework.test import APIClient

from apps.user.models import CustomUser, ReputationLevelThreshold, ReputationTransaction
from apps.user.serializers import PublicUserProfileSerializer, UserProfileSerializer, UserRegisterSerializer


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


class ReputationSerializerTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='reputation@example.com',
            user_name='reputation_user',
            password='password123',
        )
        self.user.user_reputation_score = 125
        self.user.manual_reputation_level = CustomUser.ReputationLevel.MASTER
        self.user.save(update_fields=['user_reputation_score', 'manual_reputation_level'])
        self.actor = CustomUser.objects.create_user(
            user_email='admin@example.com',
            user_name='admin_user',
            password='password123',
        )

    def create_transaction(self, amount, reason=ReputationTransaction.TransactionReason.ADMIN_ADJUSTMENT):
        return ReputationTransaction.objects.create(
            user=self.user,
            actor=self.actor,
            reputation_transaction_amount=amount,
            reputation_transaction_reason=reason,
            note='Visible admin explanation',
        )

    def test_private_profile_includes_progress_override_and_bounded_ledger(self):
        for index in range(12):
            self.create_transaction(index + 1)

        data = UserProfileSerializer(self.user).data

        self.assertEqual(data['user_reputation_score'], 125)
        self.assertEqual(data['reputation']['score'], 125)
        self.assertEqual(data['reputation']['level'], CustomUser.ReputationLevel.MASTER)
        self.assertTrue(data['reputation']['is_manual_override'])
        self.assertEqual(data['reputation']['manual_level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(len(data['reputation_ledger']), 10)
        self.assertEqual(
            set(data['reputation_ledger'][0].keys()),
            {'id', 'amount', 'reason', 'note', 'actor_name', 'created_at'},
        )
        self.assertNotIn('content_type', data['reputation_ledger'][0])
        self.assertNotIn('object_id', data['reputation_ledger'][0])

    def test_public_profile_exposes_compact_reputation_without_override_or_ledger(self):
        self.create_transaction(5)

        data = PublicUserProfileSerializer(self.user).data

        self.assertEqual(data['reputation']['score'], 125)
        self.assertEqual(data['reputation']['level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(
            set(data['reputation'].keys()),
            {'score', 'level', 'level_label', 'next_level', 'points_to_next_level'},
        )
        self.assertNotIn('manual_level', data['reputation'])
        self.assertNotIn('is_manual_override', data['reputation'])
        self.assertNotIn('reputation_ledger', data)
        self.assertNotIn('user_email', data)

    def test_private_ledger_limit_can_be_lowered_for_callers(self):
        for index in range(3):
            self.create_transaction(index + 1)

        data = UserProfileSerializer(self.user, context={'reputation_ledger_limit': 2}).data

        self.assertEqual(len(data['reputation_ledger']), 2)


class ReputationAdminTests(TestCase):
    def test_reputation_models_are_registered_for_admin_inspection(self):
        self.assertIn(CustomUser, admin.site._registry)
        self.assertIn(ReputationLevelThreshold, admin.site._registry)
        self.assertIn(ReputationTransaction, admin.site._registry)
