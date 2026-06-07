from unittest.mock import Mock, patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import (
    UserKnowledgeGraphEmbeddingSnapshot,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    UserKnowledgeGraphSemanticState,
    UserKnowledgeGraphState,
)
from apps.knowledge.semantic_providers import (
    KnowledgeGraphEmbeddingResult,
    KnowledgeGraphGroup,
    KnowledgeGraphGroupingResult,
    KnowledgeGraphProviderMetadata,
    KnowledgeGraphProviderTimeout,
)
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class ReadinessEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(
        provider='m017-readiness-embedding-provider-must-not-leak',
        model='m017-readiness-embedding-model-must-not-leak',
        dimensions=3,
    )

    VECTORS = {
        'django': [1.0, 0.0, 0.0],
        'orm': [0.98, 0.02, 0.0],
        'redis': [0.0, 1.0, 0.0],
        'celery': [0.0, 0.98, 0.02],
    }

    def __init__(self):
        self.requests = []

    def embed(self, request):
        self.requests.append(request)
        vectors = []
        for text in request.texts:
            lowered = text.lower()
            for marker, vector in self.VECTORS.items():
                if f'topic:{marker}' in lowered:
                    vectors.append(vector)
                    break
            else:
                raise AssertionError(f'Missing deterministic topic marker in source text: {text!r}')
        return KnowledgeGraphEmbeddingResult(
            vectors=vectors,
            metadata=self.metadata,
            estimated_tokens=9 * len(request.texts),
        )


class TimeoutReadinessEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(
        provider='timeout-provider-must-not-leak',
        model='timeout-model-must-not-leak',
        dimensions=3,
    )

    def embed(self, request):
        raise KnowledgeGraphProviderTimeout(
            'timeout for m017-readiness-owner@example.com body=PRIVATE_SOURCE_TEXT '
            'source_id=abcdef1234567890abcdef1234567890 token=sk_live_readiness Traceback provider.py',
            provider=self.metadata.provider,
            model=self.metadata.model,
            phase='embedding',
        )


class DriftingReadinessGroupingProvider:
    metadata = KnowledgeGraphProviderMetadata(
        provider='m017-readiness-grouping-provider-must-not-leak',
        model='m017-readiness-grouping-model-must-not-leak',
    )

    def __init__(self, *, variant='first'):
        self.variant = variant
        self.requests = []

    def group(self, request):
        self.requests.append(request)
        slugs = {concept['slug'] for concept in request.concepts}
        if self.variant == 'first':
            group_specs = [
                ('provider-random-alpha', 'Readiness server topics', ['m017-celery-readiness', 'm017-django-readiness']),
                ('provider-random-beta', 'Readiness persistence topics', ['m017-orm-readiness', 'm017-redis-readiness']),
            ]
        else:
            group_specs = [
                ('provider-random-gamma', 'Readiness reordered topics', ['m017-orm-readiness', 'm017-redis-readiness']),
                ('provider-random-delta', 'Readiness shuffled topics', ['m017-django-readiness', 'm017-celery-readiness']),
            ]
        groups = [
            KnowledgeGraphGroup(
                group_key=key,
                label=label,
                concept_slugs=[slug for slug in wanted if slug in slugs],
                rationale='Safe aggregate grouping rationale for readiness validation.',
                confidence=0.73,
            )
            for key, label, wanted in group_specs
            if any(slug in slugs for slug in wanted)
        ]
        return KnowledgeGraphGroupingResult(groups=groups, metadata=self.metadata, estimated_tokens=7)


