from unittest.mock import Mock, patch

from django.apps import apps
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import UserConceptActivity, UserKnowledgeGraphSemanticState, UserKnowledgeGraphState
from apps.knowledge.semantic_providers import KnowledgeGraphEmbeddingResult, KnowledgeGraphProviderMetadata
from apps.knowledge.services import mark_user_graph_failed, sync_question_graph
from apps.qa.models import Question, Solution, Tag
from apps.user.models import CustomUser


UNSAFE_ERROR = (
    'activity write failed for api-owner@example.com '
    'body=private answer body token=sk_live_123 raw_events=[secret] '
    'Traceback apps/knowledge/services/activity_service.py'
)


class APISemanticEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(provider='api-recording-embedding', model='api-snapshot-model', dimensions=3)

    def __init__(self):
        self.requests = []

    def embed(self, request):
        self.requests.append(request)
        return KnowledgeGraphEmbeddingResult(
            vectors=[[1.0, 0.0, 0.0] for _ in request.texts],
            metadata=self.metadata,
            estimated_tokens=5 * len(request.texts),
        )


class KnowledgeGraphRebuildAPITests(APITestCase):
    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='api-owner@example.com',
            user_name='api-owner',
            password='not-a-secret',
        )
        self.other_user = CustomUser.objects.create_user(
            user_email='api-other@example.com',
            user_name='api-other',
            password='not-a-secret',
        )
        self.tag = Tag.objects.create(name='django', questions_count=1)

    def _create_question_with_graph(self, *, author=None, title='How do API graph rebuilds work?'):
        question = Question.objects.create(
            user=author if author is not None else self.owner,
            question_title=title,
            question_body='Private question body must never appear in rebuild API payloads.',
        )
        question.tags.add(self.tag)
        sync_question_graph(question)
        question.refresh_from_db()
        return question

    def assert_safe_payload(self, payload):
        rendered = repr(payload)
        self.assertNotIn('api-owner@example.com', rendered)
        self.assertNotIn('api-other@example.com', rendered)
        self.assertNotIn('private answer body', rendered)
        self.assertNotIn('Private question body', rendered)
        self.assertNotIn('source_object_id', rendered)
        self.assertNotIn('idempotency_key', rendered)
        self.assertNotIn('raw_events', rendered)
        self.assertNotIn('sk_live_123', rendered)
        self.assertNotIn('vector_payload', rendered)
        self.assertNotIn('content_hash', rendered)
        self.assertNotIn('source_id', rendered)
        self.assertNotIn('Traceback', rendered)
        self.assertNotIn('activity_service.py', rendered)

    def test_anonymous_rebuild_is_denied(self):
        response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_rebuild_ignores_payload_user_id_and_only_rebuilds_request_user(self):
        owner_question = self._create_question_with_graph(author=self.owner)
        other_question = self._create_question_with_graph(author=self.other_user, title='Other user graph source')
        Solution.objects.create(
            user=self.owner,
            question=owner_question,
            solution_body='Owner solution body remains private.',
        )
        Solution.objects.create(
            user=self.other_user,
            question=other_question,
            solution_body='Other solution body remains private.',
        )
        UserConceptActivity.objects.all().delete()
        mark_user_graph_failed(
            self.owner,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
            phase='solution_posting',
            error=RuntimeError(UNSAFE_ERROR),
        )
        mark_user_graph_failed(
            self.other_user,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
            phase='solution_posting',
            error=RuntimeError(UNSAFE_ERROR),
        )
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            '/knowledge-graph/me/rebuild/',
            {'user_id': str(self.other_user.pk), 'unexpected': 'ignored'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertGreater(response.data['processed_questions'], 0)
        self.assertGreater(response.data['processed_activity_sources'], 0)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertTrue(UserConceptActivity.objects.filter(user=self.owner).exists())
        self.assertFalse(UserConceptActivity.objects.filter(user=self.other_user).exists())
        other_state = UserKnowledgeGraphState.objects.get(user=self.other_user)
        self.assertEqual(other_state.status, UserKnowledgeGraphState.Status.FAILED)
        self.assert_safe_payload(response.data)

    def test_successful_rebuild_restores_fresh_state_and_is_idempotent(self):
        question = self._create_question_with_graph(author=self.owner)
        Solution.objects.create(
            user=self.owner,
            question=question,
            solution_body='Owner solution source body remains private.',
        )
        UserConceptActivity.objects.filter(user=self.owner).delete()
        mark_user_graph_failed(
            self.owner,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
            phase='solution_posting',
            error=RuntimeError(UNSAFE_ERROR),
        )
        self.client.force_authenticate(self.owner)

        first_response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')
        first_count = UserConceptActivity.objects.filter(user=self.owner).count()
        second_response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')
        second_count = UserConceptActivity.objects.filter(user=self.owner).count()

        self.assertEqual(first_response.status_code, status.HTTP_200_OK, first_response.data)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK, second_response.data)
        self.assertGreater(first_count, 0)
        self.assertEqual(second_count, first_count)
        self.assertEqual(second_response.data['activity_summary']['created_rows'], 0)
        self.assertEqual(second_response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(second_response.data['state']['stale_reason'], '')
        self.assertEqual(second_response.data['state']['last_error_message'], '')
        self.assertEqual(second_response.data['state']['last_failed_phase'], 'owner_rebuild')
        self.assertIsNotNone(second_response.data['state']['last_rebuild_started_at'])
        self.assertIsNotNone(second_response.data['state']['last_rebuild_finished_at'])
        self.assert_safe_payload(first_response.data)
        self.assert_safe_payload(second_response.data)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=False,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_successful_rebuild_includes_owner_only_disabled_semantic_diagnostics(self):
        question = self._create_question_with_graph(author=self.owner)
        Solution.objects.create(
            user=self.owner,
            question=question,
            solution_body='Owner solution source body remains private.',
        )
        self.client.force_authenticate(self.owner)
        embedding_factory = Mock(side_effect=AssertionError('disabled semantic rebuild must not create providers'))

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            embedding_factory,
        ):
            response = self.client.post(
                '/knowledge-graph/me/rebuild/',
                {'user_id': str(self.other_user.pk)},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.DISABLED)
        self.assertEqual(response.data['semantic']['reason_code'], 'ai_disabled')
        self.assertFalse(response.data['semantic']['enabled'])
        self.assertTrue(response.data['semantic']['dry_run'])
        self.assertGreater(response.data['semantic']['source_item_count'], 0)
        embedding_factory.assert_not_called()
        self.assert_safe_payload(response.data)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_successful_rebuild_triggers_s03_snapshot_storage_and_aggregate_diagnostics(self):
        question = self._create_question_with_graph(author=self.owner)
        Solution.objects.create(
            user=self.owner,
            question=question,
            solution_body='Owner solution source body remains private.',
        )
        self.client.force_authenticate(self.owner)
        provider = APISemanticEmbeddingProvider()

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            Mock(return_value=provider),
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertGreater(response.data['semantic']['total_source_count'], 0)
        self.assertEqual(response.data['semantic']['changed_source_count'], response.data['semantic']['total_source_count'])
        self.assertEqual(response.data['semantic']['provider_called_source_count'], response.data['semantic']['total_source_count'])
        self.assertGreater(response.data['semantic']['persisted_snapshot_count'], 0)
        self.assertIn('neighbour_candidate_count', response.data['semantic'])
        self.assertNotIn('snapshots', response.data['semantic'])
        self.assertNotIn('candidates', response.data['semantic'])
        self.assertNotIn('vectors', response.data['semantic'])
        self.assertGreaterEqual(len(provider.requests), 1)
        Snapshot = apps.get_model('knowledge', 'UserKnowledgeGraphEmbeddingSnapshot')
        self.assertGreater(Snapshot.objects.filter(user=self.owner).count(), 0)
        self.assert_safe_payload(response.data)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.000001,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=100.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=100.0,
    )
    def test_semantic_budget_failure_keeps_base_rebuild_200_and_skips_providers(self):
        question = self._create_question_with_graph(author=self.owner)
        Solution.objects.create(
            user=self.owner,
            question=question,
            solution_body='Owner solution source body remains private.',
        )
        self.client.force_authenticate(self.owner)
        embedding_factory = Mock(side_effect=AssertionError('over-budget semantic rebuild must not create providers'))

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            embedding_factory,
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.BUDGET_EXCEEDED)
        self.assertEqual(response.data['semantic']['reason_code'], 'budget_exceeded')
        self.assertEqual(response.data['semantic']['phase'], 'budget')
        embedding_factory.assert_not_called()
        self.assert_safe_payload(response.data)

    def test_unexpected_semantic_exception_is_redacted_and_does_not_break_base_rebuild(self):
        question = self._create_question_with_graph(author=self.owner)
        Solution.objects.create(
            user=self.owner,
            question=question,
            solution_body='Owner solution source body remains private.',
        )
        self.client.force_authenticate(self.owner)

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.run_owner_semantic_boundary',
            side_effect=RuntimeError(UNSAFE_ERROR),
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR)
        self.assertEqual(response.data['semantic']['reason_code'], 'provider_error')
        self.assertEqual(response.data['semantic']['phase'], 'semantic_boundary')
        self.assert_safe_payload(response.data)

    def test_public_graph_get_does_not_include_semantic_diagnostics_or_create_providers(self):
        self._create_question_with_graph(author=self.owner)
        self.client.force_authenticate(self.other_user)

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            side_effect=AssertionError('public graph GET must not touch semantic providers'),
        ):
            response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/', format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('semantic', response.data)
        self.assertFalse(UserKnowledgeGraphSemanticState.objects.filter(user=self.owner).exists())
        self.assert_safe_payload(response.data)

    def test_empty_owner_graph_rebuild_returns_fresh_zero_summary(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertEqual(response.data['processed_questions'], 0)
        self.assertEqual(response.data['processed_activity_sources'], 0)
        self.assertEqual(response.data['activity_summary']['created_rows'], 0)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertFalse(UserConceptActivity.objects.filter(user=self.owner).exists())
        self.assert_safe_payload(response.data)

    def test_failed_rebuild_returns_safe_error_and_persisted_failed_state(self):
        self._create_question_with_graph(author=self.owner)
        self.client.force_authenticate(self.owner)

        with patch(
            'apps.knowledge.services.lifecycle_service.rebuild_structural_graph',
            side_effect=RuntimeError(UNSAFE_ERROR),
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.data)
        self.assertEqual(response.data['error']['code'], 'knowledge_graph_rebuild_failed')
        self.assertEqual(response.data['error']['message'], 'Knowledge graph rebuild failed.')
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FAILED)
        self.assertEqual(response.data['state']['stale_reason'], UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED)
        self.assertEqual(response.data['state']['last_failed_phase'], 'structural_rebuild')
        self.assertIn('Graph activity rebuild failed', response.data['state']['last_error_message'])
        self.assertIsNotNone(response.data['state']['last_rebuild_started_at'])
        self.assertIsNone(response.data['state']['last_rebuild_finished_at'])
        self.assert_safe_payload(response.data)
