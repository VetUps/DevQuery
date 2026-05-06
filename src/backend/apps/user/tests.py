from django.contrib import admin
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.user.admin import (
    CustomUserAdmin,
    CustomUserAdminForm,
    ReputationPolicyConfigAdminForm,
    ReputationThresholdAdminForm,
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

    def test_apply_manual_override_keeps_score_and_records_audit_transaction(self):
        updated_user = ReputationService.set_manual_level_override(
            user=self.user,
            manual_level=CustomUser.ReputationLevel.MASTER,
            actor=self.actor,
            note='Escalated during moderation review.',
        )

        updated_user.refresh_from_db()
        self.assertEqual(updated_user.user_reputation_score, 30)
        self.assertEqual(updated_user.manual_reputation_level, CustomUser.ReputationLevel.MASTER)

        resolution = ReputationService.resolve_level(user=updated_user)
        self.assertTrue(resolution.is_manual_override)
        self.assertEqual(resolution.value, CustomUser.ReputationLevel.MASTER)
        self.assertEqual(resolution.derived_level, CustomUser.ReputationLevel.PARTICIPANT)

        transaction = ReputationTransaction.objects.get(
            user=updated_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        )
        self.assertEqual(transaction.reputation_transaction_amount, 0)
        self.assertEqual(transaction.actor, self.actor)
        self.assertIn('Новый ручной уровень: Мастер.', transaction.note)
        self.assertIn('Расчетный уровень по очкам: Участник.', transaction.note)
        self.assertIn('Escalated during moderation review.', transaction.note)

    def test_clear_manual_override_keeps_history_and_restores_derived_level(self):
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
        self.assertEqual(updated_user.user_reputation_score, 30)

        progress = ReputationService.get_progress(updated_user)
        self.assertFalse(progress['is_manual_override'])
        self.assertEqual(progress['level'], CustomUser.ReputationLevel.PARTICIPANT)
        self.assertEqual(progress['derived_level'], CustomUser.ReputationLevel.PARTICIPANT)
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
            [0, 0],
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

    def test_admin_save_model_records_override_audit_entry_without_touching_score(self):
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
        self.assertEqual(self.target_user.user_reputation_score, 30)
        self.assertEqual(self.target_user.manual_reputation_level, CustomUser.ReputationLevel.EXPERT)
        audit_entry = ReputationTransaction.objects.get(
            user=self.target_user,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
        )
        self.assertEqual(audit_entry.actor, self.superuser)
        self.assertIn('Temporary expert override.', audit_entry.note)


class ReputationAdminTests(TestCase):
    def test_reputation_models_are_registered_for_admin_inspection(self):
        self.assertIn(CustomUser, admin.site._registry)
        self.assertIn(ReputationLevelThreshold, admin.site._registry)
        self.assertIn(ReputationPolicyConfig, admin.site._registry)
        self.assertIn(ReputationTransaction, admin.site._registry)