@override_settings(
    DJANGO_TEST_SQLITE=True,
    KNOWLEDGE_GRAPH_AI_ENABLED=True,
    KNOWLEDGE_GRAPH_AI_DRY_RUN=False,
    KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP=100.0,
    KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER='fake',
    KNOWLEDGE_GRAPH_EMBEDDING_API_KEY='test-key',
    KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL='https://example.test/m017-readiness/embeddings',
    KNOWLEDGE_GRAPH_EMBEDDING_MODEL='m017-readiness-embedding-model-must-not-leak',
    KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS=3,
    KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS=0.0,
    KNOWLEDGE_GRAPH_CHAT_PROVIDER='fake',
    KNOWLEDGE_GRAPH_CHAT_API_KEY='test-key',
    KNOWLEDGE_GRAPH_CHAT_BASE_URL='https://example.test/m017-readiness/chat',
    KNOWLEDGE_GRAPH_CHAT_MODEL='m017-readiness-grouping-model-must-not-leak',
    KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS=0.0,
    KNOWLEDGE_GRAPH_GIGACHAT_AUTH_URL=None,
    KNOWLEDGE_GRAPH_GIGACHAT_VERIFY_SSL_CERTS=True,
)
class M017IntegratedReadinessGateTests(APITestCase):
    maxDiff = None

    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='m017-readiness-owner@example.com',
            user_name='m017-readiness-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='m017-readiness-viewer@example.com',
            user_name='m017-readiness-viewer',
            password='not-a-secret',
        )
        self.tags = {
            marker: Tag.objects.create(name=f'm017-{marker}-readiness', questions_count=1)
            for marker in ('django', 'orm', 'redis', 'celery')
        }
        self.questions = {
            marker: self._question(marker, tag)
            for marker, tag in self.tags.items()
        }

    def _question(self, marker, tag):
        question = Question.objects.create(
            user=self.owner,
            question_title=f'topic:{marker} M017 readiness semantic source',
            question_body=(
                f'PRIVATE_SOURCE_TEXT topic:{marker} m017-readiness-owner@example.com '
                'source_id=abcdef1234567890abcdef1234567890 token=sk_live_readiness '
                'raw vector_payload prompt Traceback provider.py must not serialize.'
            ),
        )
        question.tags.add(tag)
        return question

    def _post_rebuild(self, *, embedding_provider, grouping_provider, expected_status=status.HTTP_200_OK):
        self.client.force_authenticate(self.owner)
        source_factory = Mock(return_value=embedding_provider)
        grouping_factory = Mock(return_value=grouping_provider)
        with patch('apps.knowledge.services.semantic_rebuild_service.create_source_provider', source_factory), patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider', grouping_factory
        ):
            response = self.client.post('/knowledge-graph/me/rebuild/', {}, format='json')
        self.assertEqual(response.status_code, expected_status, response.data)
        return response, source_factory, grouping_factory

    def _active_group_signatures(self):
        signatures = []
        groups = (
            UserKnowledgeGraphSemanticGroup.objects.filter(
                user=self.owner,
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
                    'slugs': tuple(
                        group.memberships.order_by('rank', 'concept__slug').values_list('concept__slug', flat=True)
                    ),
                    'member_slug_signature': group.member_slug_signature,
                    'top_member_slugs': tuple(group.top_member_slugs),
                }
            )
        return signatures

    def _stable_group_snapshot(self):
        return [
            (
                group.pk,
                group.group_key,
                group.lifecycle_status,
                tuple(group.memberships.order_by('rank', 'concept__slug').values_list('concept__slug', flat=True)),
            )
            for group in UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).order_by('group_key')
        ]

    def assert_success_counters(self, semantic, *, created, reused, changed, persisted, changed_sources):
        self.assertEqual(semantic['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(semantic['reason_code'], 'semantic_groups_persisted')
        self.assertEqual(semantic['phase'], 'grouping')
        self.assertEqual(semantic['enabled'], True)
        self.assertEqual(semantic['dry_run'], False)
        self.assertEqual(semantic['semantic_group_count'], 2)
        self.assertEqual(semantic['semantic_group_membership_count'], 4)
        self.assertEqual(semantic['semantic_group_created_count'], created)
        self.assertEqual(semantic['semantic_group_reused_count'], reused)
        self.assertEqual(semantic['semantic_group_changed_count'], changed)
        self.assertEqual(semantic['persisted_snapshot_count'], persisted)
        self.assertEqual(semantic['changed_source_count'], changed_sources)
        self.assertEqual(semantic['provider_called_source_count'], changed_sources)
        self.assertGreater(semantic['neighbour_candidate_count'], 0)
        self.assertNotIn('source_provider', semantic)
        self.assertNotIn('source_model', semantic)
        self.assertNotIn('grouping_provider', semantic)
        self.assertNotIn('grouping_model', semantic)
        self.assertNotIn('vectors', repr(semantic))
        self.assertNotIn('snapshots', repr(semantic))

    def assert_no_private_semantic_leakage(self, payload):
        rendered = repr(payload)
        for forbidden in (
            'm017-readiness-owner@example.com',
            'm017-readiness-viewer@example.com',
            'PRIVATE_SOURCE_TEXT',
            'abcdef1234567890abcdef1234567890',
            'sk_live_readiness',
            'source_id',
            'vector_payload',
            'prompt',
            'Traceback',
            'provider.py',
            'raw vector',
            'm017-readiness-embedding-provider-must-not-leak',
            'm017-readiness-embedding-model-must-not-leak',
            'm017-readiness-grouping-provider-must-not-leak',
            'm017-readiness-grouping-model-must-not-leak',
            'timeout-provider-must-not-leak',
            'timeout-model-must-not-leak',
        ):
            self.assertNotIn(forbidden, rendered)

    def assert_public_omits_owner_semantic_fields(self, payload):
        for forbidden_key in ('semantic', 'semantic_graph', 'semantic_groups', 'semantic_edges'):
            self.assertNotIn(forbidden_key, payload)
        rendered = repr(payload)
        for forbidden in (
            'reuse_evidence',
            'lifecycle_status',
            'semantic-cluster-',
            'provider_error',
            'timeout-provider-must-not-leak',
            'timeout-model-must-not-leak',
        ):
            self.assertNotIn(forbidden, rendered)
        self.assert_no_private_semantic_leakage(payload)

    def test_integrated_backend_semantic_readiness_contract(self):
        first_embedding = ReadinessEmbeddingProvider()
        first_grouping = DriftingReadinessGroupingProvider(variant='first')
        first_response, first_source_factory, first_grouping_factory = self._post_rebuild(
            embedding_provider=first_embedding,
            grouping_provider=first_grouping,
        )

        self.assertEqual(first_response.data['state']['status'], UserKnowledgeGraphState.Status.FRESH)
        self.assert_success_counters(
            first_response.data['semantic'],
            created=2,
            reused=0,
            changed=0,
            persisted=4,
            changed_sources=4,
        )
        self.assertEqual(first_source_factory.call_count, 1)
        self.assertEqual(first_grouping_factory.call_count, 1)
        self.assertEqual(len(first_embedding.requests), 1)
        self.assertEqual(len(first_grouping.requests), 1)
        first_signatures = self._active_group_signatures()
        self.assertEqual(len(first_signatures), 2)
        self.assertEqual(
            {frozenset(signature['slugs']) for signature in first_signatures},
            {
                frozenset(('m017-celery-readiness', 'm017-redis-readiness')),
                frozenset(('m017-django-readiness', 'm017-orm-readiness')),
            },
        )
        self.assertTrue(all(not signature['group_key'].startswith('provider-random-') for signature in first_signatures))
        self.assertEqual(UserKnowledgeGraphEmbeddingSnapshot.objects.filter(user=self.owner).count(), 4)
        self.assertGreater(UserKnowledgeGraphSemanticCandidate.objects.filter(user=self.owner).count(), 0)
        self.assertEqual(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).count(), 2)
        self.assertEqual(UserKnowledgeGraphSemanticGroupMembership.objects.filter(group__user=self.owner).count(), 4)
        self.assert_no_private_semantic_leakage(first_response.data)

        second_grouping = DriftingReadinessGroupingProvider(variant='second')
        second_response, second_source_factory, second_grouping_factory = self._post_rebuild(
            embedding_provider=Mock(side_effect=AssertionError('unchanged rebuild must reuse snapshots')),
            grouping_provider=second_grouping,
        )

        self.assert_success_counters(
            second_response.data['semantic'],
            created=0,
            reused=2,
            changed=0,
            persisted=0,
            changed_sources=0,
        )
        self.assertEqual(second_source_factory.call_count, 0)
        self.assertEqual(second_grouping_factory.call_count, 1)
        self.assertEqual(len(second_grouping.requests), 1)
        self.assertEqual(self._active_group_signatures(), first_signatures)
        self.assert_no_private_semantic_leakage(second_response.data)

        before_failure = self._stable_group_snapshot()
        changed_question = self.questions['django']
        changed_question.question_body = (
            'PRIVATE_SOURCE_TEXT topic:django changed m017-readiness-owner@example.com '
            'source_id=abcdef1234567890abcdef1234567890 token=sk_live_readiness Traceback provider.py'
        )
        changed_question.save(update_fields=['question_body'])

        failure_response, failure_source_factory, failure_grouping_factory = self._post_rebuild(
            embedding_provider=TimeoutReadinessEmbeddingProvider(),
            grouping_provider=Mock(side_effect=AssertionError('embedding timeout must stop before grouping')),
        )
        failure_semantic = failure_response.data['semantic']
        self.assertEqual(failure_semantic['status'], UserKnowledgeGraphSemanticState.Status.TIMEOUT)
        self.assertEqual(failure_semantic['reason_code'], 'timeout')
        self.assertEqual(failure_semantic['phase'], 'embedding')
        self.assertEqual(failure_semantic['last_error_message'], 'Knowledge graph semantic provider timed out.')
        self.assertEqual(failure_semantic['semantic_group_count'], 2)
        self.assertEqual(failure_semantic['semantic_group_membership_count'], 4)
        self.assertEqual(failure_semantic['changed_source_count'], 1)
        self.assertEqual(failure_semantic['provider_called_source_count'], 1)
        self.assertEqual(self._stable_group_snapshot(), before_failure)
        self.assertEqual(failure_source_factory.call_count, 1)
        self.assertEqual(failure_grouping_factory.call_count, 0)
        self.assert_no_private_semantic_leakage(failure_response.data)

        def fail_provider_factory(*args, **kwargs):
            raise AssertionError('knowledge graph GETs must be DB-only and provider-free')

        with patch('apps.knowledge.services.semantic_rebuild_service.create_source_provider', side_effect=fail_provider_factory) as read_source_factory, patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider', side_effect=fail_provider_factory
        ) as read_grouping_factory:
            owner_me_response = self.client.get('/knowledge-graph/me/')
            owner_route_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(owner_me_response.status_code, status.HTTP_200_OK, owner_me_response.data)
        self.assertEqual(owner_route_response.status_code, status.HTTP_200_OK, owner_route_response.data)
        read_source_factory.assert_not_called()
        read_grouping_factory.assert_not_called()
        for owner_payload in (owner_me_response.data, owner_route_response.data):
            self.assertEqual(owner_payload['semantic']['status'], UserKnowledgeGraphSemanticState.Status.TIMEOUT)
            self.assertEqual(owner_payload['semantic']['reason_code'], 'timeout')
            self.assertEqual(owner_payload['semantic']['phase'], 'embedding')
            self.assertEqual(owner_payload['semantic']['semantic_group_count'], 2)
            self.assertEqual(owner_payload['semantic']['semantic_group_membership_count'], 4)
            self.assertEqual(owner_payload['semantic_graph']['visible_group_count'], 2)
            self.assertEqual(owner_payload['semantic_graph']['visible_member_count'], 4)
            self.assertEqual(len(owner_payload['semantic_groups']), 2)
            self.assertEqual(
                {frozenset(member['slug'] for member in group['members']) for group in owner_payload['semantic_groups']},
                {
                    frozenset(('m017-celery-readiness', 'm017-redis-readiness')),
                    frozenset(('m017-django-readiness', 'm017-orm-readiness')),
                },
            )
            self.assert_no_private_semantic_leakage(owner_payload)

        self.client.force_authenticate(self.viewer)
        public_user_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
        self.client.force_authenticate(user=None)
        anonymous_user_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
        anonymous_question_response = self.client.get(f'/knowledge-graph/questions/{self.questions["django"].pk}/')

        for public_response in (public_user_response, anonymous_user_response, anonymous_question_response):
            self.assertEqual(public_response.status_code, status.HTTP_200_OK, public_response.data)
            self.assert_public_omits_owner_semantic_fields(public_response.data)
