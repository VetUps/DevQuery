from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import (
    KnowledgeConcept,
    QuestionConceptEdge,
    UserConceptActivity,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    UserKnowledgeGraphSemanticState,
    UserKnowledgeGraphState,
)
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class KnowledgeGraphAPIContractTests(APITestCase):
    SCORING_V2_INSIGHT_ONLY_FIELDS = {
        'state_score',
        'strength_score',
        'freshness_score',
        'connectivity_score',
        'diversity_score',
        'confidence_score',
        'confidence_band',
        'owner_graph_degree',
        'owner_visible_related_question_count',
        'activity_types',
        'evidence',
    }

    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='graph-owner@example.com',
            user_name='graph-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='graph-viewer@example.com',
            user_name='graph-viewer',
            password='not-a-secret',
        )
        self.django = KnowledgeConcept.objects.create(
            slug='django',
            name='Django',
            source=KnowledgeConcept.Source.TAG,
            provider='tag-sync',
            confidence=Decimal('1.0000'),
        )
        self.rest = KnowledgeConcept.objects.create(
            slug='rest-api',
            name='REST API',
            source=KnowledgeConcept.Source.PROVIDER,
            provider='provider-a',
            confidence=Decimal('0.8750'),
        )
        self.tag = Tag.objects.create(name='django', questions_count=1)
        self.question = Question.objects.create(
            user=self.owner,
            question_title='How do I expose a graph safely?',
            question_body='Private question body must never appear in graph API responses.',
        )
        self.question.tags.add(self.tag)
        self.question_content_type = ContentType.objects.get_for_model(Question)
        QuestionConceptEdge.objects.create(
            question=self.question,
            concept=self.django,
            tag=self.tag,
            source=QuestionConceptEdge.Source.TAG,
            provider='tag-sync',
            confidence=Decimal('1.0000'),
        )
        QuestionConceptEdge.objects.create(
            question=self.question,
            concept=self.rest,
            source=QuestionConceptEdge.Source.PROVIDER,
            provider='provider-a',
            confidence=Decimal('0.8750'),
        )
        UserConceptActivity.objects.create(
            user=self.owner,
            concept=self.django,
            activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            weight_delta=Decimal('1.0000'),
            source=UserConceptActivity.Source.QUESTION,
            provider='activity-rebuild',
            confidence=Decimal('1.0000'),
            source_content_type=self.question_content_type,
            source_object_id=self.question.pk,
            related_question=self.question,
            idempotency_key=f'authored:{self.question.pk}:django',
        )
        UserConceptActivity.objects.create(
            user=self.owner,
            concept=self.django,
            activity_type=UserConceptActivity.ActivityType.QUESTION_UPVOTE,
            weight_delta=Decimal('0.2500'),
            source=UserConceptActivity.Source.REPUTATION_TRANSACTION,
            provider='activity-rebuild',
            confidence=Decimal('1.0000'),
            source_content_type=self.question_content_type,
            source_object_id=self.question.pk,
            related_question=self.question,
            idempotency_key=f'upvote:{self.question.pk}:django',
        )
        UserConceptActivity.objects.create(
            user=self.owner,
            concept=self.rest,
            activity_type=UserConceptActivity.ActivityType.APPROVED_EDIT,
            weight_delta=Decimal('0.5000'),
            source=UserConceptActivity.Source.APPROVED_EDIT,
            provider='activity-rebuild',
            confidence=Decimal('0.8750'),
            source_content_type=self.question_content_type,
            source_object_id=self.question.pk,
            related_question=self.question,
            idempotency_key=f'edit:{self.question.pk}:rest',
        )
        UserKnowledgeGraphState.objects.create(
            user=self.owner,
            status=UserKnowledgeGraphState.Status.FAILED,
            stale_reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
            last_error_message='Graph activity sync failed during question_authoring.',
            last_failed_phase='question_authoring',
        )

    def assert_private_activity_fields_are_redacted(self, payload):
        rendered = repr(payload)
        self.assertNotIn('graph-owner@example.com', rendered)
        self.assertNotIn('Private question body', rendered)
        self.assertNotIn('source_object_id', rendered)
        self.assertNotIn('idempotency_key', rendered)
        self.assertNotIn('raw_events', rendered)
        self.assertNotIn('activity_service.py', rendered)
        self.assert_no_sensitive_token_material(payload)

    def assert_no_sensitive_token_material(self, payload):
        """Allow aggregate token-count telemetry while blocking token secrets."""
        sensitive_key_names = {
            'token',
            'access_token',
            'refresh_token',
            'api_token',
            'auth_token',
            'secret_token',
            'provider_token',
        }
        sensitive_value_fragments = ('bearer ', 'sk_live_', 'sk_test_', 'secret_token')
        allowed_token_telemetry_keys = {'estimated_token_count'}
        leaked_paths = []

        def walk(value, path='payload'):
            if isinstance(value, dict):
                for key, nested in value.items():
                    key_text = str(key).lower()
                    current_path = f'{path}.{key}'
                    if key_text in sensitive_key_names and key_text not in allowed_token_telemetry_keys:
                        leaked_paths.append(current_path)
                    walk(nested, current_path)
                return
            if isinstance(value, (list, tuple)):
                for index, nested in enumerate(value):
                    walk(nested, f'{path}[{index}]')
                return
            if isinstance(value, str):
                lower_value = value.lower()
                if any(fragment in lower_value for fragment in sensitive_value_fragments):
                    leaked_paths.append(path)

        walk(payload)
        self.assertEqual(leaked_paths, [], f'Graph payload leaked sensitive token material at: {leaked_paths}')

    def assert_owner_semantic_payload_is_aggregate_safe(self, payload):
        rendered = repr(payload)
        forbidden_terms = {
            'embedding-provider',
            'embedding-model',
            'grouping-provider',
            'grouping-model',
            'content_hash',
            'vector_payload',
            'source_id',
            'sk_live_semantic_secret',
            'semantic-provider-raw-output',
            'Traceback',
            'provider-stack.py',
            'graph-owner@example.com',
            'Private question body',
        }
        leaked_terms = sorted(term for term in forbidden_terms if term in rendered)
        self.assertEqual(leaked_terms, [], f'Owner graph leaked semantic/provider internals: {leaked_terms}')

    def assert_semantic_payload_is_absent_from_public_graph_read(self, payload):
        rendered = repr(payload)
        forbidden_terms = {
            'semantic_edges',
            'semantic_groups',
            'semantic_neighbour',
            'embedding',
            'grouping',
            'group_key',
            'group_label',
            'budget_cap',
            'estimated_cost',
            'estimated_token_count',
            'source_item_count',
            'snapshot',
            'candidate',
            'content_hash',
            'vector_payload',
            'source_id',
            'changed_source_count',
            'provider_called_source_count',
            'neighbour_candidate_count',
            'sk_live_semantic_secret',
            'semantic-provider-raw-output',
            'Traceback',
            'provider-stack.py',
            'backend-architecture',
            'Архитектура бэкенда',
            'Безопасная агрегированная тема',
            'concept_slugs',
            'shared_candidate',
        }
        leaked_terms = sorted(term for term in forbidden_terms if term in rendered)
        self.assertEqual(leaked_terms, [], f'Public/question graph read leaked semantic/provider internals: {leaked_terms}')

    def assert_scoring_v2_payload_is_absent_from_graph_read(self, payload):
        leaked_terms = sorted(
            field
            for section_name in ('concepts', 'nodes')
            for entry in payload.get(section_name, [])
            for field in self.SCORING_V2_INSIGHT_ONLY_FIELDS
            if field in entry
        )
        self.assertEqual(leaked_terms, [], f'Graph read leaked scoring-v2 owner-only insight fields: {leaked_terms}')

    def test_graph_read_endpoints_do_not_touch_semantic_provider_factories_or_leak_semantic_state(self):
        UserKnowledgeGraphSemanticState.objects.create(
            user=self.owner,
            status=UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR,
            reason_code='provider_error',
            phase='semantic_provider',
            enabled=True,
            dry_run=False,
            source_provider='semantic-provider-raw-output',
            source_model='embedding-model',
            grouping_provider='grouping-provider',
            grouping_model='grouping-model',
            source_item_count=3,
            semantic_group_count=1,
            semantic_group_membership_count=2,
            estimated_token_count=999,
            estimated_cost=Decimal('12.345678'),
            budget_cap=Decimal('1.000000'),
            last_error_message='sk_live_semantic_secret Traceback provider-stack.py graph-owner@example.com Private question body',
        )
        private_group = UserKnowledgeGraphSemanticGroup.objects.create(
            user=self.owner,
            provider='grouping-provider',
            model='grouping-model',
            group_key='backend-architecture',
            label='Архитектура бэкенда',
            description='Безопасная агрегированная тема по связанным понятиям.',
            rationale='Понятия часто используются вместе в графе владельца.',
            confidence=Decimal('0.9100'),
            evidence={'concept_slugs': ['django', 'rest-api'], 'candidate_count': 1},
            generated_at=timezone.now(),
        )
        UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=private_group,
            concept=self.django,
            rank=1,
            confidence=Decimal('0.9300'),
            evidence={'reason': 'shared_candidate', 'rank': 1},
        )
        UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=private_group,
            concept=self.rest,
            rank=2,
            confidence=Decimal('0.8900'),
            evidence={'reason': 'shared_candidate', 'rank': 2},
        )

        def fail_provider_factory(*args, **kwargs):
            raise AssertionError('Semantic provider factory must not be touched by graph GET reads.')

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            side_effect=fail_provider_factory,
        ) as source_factory, patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider',
            side_effect=fail_provider_factory,
        ) as grouping_factory:
            self.client.force_authenticate(self.owner)
            own_response = self.client.get('/knowledge-graph/me/')
            owner_public_route_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
            self.client.force_authenticate(self.viewer)
            public_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
            question_response = self.client.get(f'/knowledge-graph/questions/{self.question.pk}/')

        self.assertEqual(own_response.status_code, status.HTTP_200_OK, own_response.data)
        self.assertEqual(owner_public_route_response.status_code, status.HTTP_200_OK, owner_public_route_response.data)
        self.assertEqual(public_response.status_code, status.HTTP_200_OK, public_response.data)
        self.assertEqual(question_response.status_code, status.HTTP_200_OK, question_response.data)
        source_factory.assert_not_called()
        grouping_factory.assert_not_called()
        self.assertIn('semantic_groups', own_response.data)
        self.assertIn('semantic_groups', owner_public_route_response.data)
        self.assertEqual(own_response.data['semantic_groups'], owner_public_route_response.data['semantic_groups'])
        for payload in [own_response.data, owner_public_route_response.data]:
            self.assert_private_activity_fields_are_redacted(payload)
            self.assert_owner_semantic_payload_is_aggregate_safe(payload)
            self.assert_scoring_v2_payload_is_absent_from_graph_read(payload)
        for payload in [public_response.data, question_response.data]:
            self.assert_private_activity_fields_are_redacted(payload)
            self.assert_semantic_payload_is_absent_from_public_graph_read(payload)
            self.assert_scoring_v2_payload_is_absent_from_graph_read(payload)

    def test_own_graph_returns_aggregate_owner_contract(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertEqual(response.data['viewer'], {'is_owner': True})
        self.assertEqual(response.data['total_weight'], '1.7500')
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FAILED)
        self.assertEqual(response.data['state']['stale_reason'], UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED)
        self.assertEqual(response.data['state']['last_failed_phase'], 'question_authoring')
        self.assertEqual(response.data['state']['last_error_message'], 'Graph activity sync failed during question_authoring.')
        self.assertEqual(
            [entry['activity_type'] for entry in response.data['activity_breakdown']],
            ['approved_edit', 'authored_question', 'question_upvote'],
        )
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assertEqual(response.data['nodes'], response.data['concepts'])
        self.assertEqual([entry['slug'] for entry in response.data['nodes']], ['django', 'rest-api'])
        self.assertEqual(
            response.data['edges'],
            [
                {
                    'id': f'shared-question:{min(self.django.pk, self.rest.pk)}:{max(self.django.pk, self.rest.pk)}',
                    'source_concept_id': min(self.django.pk, self.rest.pk),
                    'target_concept_id': max(self.django.pk, self.rest.pk),
                    'weight': '1.0000',
                    'shared_question_count': 1,
                    'reason': 'shared_question',
                    'related_questions': [
                        {
                            'question_id': str(self.question.pk),
                            'title': 'How do I expose a graph safely?',
                            'status': Question.Status.OPEN_STATUS,
                        }
                    ],
                }
            ],
        )
        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        nodes_by_slug = {entry['slug']: entry for entry in response.data['nodes']}
        self.assertEqual(set(concepts_by_slug), {'django', 'rest-api'})
        self.assertEqual(set(nodes_by_slug), {'django', 'rest-api'})
        self.assertEqual(nodes_by_slug['django']['total_weight'], '1.2500')
        self.assertEqual(
            nodes_by_slug['django']['related_questions'],
            [
                {
                    'question_id': str(self.question.pk),
                    'title': 'How do I expose a graph safely?',
                    'status': Question.Status.OPEN_STATUS,
                }
            ],
        )
        self.assertEqual(
            set(nodes_by_slug['django']),
            {
                'concept_id',
                'slug',
                'name',
                'source',
                'provider',
                'confidence',
                'total_weight',
                'source_count',
                'activity_breakdown',
                'related_questions',
            },
        )
        self.assert_private_activity_fields_are_redacted(response.data)

    def test_shared_question_edges_are_deduplicated_and_sorted_without_self_or_isolated_edges(self):
        second_question = Question.objects.create(
            user=self.owner,
            question_title='How do I serialize a graph edge?',
            question_body='Another private body that must never appear in topology explainability.',
        )
        isolated_question = Question.objects.create(
            user=self.owner,
            question_title='Why is this concept isolated?',
            question_body='Isolated private body that must never appear in topology explainability.',
        )
        isolated = KnowledgeConcept.objects.create(
            slug='isolated',
            name='Isolated',
            source=KnowledgeConcept.Source.PROVIDER,
            provider='provider-b',
            confidence=Decimal('0.7500'),
        )
        QuestionConceptEdge.objects.create(
            question=second_question,
            concept=self.django,
            source=QuestionConceptEdge.Source.TAG,
            provider='tag-sync',
            confidence=Decimal('1.0000'),
        )
        QuestionConceptEdge.objects.create(
            question=second_question,
            concept=self.rest,
            source=QuestionConceptEdge.Source.PROVIDER,
            provider='provider-a',
            confidence=Decimal('0.8750'),
        )
        QuestionConceptEdge.objects.create(
            question=isolated_question,
            concept=isolated,
            source=QuestionConceptEdge.Source.PROVIDER,
            provider='provider-b',
            confidence=Decimal('0.7500'),
        )
        for concept, question, idempotency_suffix in (
            (self.django, second_question, 'django-second'),
            (self.rest, second_question, 'rest-second'),
            (isolated, isolated_question, 'isolated'),
        ):
            UserConceptActivity.objects.create(
                user=self.owner,
                concept=concept,
                activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
                weight_delta=Decimal('1.0000'),
                source=UserConceptActivity.Source.QUESTION,
                provider='activity-rebuild',
                confidence=Decimal('1.0000'),
                source_content_type=self.question_content_type,
                source_object_id=question.pk,
                related_question=question,
                idempotency_key=f'authored:{question.pk}:{idempotency_suffix}',
            )
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([node['slug'] for node in response.data['nodes']], ['django', 'isolated', 'rest-api'])
        self.assertEqual(
            response.data['edges'],
            [
                {
                    'id': f'shared-question:{min(self.django.pk, self.rest.pk)}:{max(self.django.pk, self.rest.pk)}',
                    'source_concept_id': min(self.django.pk, self.rest.pk),
                    'target_concept_id': max(self.django.pk, self.rest.pk),
                    'weight': '2.0000',
                    'shared_question_count': 2,
                    'reason': 'shared_question',
                    'related_questions': [
                        {
                            'question_id': str(self.question.pk),
                            'title': 'How do I expose a graph safely?',
                            'status': Question.Status.OPEN_STATUS,
                        },
                        {
                            'question_id': str(second_question.pk),
                            'title': 'How do I serialize a graph edge?',
                            'status': Question.Status.OPEN_STATUS,
                        },
                    ],
                }
            ],
        )
        self.assertNotIn(f'shared-question:{isolated.pk}:{isolated.pk}', repr(response.data['edges']))
        self.assertNotIn(str(isolated_question.pk), repr(response.data['edges']))
        self.assert_private_activity_fields_are_redacted(response.data)

    def test_public_user_graph_returns_aggregate_non_owner_contract_without_private_fields(self):
        self.client.force_authenticate(self.viewer)

        response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertEqual(response.data['viewer'], {'is_owner': False})
        self.assertEqual(response.data['total_weight'], '1.7500')
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FAILED)
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assertEqual(response.data['nodes'], response.data['concepts'])
        self.assertEqual([entry['slug'] for entry in response.data['nodes']], ['django', 'rest-api'])
        self.assertEqual(
            response.data['edges'],
            [
                {
                    'id': f'shared-question:{min(self.django.pk, self.rest.pk)}:{max(self.django.pk, self.rest.pk)}',
                    'source_concept_id': min(self.django.pk, self.rest.pk),
                    'target_concept_id': max(self.django.pk, self.rest.pk),
                    'weight': '1.0000',
                    'shared_question_count': 1,
                    'reason': 'shared_question',
                    'related_questions': [
                        {
                            'question_id': str(self.question.pk),
                            'title': 'How do I expose a graph safely?',
                            'status': Question.Status.OPEN_STATUS,
                        }
                    ],
                }
            ],
        )
        public_payload_repr = repr(response.data)
        self.assertIn('How do I expose a graph safely?', public_payload_repr)
        self.assertNotIn('Private question body must never appear in graph API responses.', public_payload_repr)
        self.assertNotIn('source_object_id', public_payload_repr)
        self.assertNotIn('idempotency_key', public_payload_repr)
        self.assert_private_activity_fields_are_redacted(response.data)

    def test_question_graph_returns_question_concept_edges_without_question_body(self):
        response = self.client.get(f'/knowledge-graph/questions/{self.question.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['question_id'], str(self.question.pk))
        self.assertEqual(response.data['title'], 'How do I expose a graph safely?')
        self.assertEqual(response.data['status'], Question.Status.OPEN_STATUS)
        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        self.assertEqual(concepts_by_slug['django']['tag'], {'id': self.tag.pk, 'name': 'django'})
        self.assertEqual(concepts_by_slug['django']['source'], QuestionConceptEdge.Source.TAG)
        self.assertEqual(concepts_by_slug['django']['confidence'], '1.0000')
        self.assertEqual(concepts_by_slug['rest-api']['tag'], None)
        self.assert_private_activity_fields_are_redacted(response.data)

    def test_missing_resources_and_anonymous_me_are_not_successful(self):
        missing_user_response = self.client.get(f'/knowledge-graph/users/{uuid4()}/')
        missing_question_response = self.client.get(f'/knowledge-graph/questions/{uuid4()}/')
        anonymous_me_response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(missing_user_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(missing_question_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn(anonymous_me_response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_empty_user_and_question_graphs_return_zero_weight_and_empty_concepts(self):
        empty_question = Question.objects.create(
            user=self.viewer,
            question_title='Question without graph edges',
            question_body='This body must also stay private.',
        )

        user_response = self.client.get(f'/knowledge-graph/users/{self.viewer.pk}/')
        question_response = self.client.get(f'/knowledge-graph/questions/{empty_question.pk}/')

        self.assertEqual(user_response.status_code, status.HTTP_200_OK, user_response.data)
        self.assertEqual(user_response.data['total_weight'], '0.0000')
        self.assertEqual(user_response.data['concepts'], [])
        self.assertEqual(user_response.data['nodes'], [])
        self.assertEqual(user_response.data['edges'], [])
        self.assertEqual(user_response.data['activity_breakdown'], [])
        self.assertEqual(question_response.status_code, status.HTTP_200_OK, question_response.data)
        self.assertEqual(question_response.data['concepts'], [])
        self.assert_private_activity_fields_are_redacted(user_response.data)
        self.assert_private_activity_fields_are_redacted(question_response.data)
