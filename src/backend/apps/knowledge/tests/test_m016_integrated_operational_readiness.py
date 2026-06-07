from decimal import Decimal
from unittest.mock import Mock, patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import (
    QuestionConceptEdge,
    UserKnowledgeGraphEmbeddingSnapshot,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticState,
    UserKnowledgeGraphState,
)
from apps.knowledge.semantic_providers import (
    KnowledgeGraphEmbeddingResult,
    KnowledgeGraphGroup,
    KnowledgeGraphGroupingResult,
    KnowledgeGraphProviderMetadata,
)
from apps.qa.models import Question, Solution, Tag
from apps.user.models import CustomUser


class IntegratedEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(
        provider='integrated-recording-embedding',
        model='integrated-embedding-v1',
        dimensions=3,
    )

    def __init__(self):
        self.requests = []

    def embed(self, request):
        self.requests.append(request)
        vectors = []
        for index, _text in enumerate(request.texts):
            vectors.append([1.0, float(index + 1) / 10.0, float(index + 2) / 10.0])
        return KnowledgeGraphEmbeddingResult(
            vectors=vectors,
            metadata=self.metadata,
            estimated_tokens=11 * len(request.texts),
        )


class IntegratedGroupingProvider:
    metadata = KnowledgeGraphProviderMetadata(
        provider='integrated-recording-grouping',
        model='integrated-grouping-v1',
    )

    def __init__(self):
        self.requests = []

    def group(self, request):
        self.requests.append(request)
        slugs = sorted({concept['slug'] for concept in request.concepts})[:4]
        groups = []
        if len(slugs) >= 2:
            groups.append(
                KnowledgeGraphGroup(
                    group_key='integrated-backend-bridge',
                    label='Integrated backend bridge',
                    concept_slugs=slugs,
                    rationale='Concepts are linked by aggregate semantic neighbours.',
                    confidence=0.91,
                )
            )
        return KnowledgeGraphGroupingResult(
            groups=groups,
            metadata=self.metadata,
            estimated_tokens=7,
        )


