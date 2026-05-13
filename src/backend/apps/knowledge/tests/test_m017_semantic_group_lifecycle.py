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
from apps.knowledge.semantic_providers import (
    KnowledgeGraphGroup,
    KnowledgeGraphGroupingResult,
    KnowledgeGraphProviderMalformedResponse,
    KnowledgeGraphProviderMetadata,
)
from apps.knowledge.services.semantic_rebuild_service import _reconcile_semantic_groups


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


@override_settings(DJANGO_TEST_SQLITE=True)
class SemanticGroupLifecycleReconcileTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='semantic-reconcile-owner@example.com',
            user_name='semantic-reconcile-owner',
            password='not-a-secret',
        )
        self.generated_at = timezone.now()
        self.provider = 'grouping-provider'
        self.model = 'grouping-model'
        self.django = KnowledgeConcept.objects.create(slug='django-reconcile', name='Django Reconcile')
        self.python = KnowledgeConcept.objects.create(slug='python-reconcile', name='Python Reconcile')
        self.redis = KnowledgeConcept.objects.create(slug='redis-reconcile', name='Redis Reconcile')

    def concept_summaries(self, *concepts):
        return [
            {
                'slug': concept.slug,
                'name': concept.name,
                'activity_count': 1,
                'candidate_count': 2,
                'max_similarity': '0.90000',
            }
            for concept in concepts
        ]

    def grouping_result(self, *groups):
        return KnowledgeGraphGroupingResult(
            groups=list(groups),
            metadata=KnowledgeGraphProviderMetadata(provider=self.provider, model=self.model),
            estimated_tokens=3,
        )

    def group(self, key, label, slugs):
        return KnowledgeGraphGroup(
            group_key=key,
            label=label,
            concept_slugs=list(slugs),
            rationale='Темы связаны по агрегированным кандидатам графа.',
            confidence=0.9,
        )

    def make_existing_group(self, group_key, *, status=UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE):
        return UserKnowledgeGraphSemanticGroup.objects.create(
            user=self.user,
            provider=self.provider,
            model=self.model,
            group_key=group_key,
            label='Existing group',
            description='Aggregated safe semantic group description.',
            rationale='Existing aggregate grouping rationale.',
            confidence=Decimal('0.7000'),
            evidence={'signals': [{'group_index': 1, 'member_count': 1}]},
            generated_at=self.generated_at,
            first_seen_at=self.generated_at,
            last_seen_at=self.generated_at,
            lifecycle_status=status,
            stale_at=self.generated_at if status == UserKnowledgeGraphSemanticGroup.LifecycleStatus.STALE else None,
            lifecycle_reason_code='provider_missed_group' if status == UserKnowledgeGraphSemanticGroup.LifecycleStatus.STALE else '',
        )

    def add_membership(self, group, concept):
        return UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=group,
            concept=concept,
            rank=1,
            confidence=Decimal('0.7000'),
            evidence={'signals': [{'concept_slug': concept.slug, 'activity_count': 1}]},
        )

    def test_repeated_exact_group_key_rebuild_preserves_database_id_and_replaces_returned_memberships(self):
        first_result = self.grouping_result(self.group('django-patterns', 'Django patterns', [self.django.slug]))
        group_count, member_count = _reconcile_semantic_groups(
            self.user,
            first_result,
            self.concept_summaries(self.django, self.python),
            self.generated_at,
        )
        group = UserKnowledgeGraphSemanticGroup.objects.get(group_key='django-patterns')
        original_pk = group.pk
        self.assertEqual((group_count, member_count), (1, 1))

        second_result = self.grouping_result(self.group('django-patterns', 'Django and Python patterns', [self.django.slug, self.python.slug]))
        later = timezone.now()
        group_count, member_count = _reconcile_semantic_groups(
            self.user,
            second_result,
            self.concept_summaries(self.django, self.python),
            later,
        )

        group.refresh_from_db()
        self.assertEqual(group.pk, original_pk)
        self.assertEqual(group.label, 'Django and Python patterns')
        self.assertEqual(group.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
        self.assertEqual(group.lifecycle_reason_code, '')
        self.assertIsNone(group.stale_at)
        self.assertEqual(group.memberships.count(), 2)
        self.assertEqual((group_count, member_count), (1, 2))

    def test_omitted_prior_active_group_becomes_stale_and_keeps_memberships(self):
        omitted = self.make_existing_group('omitted-group')
        self.add_membership(omitted, self.redis)
        returned = self.make_existing_group('returned-group')
        self.add_membership(returned, self.redis)

        result = self.grouping_result(self.group('returned-group', 'Returned group', [self.django.slug]))
        group_count, member_count = _reconcile_semantic_groups(
            self.user,
            result,
            self.concept_summaries(self.django, self.redis),
            timezone.now(),
        )

        omitted.refresh_from_db()
        returned.refresh_from_db()
        self.assertEqual(omitted.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.STALE)
        self.assertEqual(omitted.lifecycle_reason_code, 'provider_missed_group')
        self.assertIsNotNone(omitted.stale_at)
        self.assertEqual(omitted.memberships.count(), 1)
        self.assertEqual(returned.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
        self.assertEqual(list(returned.memberships.values_list('concept__slug', flat=True)), [self.django.slug])
        self.assertEqual((group_count, member_count), (1, 1))

    def test_returned_stale_group_is_reactivated_without_creating_a_sibling(self):
        stale = self.make_existing_group('stale-group', status=UserKnowledgeGraphSemanticGroup.LifecycleStatus.STALE)
        self.add_membership(stale, self.redis)

        result = self.grouping_result(self.group('stale-group', 'Reactivated group', [self.python.slug]))
        _reconcile_semantic_groups(
            self.user,
            result,
            self.concept_summaries(self.python, self.redis),
            timezone.now(),
        )

        stale.refresh_from_db()
        self.assertEqual(UserKnowledgeGraphSemanticGroup.objects.filter(group_key='stale-group').count(), 1)
        self.assertEqual(stale.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
        self.assertEqual(stale.lifecycle_reason_code, '')
        self.assertIsNone(stale.stale_at)
        self.assertEqual(list(stale.memberships.values_list('concept__slug', flat=True)), [self.python.slug])

    def test_malformed_grouping_result_raises_before_lifecycle_or_membership_mutation(self):
        existing = self.make_existing_group('stable-group')
        self.add_membership(existing, self.redis)
        malformed = self.grouping_result(self.group('bad-group', 'Bad group', ['unknown-reconcile']))

        with self.assertRaises(KnowledgeGraphProviderMalformedResponse):
            _reconcile_semantic_groups(
                self.user,
                malformed,
                self.concept_summaries(self.django),
                timezone.now(),
            )

        existing.refresh_from_db()
        self.assertEqual(existing.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
        self.assertEqual(existing.memberships.count(), 1)
        self.assertFalse(UserKnowledgeGraphSemanticGroup.objects.filter(group_key='bad-group').exists())
