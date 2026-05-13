from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.knowledge.models import (
    KnowledgeConcept,
    UserConceptActivity,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    UserKnowledgeGraphSemanticState,
)
from apps.knowledge.semantic_providers import (
    KnowledgeGraphEmbeddingResult,
    KnowledgeGraphGroup,
    KnowledgeGraphGroupingResult,
    KnowledgeGraphProviderMetadata,
)
from apps.knowledge.services.semantic_rebuild_service import run_owner_semantic_boundary
from apps.qa.models import Question


class DeterministicClusteringEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(
        provider='deterministic-clustering-embedding',
        model='embedding-v1',
        dimensions=3,
    )

    BASE_VECTORS = {
        'django': [1.0, 0.0, 0.0],
        'orm': [0.98, 0.02, 0.0],
        'redis': [0.0, 1.0, 0.0],
        'celery': [0.0, 0.98, 0.02],
    }
    MOVED_VECTORS = {
        **BASE_VECTORS,
        'orm': [0.95, 0.05, 0.0],
    }

    def __init__(self, *, moved=False):
        self.moved = moved
        self.requests = []

    def embed(self, request):
        self.requests.append(request)
        table = self.MOVED_VECTORS if self.moved else self.BASE_VECTORS
        vectors = []
        for text in request.texts:
            lowered = text.lower()
            for marker, vector in table.items():
                if f'topic:{marker}' in lowered:
                    vectors.append(vector)
                    break
            else:
                raise AssertionError(f'Missing deterministic vector fixture marker in source text: {text!r}')
        return KnowledgeGraphEmbeddingResult(
            vectors=vectors,
            metadata=self.metadata,
            estimated_tokens=11,
        )


class DriftingGroupingProvider:
    """Provider that deliberately drifts keys, order, and memberships between rebuilds.

    The S02 implementation must use grouping output only as safe text hints; group identity
    and membership are owned by deterministic embedding clustering/reuse.
    """

    metadata = KnowledgeGraphProviderMetadata(provider='drifting-grouping', model='grouping-v1')

    def __init__(self):
        self.calls = 0
        self.requests = []

    def group(self, request):
        self.calls += 1
        self.requests.append(request)
        slugs = sorted(concept['slug'] for concept in request.concepts)
        if self.calls % 2:
            groups = [
                KnowledgeGraphGroup(
                    group_key='provider-random-alpha',
                    label='Server topics',
                    concept_slugs=[slug for slug in ['celery-clustering', 'django-clustering'] if slug in slugs],
                    rationale='Safe but intentionally irrelevant provider grouping.',
                    confidence=0.66,
                ),
                KnowledgeGraphGroup(
                    group_key='provider-random-beta',
                    label='Persistence topics',
                    concept_slugs=[slug for slug in ['redis-clustering', 'orm-clustering'] if slug in slugs],
                    rationale='Safe but intentionally irrelevant provider grouping.',
                    confidence=0.64,
                ),
            ]
        else:
            groups = [
                KnowledgeGraphGroup(
                    group_key='provider-random-gamma',
                    label='Provider reordered topics',
                    concept_slugs=[slug for slug in ['orm-clustering', 'redis-clustering'] if slug in slugs],
                    rationale='Safe but intentionally irrelevant provider grouping.',
                    confidence=0.63,
                ),
                KnowledgeGraphGroup(
                    group_key='provider-random-delta',
                    label='Provider shuffled topics',
                    concept_slugs=[slug for slug in ['django-clustering', 'celery-clustering'] if slug in slugs],
                    rationale='Safe but intentionally irrelevant provider grouping.',
                    confidence=0.62,
                ),
            ]
        return KnowledgeGraphGroupingResult(groups=groups, metadata=self.metadata, estimated_tokens=5)