@override_settings(DJANGO_TEST_SQLITE=True)
class M016IntegratedOperationalReadinessTests(APITestCase):
    maxDiff = None

    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='integrated-owner@example.com',
            user_name='integrated-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='integrated-viewer@example.com',
            user_name='integrated-viewer',
            password='not-a-secret',
        )
        self.django_tag = Tag.objects.create(name='django', questions_count=2)
        self.rest_tag = Tag.objects.create(name='rest-api', questions_count=1)
        self.python_tag = Tag.objects.create(name='python', questions_count=1)
        self.q_backend = self._question(
            'How do Django REST serializers shape semantic graphs?',
            'PRIVATE BODY integrated-owner@example.com sk_live_integrated source_id vector_payload provider raw output.',
            [self.django_tag, self.rest_tag],
        )
        self.q_python = self._question(
            'How can Python services rebuild graph snapshots safely?',
            'PRIVATE BODY Traceback secret provider stack should never leak through DTOs.',
            [self.django_tag, self.python_tag],
        )
        Solution.objects.create(
            user=self.owner,
            question=self.q_backend,
            solution_body='PRIVATE SOLUTION BODY sk_live_integrated provider raw output must not leak.',
        )

    def _question(self, title, body, tags):
        question = Question.objects.create(
            user=self.owner,
            question_title=title,
            question_body=body,
        )
        question.tags.add(*tags)
        return question

    def assert_no_private_semantic_leakage(self, payload):
        rendered = repr(payload)
        for forbidden in [
            'integrated-owner@example.com',
            'integrated-viewer@example.com',
            'PRIVATE BODY',
            'PRIVATE SOLUTION BODY',
            'sk_live_integrated',
            'Traceback',
            'raw output',
            'vector_payload',
            'content_hash',
            'source_object_id',
            'idempotency_key',
        ]:
            self.assertNotIn(forbidden, rendered)

    def assert_public_payload_omits_owner_semantics(self, payload):
        rendered = repr(payload)
        for forbidden in [
            'semantic_edges',
            'semantic_groups',
            'recommendations',
            'semantic_neighbour',
            'integrated-backend-bridge',
            'Integrated backend bridge',
            'provider_error',
            'semantic_boundary',
            'source_provider',
            'source_model',
            'grouping_provider',
            'grouping_model',
            'vector_payload',
            'content_hash',
            'PRIVATE BODY',
            'PRIVATE SOLUTION BODY',
            'sk_live_integrated',
            'integrated-owner@example.com',
        ]:
            self.assertNotIn(forbidden, rendered)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='integrated-embedding-v1',
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='integrated-grouping-v1',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_owner_rebuild_persists_semantics_and_reads_are_provider_free(self):
        self.client.force_authenticate(self.owner)
        embedding_provider = IntegratedEmbeddingProvider()
        grouping_provider = IntegratedGroupingProvider()

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            Mock(return_value=embedding_provider),
        ) as source_factory, patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider',
            Mock(return_value=grouping_provider),
        ) as grouping_factory:
            rebuild_response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(rebuild_response.status_code, status.HTTP_200_OK, rebuild_response.data)
        self.assertEqual(rebuild_response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        semantic = rebuild_response.data['semantic']
        self.assertEqual(semantic['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertIn(semantic['reason_code'], {'semantic_groups_persisted', 'semantic_candidates_persisted'})
        self.assertEqual(semantic['phase'], 'grouping')
        self.assertGreaterEqual(semantic['total_source_count'], 2)
        self.assertEqual(semantic['changed_source_count'], semantic['total_source_count'])
        self.assertEqual(semantic['provider_called_source_count'], semantic['total_source_count'])
        self.assertGreaterEqual(semantic['persisted_snapshot_count'], 2)
        self.assertGreater(semantic['neighbour_candidate_count'], 0)
        self.assertGreater(semantic['semantic_group_count'], 0)
        self.assertGreater(semantic['semantic_group_membership_count'], 0)
        self.assertNotIn('snapshots', semantic)
        self.assertNotIn('vectors', semantic)
        self.assertNotIn('candidates', semantic)
        self.assertGreaterEqual(UserKnowledgeGraphEmbeddingSnapshot.objects.filter(user=self.owner).count(), 2)
        self.assertGreater(UserKnowledgeGraphSemanticCandidate.objects.filter(user=self.owner).count(), 0)
        self.assertGreater(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).count(), 0)
        self.assertEqual(source_factory.call_count, 1)
        self.assertEqual(grouping_factory.call_count, 1)
        self.assertEqual(len(embedding_provider.requests), 1)
        self.assertEqual(len(grouping_provider.requests), 1)
        self.assert_no_private_semantic_leakage(rebuild_response.data)

        def fail_provider_factory(*args, **kwargs):
            raise AssertionError('owner graph and insights GETs must consume persisted semantic rows only')

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            side_effect=fail_provider_factory,
        ) as read_source_factory, patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider',
            side_effect=fail_provider_factory,
        ) as read_grouping_factory:
            graph_response = self.client.get('/knowledge-graph/me/')
            insights_response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(graph_response.status_code, status.HTTP_200_OK, graph_response.data)
        self.assertEqual(insights_response.status_code, status.HTTP_200_OK, insights_response.data)
        self.assertGreaterEqual(len(graph_response.data['nodes']), 2)
        self.assertGreater(len(graph_response.data['semantic_edges']), 0)
        self.assertGreater(len(graph_response.data['semantic_groups']), 0)
        self.assertGreater(len(graph_response.data['edges']), 0)
        self.assertTrue(all(edge['reason'] == 'shared_question' for edge in graph_response.data['edges']))
        self.assertTrue(all(edge['reason'] == 'semantic_neighbour' for edge in graph_response.data['semantic_edges']))
        self.assertLessEqual(len(insights_response.data['recommendations']), 5)
        self.assertEqual(
            insights_response.data['summary']['recommendation_count'],
            len(insights_response.data['recommendations']),
        )
        self.assertIn(
            'semantic_neighbour_suggests_bridge',
            {item['reason_code'] for item in insights_response.data['recommendations']},
        )
        read_source_factory.assert_not_called()
        read_grouping_factory.assert_not_called()
        self.assert_no_private_semantic_leakage(graph_response.data)
        self.assert_no_private_semantic_leakage(insights_response.data)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=False,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=True,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.0,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_ai_disabled_rebuild_keeps_base_graph_fresh_and_skips_providers(self):
        self.client.force_authenticate(self.owner)
        source_factory = Mock(side_effect=AssertionError('disabled rebuild must not instantiate embedding providers'))
        grouping_factory = Mock(side_effect=AssertionError('disabled rebuild must not instantiate grouping providers'))

        with patch('apps.knowledge.services.semantic_rebuild_service.create_source_provider', source_factory), patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider', grouping_factory
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertGreater(response.data['processed_questions'], 0)
        self.assertGreater(response.data['processed_activity_sources'], 0)
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.DISABLED)
        self.assertEqual(response.data['semantic']['reason_code'], 'ai_disabled')
        self.assertEqual(response.data['semantic']['phase'], 'configuration')
        self.assertFalse(response.data['semantic']['enabled'])
        self.assertTrue(response.data['semantic']['dry_run'])
        source_factory.assert_not_called()
        grouping_factory.assert_not_called()
        self.assert_no_private_semantic_leakage(response.data)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=0.000001,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='integrated-embedding-v1',
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=100.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='integrated-grouping-v1',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=100.0,
    )
    def test_budget_exceeded_rebuild_keeps_base_graph_fresh_and_skips_providers(self):
        self.client.force_authenticate(self.owner)
        source_factory = Mock(side_effect=AssertionError('over-budget rebuild must stop before providers'))
        grouping_factory = Mock(side_effect=AssertionError('over-budget rebuild must stop before grouping providers'))

        with patch('apps.knowledge.services.semantic_rebuild_service.create_source_provider', source_factory), patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider', grouping_factory
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.BUDGET_EXCEEDED)
        self.assertEqual(response.data['semantic']['reason_code'], 'budget_exceeded')
        self.assertEqual(response.data['semantic']['phase'], 'budget')
        self.assertEqual(response.data['semantic']['changed_source_count'], 0)
        source_factory.assert_not_called()
        grouping_factory.assert_not_called()
        self.assert_no_private_semantic_leakage(response.data)

    @override_settings(
        KNOWLEDGE_GRAPH_AI_ENABLED=True,
        KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
        KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
        KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='key',
        KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/embeddings',
        KNOWLEDGE_GRAPH_EMBEDDING_MODEL='integrated-embedding-v1',
        KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
        KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
        KNOWLEDGE_GRAPH_CHAT_API_KEY='key',
        KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/chat',
        KNOWLEDGE_GRAPH_CHAT_MODEL='integrated-grouping-v1',
        KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    )
    def test_public_user_and_question_graphs_omit_persisted_semantic_rows_and_private_text(self):
        self.client.force_authenticate(self.owner)
        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            Mock(return_value=IntegratedEmbeddingProvider()),
        ), patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider',
            Mock(return_value=IntegratedGroupingProvider()),
        ):
            rebuild_response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')
        self.assertEqual(rebuild_response.status_code, status.HTTP_200_OK, rebuild_response.data)
        self.assertGreater(UserKnowledgeGraphSemanticCandidate.objects.filter(user=self.owner).count(), 0)
        self.assertGreater(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).count(), 0)

        # Plant unsafe persisted diagnostic text to prove public graph serializers do not expose semantic state internals.
        UserKnowledgeGraphSemanticState.objects.filter(user=self.owner).update(
            last_error_message='provider raw output sk_live_integrated Traceback vector_payload source_id',
            reason_code='provider_error',
            phase='semantic_boundary',
        )

        self.client.force_authenticate(self.viewer)
        public_user_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
        question_response = self.client.get(f'/knowledge-graph/questions/{self.q_backend.pk}/')

        self.assertEqual(public_user_response.status_code, status.HTTP_200_OK, public_user_response.data)
        self.assertEqual(question_response.status_code, status.HTTP_200_OK, question_response.data)
        self.assertFalse(public_user_response.data['viewer']['is_owner'])
        self.assertNotIn('semantic_edges', public_user_response.data)
        self.assertNotIn('semantic_groups', public_user_response.data)
        self.assertNotIn('recommendations', public_user_response.data)
        self.assertNotIn('semantic_edges', question_response.data)
        self.assertNotIn('semantic_groups', question_response.data)
        self.assertNotIn('recommendations', question_response.data)
        self.assert_public_payload_omits_owner_semantics(public_user_response.data)
        self.assert_public_payload_omits_owner_semantics(question_response.data)
        self.assertGreaterEqual(QuestionConceptEdge.objects.filter(question=self.q_backend).count(), 2)
        self.assertEqual(question_response.data['title'], self.q_backend.question_title)
        self.assertNotIn(self.q_backend.question_body, repr(question_response.data))
