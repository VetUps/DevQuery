from decimal import Decimal
from unittest.mock import Mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.knowledge.models import KnowledgeConcept, UserConceptActivity, UserKnowledgeGraphSemanticState, UserKnowledgeGraphState
from apps.knowledge.semantic_providers import (
    KnowledgeGraphEmbeddingResult,
    KnowledgeGraphProviderMalformedResponse,
    KnowledgeGraphProviderMetadata,
    KnowledgeGraphProviderTimeout,
)
from apps.knowledge.services.graph_state_service import get_user_graph_state
from apps.knowledge.services.semantic_rebuild_service import (
    estimate_owner_semantic_rebuild,
    get_owner_semantic_state_payload,
    run_owner_semantic_boundary,
)
from apps.qa.models import Question


class RecordingEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(provider='recording-embedding', model='embedding-v1', dimensions=2)

    def __init__(self):
        self.requests = []

    def embed(self, request):
        self.requests.append(request)
        return KnowledgeGraphEmbeddingResult(
            vectors=[[0.1, 0.2] for _ in request.texts],
            metadata=self.metadata,
            estimated_tokens=7,
        )


class RecordingGroupingProvider:
    metadata = KnowledgeGraphProviderMetadata(provider='recording-grouping', model='grouping-v1')

    def __init__(self):
        self.requests = []

    def group(self, request):
        self.requests.append(request)
        return Mock(groups=[], metadata=self.metadata, estimated_tokens=3)


class MalformedGroupingProvider(RecordingGroupingProvider):
    def group(self, request):
        raise KnowledgeGraphProviderMalformedResponse(
            'Knowledge graph grouping provider returned malformed group output.',
            provider='unsafe-provider',
            model='unsafe-model',
            phase='grouping',
        )


class TimeoutEmbeddingProvider(RecordingEmbeddingProvider):
    def embed(self, request):
        raise KnowledgeGraphProviderTimeout(
            'Knowledge graph embedding provider timed out.',
            provider='unsafe-provider',
            model='unsafe-model',
            phase='embedding',
        )


class UnsafeEmbeddingProvider(RecordingEmbeddingProvider):
    def embed(self, request):
        raise RuntimeError('sk_live_secret user@example.com Traceback private question body 123e4567-e89b-12d3-a456-426614174000')