@override_settings(
    DJANGO_TEST_SQLITE=True,
    KNOWLEDGE_GRAPH_AI_ENABLED=True,
    KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
    KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
    KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='test-key',
    KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
    KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-v1',
    KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER='fake',
    KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
    KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
    KNOWLEDGE_GRAPH_CHAT_API_KEY='test-key',
    KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
    KNOWLEDGE_GRAPH_CHAT_MODEL='grouping-v1',
    KNOWLEDGE_GRAPH_CHAT_PROVIDER='fake',
    KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    KNOWLEDGE_GRAPH_GIGACHAT_AUTH_URL=None,
    KNOWLEDGE_GRAPH_GIGACHAT_VERIFY_SSL_CERTS=True,
)
class SemanticGroupDeterministicClusteringContractTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='semantic-clustering-owner@example.com',
            user_name='semantic-clustering-owner',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        self.concepts = {
            'django': KnowledgeConcept.objects.create(slug='django-clustering', name='Django Clustering'),
            'orm': KnowledgeConcept.objects.create(slug='orm-clustering', name='ORM Clustering'),
            'redis': KnowledgeConcept.objects.create(slug='redis-clustering', name='Redis Clustering'),
            'celery': KnowledgeConcept.objects.create(slug='celery-clustering', name='Celery Clustering'),
        }
        self.questions = {
            marker: self._add_question_activity(marker, concept)
            for marker, concept in self.concepts.items()
        }

    def _add_question_activity(self, marker, concept):
        question = Question.objects.create(
            user=self.user,
            question_title=f'topic:{marker} semantic clustering fixture',
            question_body=f'Public fixture body for topic:{marker}.',
        )
        UserConceptActivity.objects.create(
            user=self.user,
            concept=concept,
            activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            weight_delta=Decimal('1.0000'),
            source=UserConceptActivity.Source.QUESTION,
            source_content_type=self.question_content_type,
            source_object_id=question.pk,
            related_question=question,
            idempotency_key=f'm017-s02-clustering:{marker}:{question.pk}',
        )
        return question

    def _run_rebuild(self, *, embedding_provider, grouping_provider):
        return run_owner_semantic_boundary(
            self.user,
            source_provider_factory=lambda _config: embedding_provider,
            grouping_provider_factory=lambda _config: grouping_provider,
        )

    def _active_group_signatures(self):
        signatures = []
        groups = (
            UserKnowledgeGraphSemanticGroup.objects.filter(
                user=self.user,
                lifecycle_status=UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE,
            )
            .prefetch_related('memberships__concept')
            .order_by('group_key')
        )
        for group in groups:
            signatures.append(
                {
                    'id': group.pk,
                    'group_key': group.group_key,
                    'status': group.lifecycle_status,
                    'slugs': tuple(
                        group.memberships.order_by('rank', 'concept__slug').values_list('concept__slug', flat=True)
                    ),
                    'ranks': tuple(group.memberships.order_by('rank', 'concept__slug').values_list('rank', flat=True)),
                    'evidence': group.evidence,
                }
            )
        return signatures

    def _assert_deterministic_state_counters(
        self,
        state,
        *,
        group_count,
        member_count,
        created_count,
        reused_count,
        changed_count,
        snapshot_count,
    ):
        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(state['semantic_group_count'], group_count)
        self.assertEqual(state['semantic_group_membership_count'], member_count)
        self.assertEqual(state['changed_source_count'], changed_count)
        self.assertEqual(state['persisted_snapshot_count'], snapshot_count)
        self.assertIn('semantic_group_created_count', state)
        self.assertIn('semantic_group_reused_count', state)
        self.assertIn('semantic_group_archived_count', state)
        self.assertEqual(state['semantic_group_created_count'], created_count)
        self.assertEqual(state['semantic_group_reused_count'], reused_count)


    def test_semantic_group_deterministic_reuse_fields_have_safe_additive_defaults(self):
        group = UserKnowledgeGraphSemanticGroup.objects.create(
            user=self.user,
            provider='deterministic-clustering-embedding',
            model='embedding-v1',
            group_key='safe-defaults-group',
            label='Safe defaults group',
            description='',
            rationale='',
            confidence=Decimal('1.0000'),
            generated_at=timezone.now(),
        )

        self.assertEqual(group.centroid_payload, [])
        self.assertEqual(group.member_signature, '')
        self.assertEqual(group.member_slug_signature, '')
        self.assertEqual(group.top_member_slugs, [])
        self.assertEqual(group.reuse_evidence, {})

        group.centroid_payload = {'raw': 'unsafe provider payload'}
        with self.assertRaises(ValidationError):
            group.full_clean()

    def test_unchanged_rebuild_reuses_group_identities_despite_provider_key_and_membership_drift(self):
        embedding_provider = DeterministicClusteringEmbeddingProvider()
        grouping_provider = DriftingGroupingProvider()

        first_state = self._run_rebuild(embedding_provider=embedding_provider, grouping_provider=grouping_provider)
        first_signatures = self._active_group_signatures()

        self.assertEqual(len(first_signatures), 2)
        self.assertEqual(
            sorted(signature['slugs'] for signature in first_signatures),
            [('django-clustering', 'orm-clustering'), ('redis-clustering', 'celery-clustering')],
        )
        for signature in first_signatures:
            self.assertNotIn(signature['group_key'], {'provider-random-alpha', 'provider-random-beta'})
            self.assertEqual(signature['status'], UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
            self.assertIn('deterministic_clustering', signature['evidence'])
        self._assert_deterministic_state_counters(
            first_state,
            group_count=2,
            member_count=4,
            created_count=2,
            reused_count=0,
            changed_count=4,
            snapshot_count=4,
        )

        second_state = self._run_rebuild(embedding_provider=embedding_provider, grouping_provider=grouping_provider)
        second_signatures = self._active_group_signatures()

        self.assertEqual(second_signatures, first_signatures)
        self.assertEqual(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.user).count(), 2)
        self.assertEqual(UserKnowledgeGraphSemanticGroupMembership.objects.filter(group__user=self.user).count(), 4)
        self.assertEqual(len(embedding_provider.requests), 1)
        self._assert_deterministic_state_counters(
            second_state,
            group_count=2,
            member_count=4,
            created_count=0,
            reused_count=2,
            changed_count=0,
            snapshot_count=0,
        )

    def test_controlled_vector_change_only_changes_impacted_group_and_reuses_compatible_group(self):
        initial_grouping_provider = DriftingGroupingProvider()
        initial_state = self._run_rebuild(
            embedding_provider=DeterministicClusteringEmbeddingProvider(),
            grouping_provider=initial_grouping_provider,
        )
        self._assert_deterministic_state_counters(
            initial_state,
            group_count=2,
            member_count=4,
            created_count=2,
            reused_count=0,
            changed_count=4,
            snapshot_count=4,
        )
        before_by_members = {signature['slugs']: signature for signature in self._active_group_signatures()}
        stable_before = before_by_members[('redis-clustering', 'celery-clustering')]
        impacted_before = before_by_members[('django-clustering', 'orm-clustering')]

        orm_question = self.questions['orm']
        orm_question.question_body = 'Public fixture body for topic:orm after controlled semantic move.'
        orm_question.save(update_fields=['question_body'])

        changed_grouping_provider = DriftingGroupingProvider()
        changed_state = self._run_rebuild(
            embedding_provider=DeterministicClusteringEmbeddingProvider(moved=True),
            grouping_provider=changed_grouping_provider,
        )
        after_signatures = self._active_group_signatures()
        after_by_members = {signature['slugs']: signature for signature in after_signatures}

        self.assertEqual(len(after_signatures), 2)
        self.assertIn(('django-clustering', 'orm-clustering'), after_by_members)
        self.assertIn(('redis-clustering', 'celery-clustering'), after_by_members)
        self.assertEqual(after_by_members[('redis-clustering', 'celery-clustering')], stable_before)
        self.assertEqual(after_by_members[('django-clustering', 'orm-clustering')]['id'], impacted_before['id'])
        self.assertEqual(after_by_members[('django-clustering', 'orm-clustering')]['group_key'], impacted_before['group_key'])
        self.assertNotEqual(after_by_members[('django-clustering', 'orm-clustering')]['evidence'], impacted_before['evidence'])
        self.assertEqual(
            UserKnowledgeGraphSemanticGroup.objects.filter(
                user=self.user,
                lifecycle_status=UserKnowledgeGraphSemanticGroup.LifecycleStatus.STALE,
            ).count(),
            0,
        )
        self._assert_deterministic_state_counters(
            changed_state,
            group_count=2,
            member_count=4,
            created_count=0,
            reused_count=2,
            changed_count=1,
            snapshot_count=1,
        )

    def test_member_move_reuses_existing_groups_by_centroid_and_member_overlap(self):
        initial_state = self._run_rebuild(
            embedding_provider=DeterministicClusteringEmbeddingProvider(),
            grouping_provider=DriftingGroupingProvider(),
        )
        self._assert_deterministic_state_counters(
            initial_state,
            group_count=2,
            member_count=4,
            created_count=2,
            reused_count=0,
            changed_count=4,
            snapshot_count=4,
        )
        before_by_id = {signature['id']: signature for signature in self._active_group_signatures()}

        orm_question = self.questions['orm']
        orm_question.question_body = 'Public fixture body for topic:orm after moving into queue/cache cluster.'
        orm_question.save(update_fields=['question_body'])

        moved_provider = DeterministicClusteringEmbeddingProvider(moved=True)
        moved_provider.MOVED_VECTORS = {
            **DeterministicClusteringEmbeddingProvider.BASE_VECTORS,
            'orm': [0.0, 0.97, 0.03],
        }
        moved_state = self._run_rebuild(
            embedding_provider=moved_provider,
            grouping_provider=DriftingGroupingProvider(),
        )
        after_signatures = self._active_group_signatures()

        self.assertEqual({signature['id'] for signature in after_signatures}, set(before_by_id))
        self.assertEqual({signature['group_key'] for signature in after_signatures}, {signature['group_key'] for signature in before_by_id.values()})
        self.assertEqual(
            sorted(signature['slugs'] for signature in after_signatures),
            [('django-clustering',), ('redis-clustering', 'celery-clustering', 'orm-clustering')],
        )
        for group in UserKnowledgeGraphSemanticGroup.objects.filter(user=self.user):
            self.assertEqual(group.lifecycle_status, UserKnowledgeGraphSemanticGroup.LifecycleStatus.ACTIVE)
            self.assertEqual(group.reuse_evidence['deterministic_match'], 'centroid_member_overlap')
            self.assertGreaterEqual(group.reuse_evidence['member_overlap'], 0.5)
        self._assert_deterministic_state_counters(
            moved_state,
            group_count=2,
            member_count=4,
            created_count=0,
            reused_count=2,
            changed_count=1,
            snapshot_count=1,
        )
        self.assertEqual(moved_state['semantic_group_changed_count'], 2)
