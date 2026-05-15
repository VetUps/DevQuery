from datetime import timedelta

from django.contrib import admin
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.user.admin import (
    CustomUserAdmin,
    CustomUserAdminForm,
    ReputationPolicyConfigAdminForm,
    ReputationThresholdAdminForm,
)
from apps.qa.models import (
    Comment,
    Question,
    QuestionEditEvent,
    QuestionEditProposal,
    QuestionRevision,
    Solution,
    SolutionEdits,
    Vote,
)
from apps.user.models import CustomUser, ReputationLevelThreshold, ReputationPolicyConfig, ReputationTransaction
from apps.user.serializers import PublicUserProfileSerializer, UserProfileSerializer, UserRegisterSerializer
from apps.user.services.reputation_service import ReputationService


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


class UserRegisterEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_returns_full_profile_contract_after_creating_user(self):
        response = self.client.post(
            '/user/register/',
            {
                'user_name': 'new_user',
                'user_email': 'new@example.com',
                'password': 'password123',
                'password_confirm': 'password123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(CustomUser.objects.filter(user_email='new@example.com').exists())
        self.assertEqual(
            set(response.data.keys()),
            {
                'user_id',
                'user_name',
                'user_email',
                'user_role',
                'user_reputation_score',
                'user_avatar_url',
                'user_bio',
                'user_created_at',
                'reputation',
                'reputation_ledger',
            },
        )
        self.assertEqual(response.data['user_name'], 'new_user')
        self.assertEqual(response.data['user_email'], 'new@example.com')
        self.assertEqual(response.data['user_role'], CustomUser.Roles.USER_ROLE)
        self.assertEqual(response.data['user_reputation_score'], 0)
        self.assertEqual(response.data['reputation']['level'], CustomUser.ReputationLevel.NEWCOMER)
        self.assertEqual(response.data['reputation_ledger'], [])
        self.assertNotIn('password', response.data)
        self.assertNotIn('password_confirm', response.data)


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
            is_staff=True,
        )

    def create_transaction(self, amount, reason=ReputationTransaction.TransactionReason.ADMIN_ADJUSTMENT):
        return ReputationTransaction.objects.create(
            user=self.user,
            actor=self.actor,
            reputation_transaction_amount=amount,
            reputation_transaction_reason=reason,
            note='Visible admin explanation',
        )

    def test_record_transaction_persists_source_reference_for_vote_backed_rewards(self):
        target_user = CustomUser.objects.create_user(
            user_email='rewarded@example.com',
            user_name='rewarded_user',
            password='password123',
        )
        question = target_user.question_set.create(
            question_title='Question source',
            question_body='Question source body',
        )

        transaction = ReputationService.record_transaction(
            user=target_user,
            amount=5,
            reason=ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
            actor=self.actor,
            source=question,
            note='Vote transition reward',
        )

        target_user.refresh_from_db()
        self.assertEqual(target_user.user_reputation_score, 5)
        self.assertEqual(transaction.content_type.model, 'question')
        self.assertEqual(transaction.object_id, question.pk)
        self.assertEqual(transaction.actor, self.actor)

    def test_private_profile_includes_progress_override_and_bounded_ledger(self):
        for index in range(12):
            self.create_transaction(index + 1)

        data = UserProfileSerializer(self.user).data

        self.assertEqual(data['user_reputation_score'], 125)
        self.assertEqual(data['reputation']['score'], 125)
        self.assertEqual(data['reputation']['level'], CustomUser.ReputationLevel.MASTER)
        self.assertTrue(data['reputation']['is_manual_override'])
        self.assertEqual(data['reputation']['manual_level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(data['reputation']['manual_level_label'], CustomUser.ReputationLevel.MASTER.label)
        self.assertEqual(data['reputation']['derived_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(data['reputation']['derived_level_label'], CustomUser.ReputationLevel.EXPERT.label)
        self.assertEqual(data['reputation']['next_level'], CustomUser.ReputationLevel.MASTER)
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


class ReputationConfigurationTests(TestCase):
    def tearDown(self):
        ReputationLevelThreshold.objects.all().delete()
        ReputationPolicyConfig.objects.all().delete()

    def test_defaults_are_deterministic_without_persisted_config(self):
        thresholds = ReputationService._thresholds()

        self.assertEqual(
            {threshold.level: threshold.minimum_score for threshold in thresholds},
            {
                CustomUser.ReputationLevel.NEWCOMER: 0,
                CustomUser.ReputationLevel.PARTICIPANT: 30,
                CustomUser.ReputationLevel.EXPERT: 100,
                CustomUser.ReputationLevel.MASTER: 300,
            },
        )
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), 12)

    def test_live_threshold_update_changes_level_resolution(self):
        ReputationLevelThreshold.objects.filter(level=CustomUser.ReputationLevel.EXPERT).update(minimum_score=80)
        user = CustomUser.objects.create_user(
            user_email='threshold-live@example.com',
            user_name='threshold-live',
            password='password123',
            user_reputation_score=80,
        )

        progress = ReputationService.get_progress(user)

        self.assertEqual(progress['level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(progress['next_level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(progress['points_to_next_level'], 220)

    def test_threshold_model_rejects_non_default_score_for_level(self):
        threshold = ReputationLevelThreshold(
            level=CustomUser.ReputationLevel.EXPERT,
            minimum_score=90,
            is_active=True,
        )

        with self.assertRaises(DjangoValidationError) as context:
            threshold.full_clean()

        self.assertIn('minimum_score', context.exception.message_dict)
        self.assertIn('expert', context.exception.message_dict['minimum_score'][0])
        self.assertIn('100', context.exception.message_dict['minimum_score'][0])

    def test_threshold_admin_form_rejects_missing_required_levels(self):
        ReputationLevelThreshold.objects.filter(level=CustomUser.ReputationLevel.MASTER).delete()
        instance = ReputationLevelThreshold.objects.get(level=CustomUser.ReputationLevel.EXPERT)
        form = ReputationThresholdAdminForm(
            data={
                'level': instance.level,
                'minimum_score': instance.minimum_score,
                'is_active': instance.is_active,
                'description': instance.description,
            },
            instance=instance,
        )

        self.assertFalse(form.is_valid())
        self.assertIn('Не настроены пороги репутации', str(form.non_field_errors()))

    def test_threshold_admin_form_rejects_non_monotonic_thresholds(self):
        participant = ReputationLevelThreshold.objects.get(level=CustomUser.ReputationLevel.PARTICIPANT)
        form = ReputationThresholdAdminForm(
            data={
                'level': participant.level,
                'minimum_score': 100,
                'is_active': True,
                'description': participant.description,
            },
            instance=participant,
        )

        self.assertFalse(form.is_valid())
        self.assertIn('Пороги репутации должны строго возрастать', str(form.non_field_errors()))

    def test_policy_config_model_rejects_non_positive_window(self):
        config = ReputationPolicyConfig(protected_newcomer_window_hours=0)

        with self.assertRaises(DjangoValidationError):
            config.full_clean()

    def test_policy_config_model_rejects_excessive_window(self):
        config = ReputationPolicyConfig(protected_newcomer_window_hours=73)

        with self.assertRaises(DjangoValidationError) as context:
            config.full_clean()

        self.assertIn('protected_newcomer_window_hours', context.exception.message_dict)
        self.assertIn('72', context.exception.message_dict['protected_newcomer_window_hours'][0])

    def test_policy_config_form_rejects_invalid_window_without_partial_mutation(self):
        config = ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=12)
        form = ReputationPolicyConfigAdminForm(
            data={'singleton_key': 'default', 'protected_newcomer_window_hours': 0},
            instance=config,
        )

        self.assertFalse(form.is_valid())
        config.refresh_from_db()
        self.assertEqual(config.protected_newcomer_window_hours, 12)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), 12)

    def test_policy_config_form_rejects_excessive_window_without_partial_mutation(self):
        config = ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=12)
        form = ReputationPolicyConfigAdminForm(
            data={'singleton_key': 'default', 'protected_newcomer_window_hours': 96},
            instance=config,
        )

        self.assertFalse(form.is_valid())
        self.assertIn('protected_newcomer_window_hours', form.errors)
        config.refresh_from_db()
        self.assertEqual(config.protected_newcomer_window_hours, 12)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), 12)

    def test_policy_config_form_accepts_valid_window_update(self):
        config = ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=12)
        form = ReputationPolicyConfigAdminForm(
            data={'singleton_key': 'default', 'protected_newcomer_window_hours': 24},
            instance=config,
        )

        self.assertTrue(form.is_valid(), form.errors)
        saved = form.save()

        self.assertEqual(saved.protected_newcomer_window_hours, 24)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), 24)


class ReputationServiceOverrideTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            user_email='override-target@example.com',
            user_name='override-target',
            password='password123',
            user_reputation_score=30,
        )
        self.actor = CustomUser.objects.create_user(
            user_email='override-admin@example.com',
            user_name='override-admin',
            password='password123',
        )

    def test_apply_manual_override_adjusts_score_and_records_audit_transaction(self):
        updated_user = ReputationService.set_manual_level_override(
            user=self.user,
            manual_level=CustomUser.ReputationLevel.MASTER,
            actor=self.actor,
            note='Escalated during moderation review.',
        )

        updated_user.refresh_from_db()
        self.assertEqual(updated_user.user_reputation_score, 300)
        self.assertEqual(updated_user.manual_reputation_level, CustomUser.ReputationLevel.MASTER)

        resolution = ReputationService.resolve_level(user=updated_user)
        self.assertTrue(resolution.is_manual_override)
        self.assertEqual(resolution.value, CustomUser.ReputationLevel.MASTER)
        self.assertEqual(resolution.derived_level, CustomUser.ReputationLevel.MASTER)

        transaction = ReputationTransaction.objects.get(
            user=updated_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        )
        self.assertEqual(transaction.reputation_transaction_amount, 270)
        self.assertEqual(transaction.actor, self.actor)
        self.assertIn('Новый ручной уровень: Мастер.', transaction.note)
        self.assertIn('Изменение очков: +270.', transaction.note)
        self.assertIn('Escalated during moderation review.', transaction.note)

    def test_clear_manual_override_keeps_history_and_preserves_adjusted_score(self):
        ReputationService.set_manual_level_override(
            user=self.user,
            manual_level=CustomUser.ReputationLevel.MASTER,
            actor=self.actor,
            note='Initial override.',
        )

        updated_user = ReputationService.set_manual_level_override(
            user=self.user,
            manual_level=None,
            actor=self.actor,
            note='Override no longer needed.',
        )

        updated_user.refresh_from_db()
        self.assertIsNone(updated_user.manual_reputation_level)
        self.assertEqual(updated_user.user_reputation_score, 300)

        progress = ReputationService.get_progress(updated_user)
        self.assertFalse(progress['is_manual_override'])
        self.assertEqual(progress['level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(progress['derived_level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(
            ReputationTransaction.objects.filter(
                user=updated_user,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
            ).count(),
            2,
        )
        self.assertEqual(
            list(
                ReputationTransaction.objects.filter(user=updated_user).values_list(
                    'reputation_transaction_amount', flat=True
                )
            ),
            [0, 270],
        )
        latest_transaction = ReputationTransaction.objects.filter(user=updated_user).first()
        self.assertIn('Ручной уровень очищен.', latest_transaction.note)
        self.assertIn('Override no longer needed.', latest_transaction.note)

    def test_invalid_manual_override_level_is_rejected(self):
        with self.assertRaises(ValidationError) as context:
            ReputationService.set_manual_level_override(
                user=self.user,
                manual_level='invalid-level',
                actor=self.actor,
            )

        self.assertIn('manual_reputation_level', context.exception.detail)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.manual_reputation_level)
        self.assertFalse(ReputationTransaction.objects.exists())


class UserProfileRoleContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            user_email='profile-role@example.com',
            user_name='profile-role-user',
            password='password123',
            user_role=CustomUser.Roles.USER_ROLE,
            user_reputation_score=100,
        )

    def test_authenticated_profile_exposes_user_role_without_secrets(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/user/profile/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['user_id'], str(self.user.user_id))
        self.assertEqual(response.data['user_role'], CustomUser.Roles.USER_ROLE)
        self.assertEqual(response.data['reputation']['level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(response.data['reputation']['derived_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertNotIn('password', response.data)
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)

    def test_login_user_profile_contract_exposes_user_role_without_password(self):
        response = self.client.post(
            '/user/login/',
            {'user_email': self.user.user_email, 'password': 'password123'},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['user_role'], CustomUser.Roles.USER_ROLE)
        self.assertEqual(response.data['user']['reputation']['level'], CustomUser.ReputationLevel.EXPERT)
        self.assertNotIn('password', response.data['user'])


class AdminApiBoundaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = CustomUser.objects.create_user(
            user_email='admin-boundary@example.com',
            user_name='admin-boundary',
            password='password123',
            user_role=CustomUser.Roles.ADMIN_ROLE,
        )
        self.regular_user = CustomUser.objects.create_user(
            user_email='regular-boundary@example.com',
            user_name='regular-boundary',
            password='password123',
        )
        self.target_user = CustomUser.objects.create_user(
            user_email='search-target@example.com',
            user_name='search-target',
            password='password123',
            user_role=CustomUser.Roles.USER_ROLE,
            user_reputation_score=125,
            manual_reputation_level=CustomUser.ReputationLevel.MASTER,
        )
        for index in range(12):
            ReputationTransaction.objects.create(
                user=self.target_user,
                actor=self.admin_user,
                reputation_transaction_amount=index + 1,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.ADMIN_ADJUSTMENT,
                note=f'Admin audit note {index}',
            )

    def test_admin_user_list_requires_authentication_and_admin_role(self):
        anonymous_response = self.client.get('/admin-api/users/')
        self.assertEqual(anonymous_response.status_code, 401, anonymous_response.data)

        self.client.force_authenticate(user=self.regular_user)
        forbidden_response = self.client.get('/admin-api/users/')
        self.assertEqual(forbidden_response.status_code, 403, forbidden_response.data)

        self.client.force_authenticate(user=self.admin_user)
        admin_response = self.client.get('/admin-api/users/')
        self.assertEqual(admin_response.status_code, 200, admin_response.data)
        self.assertGreaterEqual(len(admin_response.data), 3)
        self.assertEqual(
            set(admin_response.data[0].keys()),
            {
                'user_id',
                'user_name',
                'user_email',
                'user_role',
                'user_reputation_score',
                'user_created_at',
            },
        )
        self.assertNotIn('password', admin_response.data[0])
        self.assertNotIn('access', admin_response.data[0])
        self.assertNotIn('refresh', admin_response.data[0])

    def test_admin_user_list_search_filters_and_empty_search_is_valid(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get('/admin-api/users/', {'search': 'search-target'})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['user_email'], 'search-target@example.com')

        empty_response = self.client.get('/admin-api/users/', {'search': 'no-such-user'})
        self.assertEqual(empty_response.status_code, 200, empty_response.data)
        self.assertEqual(empty_response.data, [])

    def test_admin_user_detail_exposes_reputation_contract_with_bounded_ledger(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(f'/admin-api/users/{self.target_user.user_id}/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['user_id'], str(self.target_user.user_id))
        self.assertEqual(response.data['user_email'], 'search-target@example.com')
        self.assertEqual(response.data['user_role'], CustomUser.Roles.USER_ROLE)
        self.assertEqual(response.data['user_reputation_score'], 125)
        self.assertEqual(response.data['reputation']['score'], 125)
        self.assertEqual(response.data['reputation']['level'], CustomUser.ReputationLevel.MASTER)
        self.assertTrue(response.data['reputation']['is_manual_override'])
        self.assertEqual(response.data['reputation']['manual_level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(response.data['reputation']['derived_level'], CustomUser.ReputationLevel.EXPERT)
        self.assertEqual(len(response.data['reputation_ledger']), 10)
        self.assertEqual(
            set(response.data['reputation_ledger'][0].keys()),
            {'id', 'amount', 'reason', 'note', 'actor_name', 'created_at'},
        )
        self.assertNotIn('content_type', response.data['reputation_ledger'][0])
        self.assertNotIn('object_id', response.data['reputation_ledger'][0])
        self.assertNotIn('password', response.data)
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)

    def test_admin_reputation_override_applies_level_and_returns_refreshed_detail(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {
                'manual_reputation_level': CustomUser.ReputationLevel.PARTICIPANT,
                'note': 'Temporary downgrade during appeal review.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, 30)
        self.assertEqual(self.target_user.manual_reputation_level, CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(response.data['user_id'], str(self.target_user.user_id))
        self.assertEqual(response.data['user_reputation_score'], 30)
        self.assertEqual(response.data['reputation']['score'], 30)
        self.assertEqual(response.data['reputation']['level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertTrue(response.data['reputation']['is_manual_override'])
        self.assertEqual(response.data['reputation']['manual_level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(response.data['reputation']['derived_level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(len(response.data['reputation_ledger']), 10)
        latest_entry = response.data['reputation_ledger'][0]
        self.assertEqual(latest_entry['amount'], -95)
        self.assertEqual(latest_entry['reason'], ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE)
        self.assertEqual(latest_entry['actor_name'], self.admin_user.user_name)
        self.assertIn('Temporary downgrade during appeal review.', latest_entry['note'])
        self.assertNotIn('content_type', latest_entry)
        self.assertNotIn('object_id', latest_entry)
        self.assertNotIn('password', response.data)
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)

    def test_admin_reputation_override_clears_level_with_null_and_audits_change(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {
                'manual_reputation_level': None,
                'note': 'Appeal review complete.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.target_user.refresh_from_db()
        self.assertIsNone(self.target_user.manual_reputation_level)
        self.assertEqual(self.target_user.user_reputation_score, 125)
        self.assertFalse(response.data['reputation']['is_manual_override'])
        self.assertIsNone(response.data['reputation']['manual_level'])
        self.assertEqual(response.data['reputation']['level'], CustomUser.ReputationLevel.EXPERT)
        latest_transaction = ReputationTransaction.objects.filter(
            user=self.target_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        ).latest('created_at')
        self.assertEqual(latest_transaction.reputation_transaction_amount, 0)
        self.assertEqual(latest_transaction.actor, self.admin_user)
        self.assertIn('Ручной уровень очищен.', latest_transaction.note)
        self.assertIn('Appeal review complete.', latest_transaction.note)

    def test_admin_reputation_override_validates_level_and_note_without_mutation(self):
        self.client.force_authenticate(user=self.admin_user)
        original_score = self.target_user.user_reputation_score
        original_level = self.target_user.manual_reputation_level
        original_count = ReputationTransaction.objects.count()

        invalid_level_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {'manual_reputation_level': 'moderator', 'note': 'Invalid level attempt.'},
            format='json',
        )
        blank_note_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': '   '},
            format='json',
        )
        missing_note_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT},
            format='json',
        )

        self.assertEqual(invalid_level_response.status_code, 400, invalid_level_response.data)
        self.assertIn('manual_reputation_level', invalid_level_response.data)
        self.assertEqual(blank_note_response.status_code, 400, blank_note_response.data)
        self.assertIn('note', blank_note_response.data)
        self.assertEqual(missing_note_response.status_code, 400, missing_note_response.data)
        self.assertIn('note', missing_note_response.data)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, original_score)
        self.assertEqual(self.target_user.manual_reputation_level, original_level)
        self.assertEqual(ReputationTransaction.objects.count(), original_count)

    def test_admin_reputation_override_denies_non_admin_and_unknown_user_without_audit(self):
        original_count = ReputationTransaction.objects.count()

        anonymous_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': 'Unauthorized attempt.'},
            format='json',
        )
        self.assertEqual(anonymous_response.status_code, 401, anonymous_response.data)

        self.client.force_authenticate(user=self.regular_user)
        forbidden_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': 'Unauthorized attempt.'},
            format='json',
        )
        self.assertEqual(forbidden_response.status_code, 403, forbidden_response.data)

        self.client.force_authenticate(user=self.admin_user)
        not_found_response = self.client.patch(
            '/admin-api/users/00000000-0000-0000-0000-000000000000/reputation-override/',
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': 'Missing target.'},
            format='json',
        )
        malformed_response = self.client.patch(
            '/admin-api/users/not-a-uuid/reputation-override/',
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': 'Malformed target.'},
            format='json',
        )

        self.assertEqual(not_found_response.status_code, 404, not_found_response.data)
        self.assertEqual(malformed_response.status_code, 404)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, 125)
        self.assertEqual(self.target_user.manual_reputation_level, CustomUser.ReputationLevel.MASTER)
        self.assertEqual(ReputationTransaction.objects.count(), original_count)

    def test_admin_user_detail_handles_not_found_malformed_and_empty_ledger(self):
        empty_ledger_user = CustomUser.objects.create_user(
            user_email='empty-ledger@example.com',
            user_name='empty-ledger',
            password='password123',
        )
        self.client.force_authenticate(user=self.admin_user)

        not_found_response = self.client.get('/admin-api/users/00000000-0000-0000-0000-000000000000/')
        self.assertEqual(not_found_response.status_code, 404, not_found_response.data)

        malformed_response = self.client.get('/admin-api/users/not-a-uuid/')
        self.assertEqual(malformed_response.status_code, 404)

        empty_ledger_response = self.client.get(f'/admin-api/users/{empty_ledger_user.user_id}/')
        self.assertEqual(empty_ledger_response.status_code, 200, empty_ledger_response.data)
        self.assertEqual(empty_ledger_response.data['reputation_ledger'], [])

    def test_admin_reputation_policy_requires_authentication_and_admin_role(self):
        anonymous_get_response = self.client.get('/admin-api/reputation-policy/')
        self.assertEqual(anonymous_get_response.status_code, 401, anonymous_get_response.data)

        anonymous_patch_response = self.client.patch(
            '/admin-api/reputation-policy/',
            {'protected_newcomer_window_hours': 24},
            format='json',
        )
        self.assertEqual(anonymous_patch_response.status_code, 401, anonymous_patch_response.data)

        self.client.force_authenticate(user=self.regular_user)
        forbidden_get_response = self.client.get('/admin-api/reputation-policy/')
        self.assertEqual(forbidden_get_response.status_code, 403, forbidden_get_response.data)

        forbidden_patch_response = self.client.patch(
            '/admin-api/reputation-policy/',
            {'protected_newcomer_window_hours': 24},
            format='json',
        )
        self.assertEqual(forbidden_patch_response.status_code, 403, forbidden_patch_response.data)

    def test_admin_reputation_policy_returns_default_config_without_threshold_or_secret_fields(self):
        ReputationPolicyConfig.objects.all().delete()
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get('/admin-api/reputation-policy/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            set(response.data.keys()),
            {'protected_newcomer_window_hours', 'max_protected_newcomer_window_hours', 'updated_at'},
        )
        self.assertEqual(
            response.data['protected_newcomer_window_hours'],
            ReputationPolicyConfig.DEFAULT_PROTECTED_NEWCOMER_WINDOW_HOURS,
        )
        self.assertEqual(
            response.data['max_protected_newcomer_window_hours'],
            ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS,
        )
        self.assertIsNone(response.data['updated_at'])
        self.assertNotIn('thresholds', response.data)
        self.assertNotIn('reputation_level_thresholds', response.data)
        self.assertNotIn('singleton_key', response.data)
        self.assertNotIn('created_at', response.data)
        self.assertNotIn('password', response.data)
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)

    def test_admin_reputation_policy_accepts_valid_boundary_updates(self):
        self.client.force_authenticate(user=self.admin_user)

        minimum_response = self.client.patch(
            '/admin-api/reputation-policy/',
            {'protected_newcomer_window_hours': 1},
            format='json',
        )
        self.assertEqual(minimum_response.status_code, 200, minimum_response.data)
        self.assertEqual(minimum_response.data['protected_newcomer_window_hours'], 1)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), 1)
        self.assertIsNotNone(minimum_response.data['updated_at'])

        maximum = ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS
        maximum_response = self.client.patch(
            '/admin-api/reputation-policy/',
            {'protected_newcomer_window_hours': maximum},
            format='json',
        )
        self.assertEqual(maximum_response.status_code, 200, maximum_response.data)
        self.assertEqual(maximum_response.data['protected_newcomer_window_hours'], maximum)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), maximum)

    def test_admin_reputation_policy_rejects_invalid_values_without_mutation(self):
        config = ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=12)
        self.client.force_authenticate(user=self.admin_user)
        invalid_payloads = [
            {},
            {'protected_newcomer_window_hours': '12'},
            {'protected_newcomer_window_hours': 0},
            {'protected_newcomer_window_hours': -1},
            {
                'protected_newcomer_window_hours':
                    ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS + 1,
            },
        ]

        for payload in invalid_payloads:
            response = self.client.patch('/admin-api/reputation-policy/', payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('protected_newcomer_window_hours', response.data)
            config.refresh_from_db()
            self.assertEqual(config.protected_newcomer_window_hours, 12)
            self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), 12)


class AdminApiActivityTimelineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = CustomUser.objects.create_user(
            user_email='activity-admin@example.com',
            user_name='activity-admin',
            password='password123',
            user_role=CustomUser.Roles.ADMIN_ROLE,
        )
        self.regular_user = CustomUser.objects.create_user(
            user_email='activity-regular@example.com',
            user_name='activity-regular',
            password='password123',
        )
        self.target_user = CustomUser.objects.create_user(
            user_email='activity-target@example.com',
            user_name='activity-target',
            password='password123',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='activity-other@example.com',
            user_name='activity-other',
            password='password123',
        )
        self.url = f'/admin-api/users/{self.target_user.user_id}/activity/'

    def _set_timestamp(self, instance, field_name, offset_minutes):
        timestamp = timezone.now() + timedelta(minutes=offset_minutes)
        type(instance).objects.filter(pk=instance.pk).update(**{field_name: timestamp})
        setattr(instance, field_name, timestamp)
        return instance

    def _create_full_activity_fixture(self):
        question = Question.objects.create(
            user=self.target_user,
            question_title='How to bound an admin timeline?',
            question_body='Sensitive question body that must not be returned.',
        )
        self._set_timestamp(question, 'question_created_at', 1)

        other_question = Question.objects.create(
            user=self.other_user,
            question_title='Shared target question',
            question_body='Other body.',
        )
        solution = Solution.objects.create(
            user=self.target_user,
            question=other_question,
            solution_body='Sensitive solution body that must not be returned.',
        )
        self._set_timestamp(solution, 'solution_created_at', 2)

        question_content_type = ContentType.objects.get_for_model(Question)
        comment = Comment.objects.create(
            user=self.target_user,
            content_type=question_content_type,
            object_id=other_question.question_id,
            body='Sensitive comment body that must not be returned.',
        )
        self._set_timestamp(comment, 'created_at', 3)

        vote = Vote.objects.create(
            user=self.target_user,
            content_type=question_content_type,
            object_id=other_question.question_id,
            vote_type=Vote.VoteType.UPVOTE,
        )
        self._set_timestamp(vote, 'created_at', 4)

        solution_edit = SolutionEdits.objects.create(
            solution=solution,
            user=self.target_user,
            solution_edit_body_before='Old sensitive solution body.',
            solution_edit_body_after='New sensitive solution body.',
            solution_edit_is_approved=True,
        )
        self._set_timestamp(solution_edit, 'solution_edit_edited_at', 5)

        question_edit = QuestionEditProposal.objects.create(
            question=question,
            author=self.target_user,
            question_edit_title_before='Old title',
            question_edit_body_before='Old sensitive question body.',
            question_edit_tags_before=['django'],
            question_edit_title_after='New title',
            question_edit_body_after='New sensitive question body.',
            question_edit_tags_after=['django', 'api'],
            question_edit_is_approved=None,
        )
        self._set_timestamp(question_edit, 'question_edit_edited_at', 6)

        revision = QuestionRevision.objects.create(
            question=question,
            actor=self.target_user,
            proposal=question_edit,
            source=QuestionRevision.Source.APPROVED_PROPOSAL,
            title_before='Old title',
            body_before='Old sensitive revision body.',
            tags_before=['django'],
            title_after='New title',
            body_after='New sensitive revision body.',
            tags_after=['django', 'api'],
        )
        self._set_timestamp(revision, 'created_at', 7)

        event = QuestionEditEvent.objects.create(
            question=question,
            actor=self.target_user,
            proposal=question_edit,
            revision=revision,
            event_type=QuestionEditEvent.EventType.APPROVED,
        )
        self._set_timestamp(event, 'created_at', 8)

        reputation = ReputationTransaction.objects.create(
            user=self.target_user,
            actor=None,
            reputation_transaction_amount=5,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
            content_type=question_content_type,
            object_id=question.question_id,
            note='Sensitive reputation note with token=abc123 must not be returned.',
        )
        self._set_timestamp(reputation, 'created_at', 9)

        return {
            'question': question,
            'solution': solution,
            'comment': comment,
            'vote': vote,
            'solution_edit': solution_edit,
            'question_edit_proposal': question_edit,
            'question_revision': revision,
            'question_edit_event': event,
            'reputation': reputation,
        }

    def test_activity_timeline_requires_authentication_and_admin_role(self):
        anonymous_response = self.client.get(self.url)
        self.assertEqual(anonymous_response.status_code, 401, anonymous_response.data)

        self.client.force_authenticate(user=self.regular_user)
        forbidden_response = self.client.get(self.url)
        self.assertEqual(forbidden_response.status_code, 403, forbidden_response.data)

    def test_activity_timeline_returns_all_compact_source_types_newest_first(self):
        self._create_full_activity_fixture()
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 9)
        self.assertEqual(response.data['limit'], 25)
        items = response.data['items']
        self.assertEqual(
            [item['type'] for item in items],
            [
                'reputation',
                'question_edit_event',
                'question_revision',
                'question_edit_proposal',
                'solution_edit',
                'vote',
                'comment',
                'solution',
                'question',
            ],
        )
        occurred_at_values = [item['occurred_at'] for item in items]
        self.assertEqual(occurred_at_values, sorted(occurred_at_values, reverse=True))
        for item in items:
            self.assertEqual(
                set(item.keys()),
                {'id', 'type', 'occurred_at', 'title', 'summary', 'target_label', 'route'},
            )
            self.assertIsInstance(item['route'], dict)

    def test_activity_timeline_filters_by_type_and_returns_empty_state(self):
        self._create_full_activity_fixture()
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(self.url, {'type': ['comment', 'vote']})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual([item['type'] for item in response.data['items']], ['vote', 'comment'])

        empty_user = CustomUser.objects.create_user(
            user_email='activity-empty@example.com',
            user_name='activity-empty',
            password='password123',
        )
        empty_response = self.client.get(f'/admin-api/users/{empty_user.user_id}/activity/')
        self.assertEqual(empty_response.status_code, 200, empty_response.data)
        self.assertEqual(empty_response.data['count'], 0)
        self.assertEqual(empty_response.data['items'], [])

    def test_activity_timeline_validates_unknown_user_limit_and_type(self):
        self.client.force_authenticate(user=self.admin_user)

        not_found_response = self.client.get('/admin-api/users/00000000-0000-0000-0000-000000000000/activity/')
        self.assertEqual(not_found_response.status_code, 404, not_found_response.data)

        malformed_limit_response = self.client.get(self.url, {'limit': 'many'})
        self.assertEqual(malformed_limit_response.status_code, 400, malformed_limit_response.data)
        self.assertIn('limit', malformed_limit_response.data)

        unknown_type_response = self.client.get(self.url, {'type': 'password_reset'})
        self.assertEqual(unknown_type_response.status_code, 400, unknown_type_response.data)
        self.assertIn('type', unknown_type_response.data)

    def test_activity_timeline_clamps_oversized_limit_and_redacts_raw_content(self):
        for index in range(60):
            question = Question.objects.create(
                user=self.target_user,
                question_title=f'Question {index}',
                question_body=f'Full raw body {index} token secret password.',
            )
            self._set_timestamp(question, 'question_created_at', index)
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(self.url, {'limit': 500})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['limit'], 50)
        self.assertEqual(response.data['count'], 50)
        self.assertEqual(len(response.data['items']), 50)
        serialized = str(response.data).lower()
        for forbidden in ['full raw body', 'password', 'token', 'content_type', 'object_id']:
            self.assertNotIn(forbidden, serialized)


class AdminApiIntegratedWorkspaceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = CustomUser.objects.create_user(
            user_email='integrated-admin@example.com',
            user_name='integrated-admin',
            password='password123',
            user_role=CustomUser.Roles.ADMIN_ROLE,
        )
        self.regular_user = CustomUser.objects.create_user(
            user_email='integrated-regular@example.com',
            user_name='integrated-regular',
            password='password123',
        )
        self.target_user = CustomUser.objects.create_user(
            user_email='integrated-target@example.com',
            user_name='integrated-target',
            password='password123',
            user_reputation_score=125,
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='integrated-other@example.com',
            user_name='integrated-other',
            password='password123',
        )
        self.question = Question.objects.create(
            user=self.target_user,
            question_title='Integrated admin timeline proof',
            question_body='Sensitive question body with token=abc123 must stay redacted.',
        )
        self.other_question = Question.objects.create(
            user=self.other_user,
            question_title='Other user timeline item',
            question_body='Other sensitive body.',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        ReputationTransaction.objects.create(
            user=self.target_user,
            actor=self.admin_user,
            reputation_transaction_amount=5,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
            content_type=self.question_content_type,
            object_id=self.question.question_id,
            note='Sensitive audit body with token=abc123 must not leak through activity.',
        )
        ReputationPolicyConfig.objects.create(protected_newcomer_window_hours=12)

    def _assert_redacted_admin_payload(self, payload):
        serialized = str(payload).lower()
        for forbidden in [
            'password',
            'access',
            'refresh',
            'token=abc123',
            'sensitive question body',
            'content_type',
            'object_id',
            'moderation',
            'raw_body',
        ]:
            self.assertNotIn(forbidden, serialized)

    def test_admin_workspace_walkthrough_links_users_override_policy_and_activity(self):
        self.client.force_authenticate(user=self.admin_user)

        list_response = self.client.get('/admin-api/users/', {'search': 'integrated-target'})
        self.assertEqual(list_response.status_code, 200, list_response.data)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]['user_id'], str(self.target_user.user_id))
        self._assert_redacted_admin_payload(list_response.data)

        detail_url = f'/admin-api/users/{self.target_user.user_id}/'
        detail_response = self.client.get(detail_url)
        self.assertEqual(detail_response.status_code, 200, detail_response.data)
        self.assertEqual(detail_response.data['user_reputation_score'], 125)
        self.assertFalse(detail_response.data['reputation']['is_manual_override'])
        self.assertEqual(detail_response.data['reputation']['derived_level'], CustomUser.ReputationLevel.EXPERT)

        original_score = self.target_user.user_reputation_score
        override_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {
                'manual_reputation_level': CustomUser.ReputationLevel.MASTER,
                'note': 'Integrated workspace appeal approval.',
            },
            format='json',
        )
        self.assertEqual(override_response.status_code, 200, override_response.data)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, 300)
        self.assertEqual(self.target_user.manual_reputation_level, CustomUser.ReputationLevel.MASTER)
        self.assertEqual(override_response.data['reputation']['level'], CustomUser.ReputationLevel.MASTER)
        self.assertEqual(override_response.data['reputation']['derived_level'], CustomUser.ReputationLevel.MASTER)
        override_audit = ReputationTransaction.objects.filter(
            user=self.target_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        ).latest('created_at')
        self.assertEqual(override_audit.reputation_transaction_amount, 175)
        self.assertEqual(override_audit.actor, self.admin_user)
        self.assertIn('Integrated workspace appeal approval.', override_audit.note)

        clear_response = self.client.patch(
            f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
            {'manual_reputation_level': None, 'note': 'Integrated workspace appeal closed.'},
            format='json',
        )
        self.assertEqual(clear_response.status_code, 200, clear_response.data)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, 300)
        self.assertIsNone(self.target_user.manual_reputation_level)
        self.assertFalse(clear_response.data['reputation']['is_manual_override'])
        self.assertEqual(clear_response.data['reputation']['level'], CustomUser.ReputationLevel.MASTER)

        refreshed_detail_response = self.client.get(detail_url)
        self.assertEqual(refreshed_detail_response.status_code, 200, refreshed_detail_response.data)
        self.assertEqual(refreshed_detail_response.data['user_reputation_score'], 300)
        self.assertLessEqual(len(refreshed_detail_response.data['reputation_ledger']), 10)
        self.assertEqual(refreshed_detail_response.data['reputation_ledger'][0]['amount'], 0)
        self.assertEqual(
            refreshed_detail_response.data['reputation_ledger'][0]['reason'],
            ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        )

        maximum = ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS
        policy_response = self.client.patch(
            '/admin-api/reputation-policy/',
            {'protected_newcomer_window_hours': maximum},
            format='json',
        )
        self.assertEqual(policy_response.status_code, 200, policy_response.data)
        self.assertEqual(policy_response.data['protected_newcomer_window_hours'], maximum)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), maximum)
        self.assertEqual(
            set(policy_response.data.keys()),
            {'protected_newcomer_window_hours', 'max_protected_newcomer_window_hours', 'updated_at'},
        )

        activity_response = self.client.get(
            f'/admin-api/users/{self.target_user.user_id}/activity/',
            {'type': 'question', 'limit': 10},
        )
        self.assertEqual(activity_response.status_code, 200, activity_response.data)
        self.assertEqual(activity_response.data['count'], 1)
        self.assertEqual(activity_response.data['items'][0]['type'], 'question')
        self.assertEqual(activity_response.data['items'][0]['target_label'], 'Integrated admin timeline proof')
        self.assertNotEqual(activity_response.data['items'][0]['target_label'], self.other_question.question_title)
        self._assert_redacted_admin_payload(activity_response.data)

    def test_admin_workspace_denies_ordinary_and_anonymous_users_across_surfaces(self):
        denial_cases = [
            ('get', '/admin-api/users/', None),
            ('get', f'/admin-api/users/{self.target_user.user_id}/', None),
            (
                'patch',
                f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
                {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': 'Unauthorized attempt.'},
            ),
            ('get', '/admin-api/reputation-policy/', None),
            ('patch', '/admin-api/reputation-policy/', {'protected_newcomer_window_hours': 24}),
            ('get', f'/admin-api/users/{self.target_user.user_id}/activity/', None),
        ]
        original_score = self.target_user.user_reputation_score
        original_manual_level = self.target_user.manual_reputation_level
        original_transaction_count = ReputationTransaction.objects.count()

        for method, url, payload in denial_cases:
            request = getattr(self.client, method)
            if payload is None:
                response = request(url)
            else:
                response = request(url, payload, format='json')
            self.assertEqual(response.status_code, 401, (method, url, response.data))

        self.client.force_authenticate(user=self.regular_user)
        for method, url, payload in denial_cases:
            request = getattr(self.client, method)
            if payload is None:
                response = request(url)
            else:
                response = request(url, payload, format='json')
            self.assertEqual(response.status_code, 403, (method, url, response.data))

        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, original_score)
        self.assertEqual(self.target_user.manual_reputation_level, original_manual_level)
        self.assertEqual(ReputationTransaction.objects.count(), original_transaction_count)

    def test_admin_workspace_invalid_inputs_do_not_mutate_state(self):
        self.client.force_authenticate(user=self.admin_user)
        original_score = self.target_user.user_reputation_score
        original_manual_level = self.target_user.manual_reputation_level
        original_transaction_count = ReputationTransaction.objects.count()
        original_policy_hours = ReputationService.get_protected_newcomer_window_hours()

        invalid_override_payloads = [
            {'manual_reputation_level': 'moderator', 'note': 'Unsupported manual level.'},
            {'manual_reputation_level': CustomUser.ReputationLevel.EXPERT, 'note': '   '},
        ]
        for payload in invalid_override_payloads:
            response = self.client.patch(
                f'/admin-api/users/{self.target_user.user_id}/reputation-override/',
                payload,
                format='json',
            )
            self.assertEqual(response.status_code, 400, response.data)

        invalid_policy_payloads = [
            {'protected_newcomer_window_hours': 0},
            {'protected_newcomer_window_hours': ReputationPolicyConfig.MAX_PROTECTED_NEWCOMER_WINDOW_HOURS + 1},
            {'protected_newcomer_window_hours': True},
        ]
        for payload in invalid_policy_payloads:
            response = self.client.patch('/admin-api/reputation-policy/', payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('protected_newcomer_window_hours', response.data)

        unknown_filter_response = self.client.get(
            f'/admin-api/users/{self.target_user.user_id}/activity/',
            {'type': 'password_reset'},
        )
        self.assertEqual(unknown_filter_response.status_code, 400, unknown_filter_response.data)
        self.assertIn('type', unknown_filter_response.data)

        malformed_limit_response = self.client.get(
            f'/admin-api/users/{self.target_user.user_id}/activity/',
            {'limit': 'not-a-number'},
        )
        self.assertEqual(malformed_limit_response.status_code, 400, malformed_limit_response.data)
        self.assertIn('limit', malformed_limit_response.data)

        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, original_score)
        self.assertEqual(self.target_user.manual_reputation_level, original_manual_level)
        self.assertEqual(ReputationTransaction.objects.count(), original_transaction_count)
        self.assertEqual(ReputationService.get_protected_newcomer_window_hours(), original_policy_hours)

    def test_admin_workspace_activity_items_remain_compact_and_redacted(self):
        Solution.objects.create(
            user=self.target_user,
            question=self.other_question,
            solution_body='Sensitive solution body with token=abc123 must stay redacted.',
        )
        Comment.objects.create(
            user=self.target_user,
            content_type=self.question_content_type,
            object_id=self.question.question_id,
            body='Sensitive comment body with raw moderation details.',
        )
        Vote.objects.create(
            user=self.target_user,
            content_type=self.question_content_type,
            object_id=self.question.question_id,
            vote_type=Vote.VoteType.UPVOTE,
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(f'/admin-api/users/{self.target_user.user_id}/activity/', {'limit': 50})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertGreaterEqual(response.data['count'], 4)
        self.assertEqual(response.data['limit'], 50)
        for item in response.data['items']:
            self.assertEqual(
                set(item.keys()),
                {'id', 'type', 'occurred_at', 'title', 'summary', 'target_label', 'route'},
            )
            self.assertIsInstance(item['route'], dict)
        self._assert_redacted_admin_payload(response.data)


class CustomUserAdminTests(TestCase):
    def setUp(self):
        self.site = admin.site
        self.model_admin = CustomUserAdmin(CustomUser, self.site)
        self.factory = RequestFactory()
        self.superuser = CustomUser.objects.create_superuser(
            user_email='root@example.com',
            user_name='root',
            password='password123',
        )
        self.target_user = CustomUser.objects.create_user(
            user_email='managed@example.com',
            user_name='managed-user',
            password='password123',
            user_reputation_score=30,
        )

    def test_admin_form_exposes_manual_override_note_field(self):
        form = CustomUserAdminForm(instance=self.target_user)

        self.assertIn('manual_override_note', form.fields)

    def test_admin_save_model_records_override_audit_entry_and_adjusts_score(self):
        form = CustomUserAdminForm(
            data={
                'user_email': self.target_user.user_email,
                'user_name': self.target_user.user_name,
                'password': self.target_user.password,
                'user_avatar_url': '',
                'user_bio': '',
                'user_role': self.target_user.user_role,
                'user_reputation_score': self.target_user.user_reputation_score,
                'manual_reputation_level': CustomUser.ReputationLevel.EXPERT,
                'manual_override_note': 'Temporary expert override.',
                'is_active': True,
                'is_staff': False,
                'is_superuser': False,
                'groups': [],
                'user_permissions': [],
            },
            instance=self.target_user,
        )
        self.assertTrue(form.is_valid(), form.errors)

        request = self.factory.post('/admin/user/customuser/')
        request.user = self.superuser
        updated_user = form.save(commit=False)

        self.model_admin.save_model(request, updated_user, form, change=True)

        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.user_reputation_score, 100)
        self.assertEqual(self.target_user.manual_reputation_level, CustomUser.ReputationLevel.EXPERT)
        audit_entry = ReputationTransaction.objects.get(
            user=self.target_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        )
        self.assertEqual(audit_entry.actor, self.superuser)
        self.assertEqual(audit_entry.reputation_transaction_amount, 70)
        self.assertIn('Temporary expert override.', audit_entry.note)


class ReputationAdminTests(TestCase):
    def test_reputation_models_are_registered_for_admin_inspection(self):
        self.assertIn(CustomUser, admin.site._registry)
        self.assertIn(ReputationLevelThreshold, admin.site._registry)
        self.assertIn(ReputationPolicyConfig, admin.site._registry)
        self.assertIn(ReputationTransaction, admin.site._registry)
