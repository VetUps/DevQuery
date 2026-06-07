from __future__ import annotations

from decimal import Decimal
from unittest.mock import Mock

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.knowledge.models import KnowledgeConcept, UserConceptActivity, UserKnowledgeGraphSemanticState
from apps.knowledge.semantic_providers import (
    KnowledgeGraphEmbeddingResult,
    KnowledgeGraphProviderError,
    KnowledgeGraphProviderMalformedResponse,
    KnowledgeGraphProviderMetadata,
    KnowledgeGraphProviderTimeout,
)
from apps.knowledge.services.semantic_rebuild_service import run_owner_semantic_boundary
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


SEMANTIC_ENABLED_SETTINGS = {
    'DJANGO_TEST_SQLITE': True,
    'KNOWLEDGE_GRAPH_AI_ENABLED': True,
    'KNOWLEDGE_GRAPH_AI_DRY_RUN': False,
    'KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP': 100.0,
    'KNOWLEDGE_GRAPH_EMBEDDING_API_KEY': 'test-key',
    'KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL': 'https://example.test/embeddings',
    'KNOWLEDGE_GRAPH_EMBEDDING_MODEL': 'snapshot-model',
    'KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS': 3,
    'KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS': 0.0,
    'KNOWLEDGE_GRAPH_CHAT_API_KEY': 'test-key',
    'KNOWLEDGE_GRAPH_CHAT_BASE_URL': 'https://example.test/chat',
    'KNOWLEDGE_GRAPH_CHAT_MODEL': 'grouping-model',
    'KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS': 0.0,
}


class RecordingEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(provider='recording-embedding', model='snapshot-model', dimensions=3)

    def __init__(self, vectors=None):
        self.requests = []
        self._vectors = vectors

    def embed(self, request):
        self.requests.append(request)
        vectors = self._vectors
        if vectors is None:
            vectors = [[1.0, 0.0, 0.0] for _ in request.texts]
        return KnowledgeGraphEmbeddingResult(
            vectors=vectors,
            metadata=self.metadata,
            estimated_tokens=11 * len(request.texts),
        )


class SequentialEmbeddingProvider(RecordingEmbeddingProvider):
    def __init__(self, vector_batches):
        super().__init__()
        self._vector_batches = list(vector_batches)

    def embed(self, request):
        self.requests.append(request)
        if not self._vector_batches:
            raise AssertionError('unexpected embedding provider call')
        return KnowledgeGraphEmbeddingResult(
            vectors=self._vector_batches.pop(0),
            metadata=self.metadata,
            estimated_tokens=11 * len(request.texts),
        )


class TimeoutEmbeddingProvider(RecordingEmbeddingProvider):
    def embed(self, request):
        self.requests.append(request)
        raise KnowledgeGraphProviderTimeout(
            'unsafe timeout for owner@example.com sk_live_timeout Traceback private body',
            provider='unsafe-provider',
            model='unsafe-model',
            phase='embedding',
        )


class ErrorEmbeddingProvider(RecordingEmbeddingProvider):
    def embed(self, request):
        self.requests.append(request)
        raise KnowledgeGraphProviderError(
            'unsafe provider error owner@example.com sk_live_error Traceback private body',
            provider='unsafe-provider',
            model='unsafe-model',
            phase='embedding',
        )