@override_settings(DJANGO_TEST_SQLITE=True)
class SemanticRebuildBoundaryTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='semantic-owner@example.com',
            user_name='semantic-owner',
            password='not-a-secret',
        )
        self.question = Question.objects.create(
            user=self.user,
            question_title='How do Django graph tokens work?',
            question_body='Private question body with sk_live_secret should never be copied to semantic state.',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)

    def add_activity(self, slug='django', name='Django'):
        concept = KnowledgeConcept.objects.create(slug=slug, name=name)
        return UserConceptActivity.objects.create(
            user=self.user,
            concept=concept,
            activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            weight_delta=Decimal('1.5000'),
            source=UserConceptActivity.Source.QUESTION,
            source_content_type=self.question_content_type,
            source_object_id=self.question.pk,
            related_question=self.question,
            idempotency_key=f'test:{slug}',
        )

    def assert_state_is_redacted(self, state):
        serialized = ' '.join(str(value) for value in state.values())
        self.assertNotIn('sk_live_secret', serialized)
        self.assertNotIn('semantic-owner@example.com', serialized)
        self.assertNotIn('Private question body', serialized)
        self.assertNotIn('Traceback', serialized)
        self.assertNotIn(str(self.question.pk), serialized)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=False,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_disabled_ai_persists_safe_state_without_provider_calls_or_base_graph_failure(self):
        self.add_activity()
        embedding_factory = Mock()
        grouping_factory = Mock()
        base_state = get_user_graph_state(self.user)

        state = run_owner_semantic_boundary(
            self.user,
            source_provider_factory=embedding_factory,
            grouping_provider_factory=grouping_factory,
        )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.DISABLED)
        self.assertEqual(state['reason_code'], 'ai_disabled')
        self.assertFalse(state['enabled'])
        self.assertTrue(state['dry_run'])
        self.assertEqual(state['source_item_count'], 1)
        embedding_factory.assert_not_called()
        grouping_factory.assert_not_called()
        base_state.refresh_from_db()
        self.assertNotEqual(base_state.status, UserKnowledgeGraphState.Status.FAILED)
        self.assert_state_is_redacted(state)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.50,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=1.00,
    )
    def test_dry_run_estimates_budget_and_skips_provider_factories(self):
        self.add_activity(slug='django', name='Django')
        self.add_activity(slug='python', name='Python')
        embedding_factory = Mock()
        grouping_factory = Mock()

        state = run_owner_semantic_boundary(
            self.user,
            source_provider_factory=embedding_factory,
            grouping_provider_factory=grouping_factory,
        )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.DRY_RUN)
        self.assertEqual(state['reason_code'], 'dry_run_only')
        self.assertEqual(state['source_item_count'], 2)
        self.assertGreater(state['estimated_token_count'], 0)
        self.assertGreaterEqual(state['estimated_cost'], Decimal('0.000000'))
        self.assertEqual(state['budget_cap'], Decimal('100.000000'))
        embedding_factory.assert_not_called()
        grouping_factory.assert_not_called()
        self.assert_state_is_redacted(state)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
    )
    def test_empty_owner_graph_persists_empty_state_without_provider_calls(self):
        state = run_owner_semantic_boundary(
            self.user,
            source_provider_factory=Mock(),
            grouping_provider_factory=Mock(),
        )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.EMPTY)
        self.assertEqual(state['source_item_count'], 0)
        self.assertEqual(state['estimated_token_count'], 0)
        self.assertEqual(state['estimated_cost'], Decimal('0.000000'))
        self.assert_state_is_redacted(state)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY=' ',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
    )
    def test_missing_config_persists_safe_configuration_error_before_provider_calls(self):
        self.add_activity()
        embedding_factory = Mock()

        state = run_owner_semantic_boundary(self.user, source_provider_factory=embedding_factory)

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.CONFIGURATION_ERROR)
        self.assertEqual(state['reason_code'], 'configuration_error')
        self.assertEqual(state['phase'], 'configuration')
        self.assertIn('configuration', state['last_error_message'])
        embedding_factory.assert_not_called()
        self.assert_state_is_redacted(state)

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
    def test_budget_exceeded_stops_before_provider_calls(self):
        self.add_activity()
        embedding_factory = Mock()
        grouping_factory = Mock()

        state = run_owner_semantic_boundary(
            self.user,
            source_provider_factory=embedding_factory,
            grouping_provider_factory=grouping_factory,
        )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.BUDGET_EXCEEDED)
        self.assertEqual(state['reason_code'], 'budget_exceeded')
        self.assertEqual(state['phase'], 'budget')
        embedding_factory.assert_not_called()
        grouping_factory.assert_not_called()
        self.assert_state_is_redacted(state)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=1.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=1.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=1.0,
    )
    def test_exact_budget_success_invokes_fakeable_providers_and_persists_only_aggregate_state(self):
        self.add_activity()
        estimate = estimate_owner_semantic_rebuild(self.user)
        with self.settings(KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=float(estimate.estimated_cost)):
            source_provider = RecordingEmbeddingProvider()
            grouping_provider = RecordingGroupingProvider()
            state = run_owner_semantic_boundary(
                self.user,
                source_provider_factory=Mock(return_value=source_provider),
                grouping_provider_factory=Mock(return_value=grouping_provider),
            )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(state['budget_cap'], estimate.estimated_cost)
        self.assertEqual(len(source_provider.requests), 1)
        self.assertEqual(len(grouping_provider.requests), 1)
        self.assert_state_is_redacted(state)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='embedding-model',
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='chat-model',
    )
    def test_provider_timeout_error_and_malformed_output_are_status_mapped_and_redacted(self):
        self.add_activity()
        cases = [
            (Mock(return_value=TimeoutEmbeddingProvider()), Mock(return_value=RecordingGroupingProvider()), 'timeout'),
            (Mock(return_value=UnsafeEmbeddingProvider()), Mock(return_value=RecordingGroupingProvider()), 'provider_error'),
            (Mock(return_value=RecordingEmbeddingProvider()), Mock(return_value=MalformedGroupingProvider()), 'malformed_response'),
        ]

        for embedding_factory, grouping_factory, expected_status in cases:
            with self.subTest(expected_status=expected_status):
                state = run_owner_semantic_boundary(
                    self.user,
                    source_provider_factory=embedding_factory,
                    grouping_provider_factory=grouping_factory,
                )
                self.assertEqual(state['status'], expected_status)
                self.assertEqual(state['reason_code'], expected_status)
                self.assert_state_is_redacted(state)

    def test_owner_semantic_state_serializer_payload_is_owner_only_shape_not_public_graph_shape(self):
        self.add_activity()
        state = run_owner_semantic_boundary(self.user)
        payload = get_owner_semantic_state_payload(self.user)

        self.assertEqual(payload['status'], state['status'])
        self.assertIn('estimated_token_count', payload)
        self.assertNotIn('concepts', payload)
        self.assertNotIn('nodes', payload)
        self.assertNotIn('edges', payload)
        self.assert_state_is_redacted(payload)
