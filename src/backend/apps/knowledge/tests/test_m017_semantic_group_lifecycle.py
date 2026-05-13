from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.knowledge.models import (
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    KnowledgeConcept,
)


@override_settings(DJANGO_TEST_SQLITE=True)
class SemanticGroupLifecycleContractTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='semantic-lifecycle-owner@example.com',
            user_name='semantic-lifecycle-owner',
            password='not-a-secret',
        )

    def make_group(self, **overrides):
        values = {
            'user': self.user,
            'provider': 'grouping-provider',
            'model': 'grouping-model',
            'group_key': 'django-patterns',
            'label': 'Django patterns',
            'description': 'Aggregated safe semantic group description.',
            'rationale': 'Safe aggregate grouping rationale.',
            'confidence': Decimal('0.9000'),
            'evidence': {'signals': ['tag_overlap']},
            'generated_at': timezone.now(),
        }
        values.update(overrides)
        return UserKnowledgeGraphSemanticGroup.objects.create(**values)

    def test_new_semantic_groups_default_to_active_lifecycle_with_nullable_timestamps(self):
        group = self.make_group()

        self.assertEqual(group.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
        self.assertEqual(group.lifecycle_reason_code, '')
        self.assertIsNone(group.first_seen_at)
        self.assertIsNone(group.last_seen_at)
        self.assertIsNone(group.stale_at)
        self.assertIsNone(group.archived_at)

        persisted = UserKnowledgeGraphSemanticGroup.objects.values(
            'group_key',
            'lifecycle_status',
            'lifecycle_reason_code',
            'first_seen_at',
            'last_seen_at',
            'stale_at',
            'archived_at',
        ).get(pk=group.pk)
        self.assertEqual(persisted['group_key'], 'django-patterns')
        self.assertEqual(persisted['lifecycle_status'], 'active')
        self.assertEqual(persisted['lifecycle_reason_code'], '')
        self.assertIsNone(persisted['first_seen_at'])
        self.assertIsNone(persisted['last_seen_at'])
        self.assertIsNone(persisted['stale_at'])
        self.assertIsNone(persisted['archived_at'])

    def test_lifecycle_status_persists_all_allowed_values_and_rejects_invalid_values(self):
        now = timezone.now()
        stale_group = self.make_group(
            group_key='stale-group',
            lifecycle_status=UserKnowledgeGraphSemanticGroup.LifecycleStatus.STALE,
            lifecycle_reason_code='provider_missed_group',
            first_seen_at=now,
            last_seen_at=now,
            stale_at=now,
        )
        archived_group = self.make_group(
            group_key='archived-group',
            lifecycle_status=UserKnowledgeGraphSemanticGroup.LifecycleStatus.ARCHIVED,
            lifecycle_reason_code='owner_rebuild_superseded',
            first_seen_at=now,
            last_seen_at=now,
            archived_at=now,
        )

        self.assertEqual(stale_group.lifecycle_status, 'stale')
        self.assertEqual(archived_group.lifecycle_status, 'archived')

        invalid_group = UserKnowledgeGraphSemanticGroup(
            user=self.user,
            provider='grouping-provider',
            model='grouping-model',
            group_key='invalid-group',
            label='Invalid lifecycle group',
            confidence=Decimal('0.5000'),
            evidence={},
            generated_at=now,
            lifecycle_status='deleted',
        )

        with self.assertRaises(ValidationError) as context:
            invalid_group.full_clean()
        self.assertIn('lifecycle_status', context.exception.error_dict)

    def test_lifecycle_reason_code_is_short_safe_code_not_source_or_secret_text(self):
        group = UserKnowledgeGraphSemanticGroup(
            user=self.user,
            provider='grouping-provider',
            model='grouping-model',
            group_key='unsafe-reason',
            label='Unsafe reason group',
            confidence=Decimal('0.5000'),
            evidence={},
            generated_at=timezone.now(),
            lifecycle_reason_code='source_id:sk_live_secret@example.com',
        )

        with self.assertRaises(ValidationError) as context:
            group.full_clean()
        self.assertIn('lifecycle_reason_code', context.exception.error_dict)

    def test_existing_identity_constraint_remains_unchanged_and_lifecycle_index_exists(self):
        constraint = next(
            constraint
            for constraint in UserKnowledgeGraphSemanticGroup._meta.constraints
            if constraint.name == 'unique_ukg_semantic_group'
        )
        self.assertEqual(tuple(constraint.fields), ('user', 'provider', 'model', 'group_key'))

        index_fields_by_name = {
            index.name: tuple(index.fields)
            for index in UserKnowledgeGraphSemanticGroup._meta.indexes
        }
        self.assertEqual(index_fields_by_name['ukgsg_user_provider_idx'], ('user', 'provider', 'model'))
        self.assertEqual(index_fields_by_name['ukgsg_user_generated_idx'], ('user', 'generated_at'))
        self.assertEqual(index_fields_by_name['ukgsg_user_lifecycle_idx'], ('user', 'lifecycle_status'))

    def test_existing_safe_text_and_json_validators_still_reject_private_provider_data(self):
        unsafe_text_group = UserKnowledgeGraphSemanticGroup(
            user=self.user,
            provider='grouping-provider',
            model='grouping-model',
            group_key='unsafe-text',
            label='source_id leaked marker',
            confidence=Decimal('0.5000'),
            evidence={},
            generated_at=timezone.now(),
        )
        with self.assertRaises(ValidationError) as text_context:
            unsafe_text_group.full_clean()
        self.assertIn('label', text_context.exception.error_dict)

        unsafe_json_group = UserKnowledgeGraphSemanticGroup(
            user=self.user,
            provider='grouping-provider',
            model='grouping-model',
            group_key='unsafe-json',
            label='Safe label',
            confidence=Decimal('0.5000'),
            evidence={'source_id': 'private-source-object-id'},
            generated_at=timezone.now(),
        )
        with self.assertRaises(ValidationError) as json_context:
            unsafe_json_group.full_clean()
        self.assertIn('evidence', json_context.exception.error_dict)

        group = self.make_group(group_key='safe-membership-parent')
        concept = KnowledgeConcept.objects.create(slug='django-lifecycle', name='Django Lifecycle')
        unsafe_membership = UserKnowledgeGraphSemanticGroupMembership(
            group=group,
            concept=concept,
            rank=1,
            confidence=Decimal('0.7000'),
            evidence={'summary': 'vector_payload should never be stored here'},
        )
        with self.assertRaises(ValidationError) as membership_context:
            unsafe_membership.full_clean()
        self.assertIn('evidence', membership_context.exception.error_dict)