@override_settings(**SEMANTIC_ENABLED_SETTINGS)
class EmbeddingSnapshotContractTests(TestCase):
    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='snapshot-owner@example.com',
            user_name='snapshot-owner',
            password='not-a-secret',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='snapshot-other@example.com',
            user_name='snapshot-other',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)

    @property
    def Snapshot(self):
        try:
            return apps.get_model('knowledge', 'UserKnowledgeGraphEmbeddingSnapshot')
        except LookupError as exc:
            raise AssertionError('S03 must define UserKnowledgeGraphEmbeddingSnapshot') from exc

    @property
    def Candidate(self):
        try:
            return apps.get_model('knowledge', 'UserKnowledgeGraphSemanticCandidate')
        except LookupError as exc:
            raise AssertionError('S03 must define UserKnowledgeGraphSemanticCandidate') from exc

    def _concept(self, slug: str, name: str | None = None):
        return KnowledgeConcept.objects.create(slug=slug, name=name or slug.title())

    def _question(self, *, user=None, title='How do Django embeddings work?', body=None, tags=('python', 'django')):
        question = Question.objects.create(
            user=user or self.owner,
            question_title=title,
            question_body=body
            or 'Public excerpt about ORM graph semantics. Private tail owner@example.com sk_live_secret must be redacted.',
        )
        for tag_name in tags:
            tag, _ = Tag.objects.get_or_create(name=tag_name, defaults={'questions_count': 1})
            question.tags.add(tag)
        return question

    def _activity(self, question, concept_slug='django'):
        concept, _ = KnowledgeConcept.objects.get_or_create(
            slug=concept_slug,
            defaults={'name': concept_slug.title()},
        )
        return UserConceptActivity.objects.create(
            user=question.user,
            concept=concept,
            activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            weight_delta=Decimal('1.0000'),
            source=UserConceptActivity.Source.QUESTION,
            source_content_type=self.question_content_type,
            source_object_id=question.pk,
            related_question=question,
            idempotency_key=f's03:{question.user_id}:{question.pk}:{concept_slug}',
        )

    def assert_redacted_semantic_payload(self, payload):
        rendered = repr(payload)
        self.assertNotIn('snapshot-owner@example.com', rendered)
        self.assertNotIn('owner@example.com', rendered)
        self.assertNotIn('sk_live_secret', rendered)
        self.assertNotIn('sk_live_error', rendered)
        self.assertNotIn('sk_live_timeout', rendered)
        self.assertNotIn('Private tail', rendered)
        self.assertNotIn('Traceback', rendered)
        self.assertNotIn('source_id', rendered)
        self.assertNotIn('vector', rendered.lower())

    def assert_no_raw_text_is_persisted(self):
        persisted = repr(list(self.Snapshot.objects.values())) + repr(list(self.Candidate.objects.values()))
        self.assertNotIn('Public excerpt about ORM graph semantics', persisted)
        self.assertNotIn('snapshot-owner@example.com', persisted)
        self.assertNotIn('owner@example.com', persisted)
        self.assertNotIn('sk_live_secret', persisted)
        self.assertNotIn('Private tail', persisted)

    def test_canonical_question_sources_hash_and_snapshot_shape_are_persisted_without_raw_text(self):
        question = self._question(tags=('zulu', 'django', 'api'))
        self._activity(question)
        provider = RecordingEmbeddingProvider(vectors=[[0.25, 0.50, 0.75]])

        state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=provider))

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(state['total_source_count'], 1)
        self.assertEqual(state['changed_source_count'], 1)
        self.assertEqual(state['provider_called_source_count'], 1)
        self.assertEqual(state['reused_snapshot_count'], 0)
        self.assertEqual(state['persisted_snapshot_count'], 1)
        self.assertEqual(state['neighbour_candidate_count'], 0)
        self.assertEqual(len(provider.requests), 1)
        [canonical_text] = provider.requests[0].texts
        self.assertIn('How do Django embeddings work?', canonical_text)
        self.assertRegex(canonical_text, r'api.*django.*zulu')
        self.assertIn('Public excerpt about ORM graph semantics', canonical_text)
        self.assertNotIn('sk_live_secret', canonical_text)
        self.assertNotIn('owner@example.com', canonical_text)

        snapshot = self.Snapshot.objects.get(user=self.owner)
        self.assertEqual(snapshot.provider, 'recording-embedding')
        self.assertEqual(snapshot.model, 'snapshot-model')
        self.assertEqual(snapshot.dimensions, 3)
        self.assertEqual(snapshot.source_type, 'question')
        self.assertEqual(str(snapshot.source_id), str(question.pk))
        self.assertRegex(snapshot.content_hash, r'^[0-9a-f]{64}$')
        self.assertEqual(snapshot.vector_payload, [0.25, 0.50, 0.75])
        self.assertIsNotNone(snapshot.generated_at)
        self.assert_no_raw_text_is_persisted()
        self.assert_redacted_semantic_payload(state)

    def test_unchanged_second_rebuild_reuses_snapshots_and_skips_provider_calls(self):
        question = self._question()
        self._activity(question)
        first_provider = RecordingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0]])
        second_factory = Mock(side_effect=AssertionError('unchanged content must not create/call provider'))

        first_state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=first_provider))
        second_state = run_owner_semantic_boundary(self.owner, source_provider_factory=second_factory)

        self.assertEqual(first_state['provider_called_source_count'], 1)
        self.assertEqual(second_state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(second_state['total_source_count'], 1)
        self.assertEqual(second_state['changed_source_count'], 0)
        self.assertEqual(second_state['provider_called_source_count'], 0)
        self.assertEqual(second_state['reused_snapshot_count'], 1)
        self.assertEqual(second_state['persisted_snapshot_count'], 0)
        second_factory.assert_not_called()
        self.assertEqual(self.Snapshot.objects.filter(user=self.owner).count(), 1)
        self.assert_no_raw_text_is_persisted()
        self.assert_redacted_semantic_payload(second_state)

    def test_changed_question_title_body_or_tags_refreshes_only_changed_source_hash(self):
        stable_question = self._question(title='Stable source', tags=('django',))
        changed_question = self._question(title='Changed source before', tags=('python',))
        self._activity(stable_question, 'django')
        self._activity(changed_question, 'python')
        provider = SequentialEmbeddingProvider([
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            [[0.0, 0.8, 0.2]],
        ])

        first_state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=provider))
        first_hashes = set(self.Snapshot.objects.filter(user=self.owner).values_list('content_hash', flat=True))
        changed_question.question_title = 'Changed source after'
        changed_question.question_body = 'Updated public excerpt; unsafe owner@example.com sk_live_changed must not persist.'
        changed_question.save(update_fields=['question_title', 'question_body'])
        tag = Tag.objects.create(name='asyncio', questions_count=1)
        changed_question.tags.add(tag)
        second_state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=provider))

        self.assertEqual(first_state['provider_called_source_count'], 2)
        self.assertEqual(second_state['total_source_count'], 2)
        self.assertEqual(second_state['changed_source_count'], 1)
        self.assertEqual(second_state['provider_called_source_count'], 1)
        self.assertEqual(second_state['reused_snapshot_count'], 1)
        self.assertEqual(second_state['persisted_snapshot_count'], 1)
        self.assertEqual(len(provider.requests), 2)
        self.assertEqual(len(provider.requests[1].texts), 1)
        self.assertIn('Changed source after', provider.requests[1].texts[0])
        self.assertNotIn('Stable source', provider.requests[1].texts[0])
        self.assertEqual(self.Snapshot.objects.filter(user=self.owner).count(), 3)
        self.assertEqual(self.Snapshot.objects.filter(user=self.owner, content_hash__in=first_hashes).count(), 2)
        self.assert_no_raw_text_is_persisted()
        self.assert_redacted_semantic_payload(second_state)

    def test_python_cosine_neighbour_candidates_are_owner_scoped_ranked_and_bounded(self):
        q1 = self._question(title='Django ORM source', tags=('django',))
        q2 = self._question(title='Django API source', tags=('django', 'api'))
        q3 = self._question(title='Vue frontend source', tags=('vue',))
        other_q = self._question(user=self.other_user, title='Other owner source', tags=('django',))
        for question, slug in [(q1, 'django'), (q2, 'api'), (q3, 'vue'), (other_q, 'other')]:
            self._activity(question, slug)
        owner_provider = RecordingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0], [0.9, 0.1, 0.0], [0.0, 1.0, 0.0]])
        other_provider = RecordingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0]])

        state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=owner_provider))
        run_owner_semantic_boundary(self.other_user, source_provider_factory=Mock(return_value=other_provider))

        candidates = list(self.Candidate.objects.filter(user=self.owner).order_by('rank', '-similarity_score'))
        self.assertEqual(state['neighbour_candidate_count'], len(candidates))
        self.assertGreaterEqual(len(candidates), 1)
        self.assertLessEqual(len(candidates), 10)
        self.assertEqual([candidate.rank for candidate in candidates], list(range(1, len(candidates) + 1)))
        self.assertEqual([candidate.similarity_score for candidate in candidates], sorted([c.similarity_score for c in candidates], reverse=True))
        for candidate in candidates:
            self.assertNotEqual(candidate.source_snapshot_id, candidate.target_snapshot_id)
            self.assertEqual(candidate.source_snapshot.user_id, self.owner.pk)
            self.assertEqual(candidate.target_snapshot.user_id, self.owner.pk)
        self.assertFalse(
            self.Candidate.objects.filter(user=self.owner, source_snapshot__user=self.other_user).exists()
        )
        self.assertFalse(
            self.Candidate.objects.filter(user=self.owner, target_snapshot__user=self.other_user).exists()
        )
        self.assert_no_raw_text_is_persisted()
        self.assert_redacted_semantic_payload(state)

    def test_empty_sources_persist_safe_zero_counters_without_provider_or_storage(self):
        provider_factory = Mock(side_effect=AssertionError('empty sources must not call provider factory'))

        state = run_owner_semantic_boundary(self.owner, source_provider_factory=provider_factory)

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.EMPTY)
        self.assertEqual(state['total_source_count'], 0)
        self.assertEqual(state['changed_source_count'], 0)
        self.assertEqual(state['provider_called_source_count'], 0)
        self.assertEqual(state['reused_snapshot_count'], 0)
        self.assertEqual(state['persisted_snapshot_count'], 0)
        self.assertEqual(state['neighbour_candidate_count'], 0)
        provider_factory.assert_not_called()
        self.assertFalse(self.Snapshot.objects.filter(user=self.owner).exists())
        self.assertFalse(self.Candidate.objects.filter(user=self.owner).exists())
        self.assert_redacted_semantic_payload(state)

    def test_budget_exceeded_stops_before_provider_and_leaves_no_snapshots_or_candidates(self):
        question = self._question()
        self._activity(question)
        provider_factory = Mock(side_effect=AssertionError('budget failure must not call provider factory'))

        with self.settings(KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.000001, KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=100.0):
            state = run_owner_semantic_boundary(self.owner, source_provider_factory=provider_factory)

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.BUDGET_EXCEEDED)
        self.assertEqual(state['reason_code'], 'budget_exceeded')
        self.assertEqual(state['phase'], 'budget')
        self.assertEqual(state['provider_called_source_count'], 0)
        provider_factory.assert_not_called()
        self.assertFalse(self.Snapshot.objects.filter(user=self.owner).exists())
        self.assertFalse(self.Candidate.objects.filter(user=self.owner).exists())
        self.assert_redacted_semantic_payload(state)

    def test_unchanged_sources_are_budgeted_as_zero_before_provider_factory(self):
        question = self._question()
        self._activity(question)
        first_provider = RecordingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0]])
        first_state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=first_provider))
        provider_factory = Mock(side_effect=AssertionError('unchanged budget pass must not call provider factory'))

        with self.settings(KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.000001, KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=100.0):
            second_state = run_owner_semantic_boundary(self.owner, source_provider_factory=provider_factory)

        self.assertEqual(first_state['provider_called_source_count'], 1)
        self.assertEqual(second_state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(second_state['changed_source_count'], 0)
        self.assertEqual(second_state['provider_called_source_count'], 0)
        self.assertEqual(second_state['estimated_token_count'], 0)
        provider_factory.assert_not_called()
        self.assertEqual(self.Snapshot.objects.filter(user=self.owner).count(), 1)
        self.assert_redacted_semantic_payload(second_state)

    def test_zero_norm_vectors_are_snapshotted_but_excluded_from_neighbour_candidates(self):
        q1 = self._question(title='Zero norm source', tags=('django',))
        q2 = self._question(title='Nonzero API source', tags=('api',))
        q3 = self._question(title='Nonzero Python source', tags=('python',))
        for question, slug in [(q1, 'zero'), (q2, 'api'), (q3, 'python')]:
            self._activity(question, slug)
        provider = RecordingEmbeddingProvider(vectors=[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])

        state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=provider))

        zero_snapshot = self.Snapshot.objects.get(user=self.owner, source_id=str(q1.pk))
        self.assertEqual(state['persisted_snapshot_count'], 3)
        self.assertFalse(self.Candidate.objects.filter(source_snapshot=zero_snapshot).exists())
        self.assertFalse(self.Candidate.objects.filter(target_snapshot=zero_snapshot).exists())
        self.assert_redacted_semantic_payload(state)

    def test_malformed_vectors_are_redacted_and_do_not_leave_partial_active_storage(self):
        cases = [
            ('empty vectors', []),
            ('wrong count', [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]),
            ('wrong dimensions', [[1.0, 0.0]]),
            ('non numeric', [[1.0, 'NaN', 0.0]]),
            ('duplicate vectors', [[1.0, 0.0, 0.0], [1.0, 0.0, 0.0]]),
        ]
        for label, vectors in cases:
            with self.subTest(label=label):
                self.Snapshot.objects.all().delete()
                self.Candidate.objects.all().delete()
                UserConceptActivity.objects.all().delete()
                question = self._question(title=f'Malformed {label}', tags=('django',))
                self._activity(question, f'django-{label.replace(" ", "-")}')
                provider = RecordingEmbeddingProvider(vectors=vectors)

                state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=provider))

                self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.MALFORMED_RESPONSE)
                self.assertEqual(state['reason_code'], 'malformed_response')
                self.assertEqual(state['phase'], 'embedding')
                self.assertEqual(state['persisted_snapshot_count'], 0)
                self.assertEqual(state['neighbour_candidate_count'], 0)
                self.assertFalse(self.Snapshot.objects.filter(user=self.owner).exists())
                self.assertFalse(self.Candidate.objects.filter(user=self.owner).exists())
                self.assert_redacted_semantic_payload(state)

    def test_provider_timeout_and_error_are_redacted_and_leave_base_snapshots_inactive(self):
        for provider_class, expected_status in [
            (TimeoutEmbeddingProvider, UserKnowledgeGraphSemanticState.Status.TIMEOUT),
            (ErrorEmbeddingProvider, UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR),
        ]:
            with self.subTest(expected_status=expected_status):
                self.Snapshot.objects.all().delete()
                self.Candidate.objects.all().delete()
                UserConceptActivity.objects.all().delete()
                question = self._question(title=f'Failure {expected_status}', tags=('django',))
                self._activity(question, f'failure-{expected_status}')
                provider = provider_class()

                state = run_owner_semantic_boundary(self.owner, source_provider_factory=Mock(return_value=provider))

                self.assertEqual(state['status'], expected_status)
                self.assertEqual(state['reason_code'], expected_status)
                self.assertEqual(state['provider_called_source_count'], 1)
                self.assertEqual(state['persisted_snapshot_count'], 0)
                self.assertEqual(state['neighbour_candidate_count'], 0)
                self.assertFalse(self.Snapshot.objects.filter(user=self.owner).exists())
                self.assertFalse(self.Candidate.objects.filter(user=self.owner).exists())
                self.assert_redacted_semantic_payload(state)
