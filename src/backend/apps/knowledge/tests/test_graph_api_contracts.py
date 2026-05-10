from decimal import Decimal
from uuid import uuid4

from django.contrib.contenttypes.models import ContentType
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import KnowledgeConcept, QuestionConceptEdge, UserConceptActivity, UserKnowledgeGraphState
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class KnowledgeGraphAPIContractTests(APITestCase):
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
        self.assertNotIn('token', rendered)
        self.assertNotIn('activity_service.py', rendered)

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
        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        self.assertEqual(set(concepts_by_slug), {'django', 'rest-api'})
        self.assertEqual(concepts_by_slug['django']['total_weight'], '1.2500')
        self.assertEqual(
            concepts_by_slug['django']['related_questions'],
            [
                {
                    'question_id': str(self.question.pk),
                    'title': 'How do I expose a graph safely?',
                    'status': Question.Status.OPEN_STATUS,
                }
            ],
        )
        self.assert_private_activity_fields_are_redacted(response.data)

    def test_public_user_graph_returns_aggregate_non_owner_contract_without_private_fields(self):
        self.client.force_authenticate(self.viewer)

        response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertEqual(response.data['viewer'], {'is_owner': False})
        self.assertEqual(response.data['total_weight'], '1.7500')
        self.assertEqual(response.data['state']['status'], UserKnowledgeGraphState.Status.FAILED)
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
        self.assertEqual(user_response.data['activity_breakdown'], [])
        self.assertEqual(question_response.status_code, status.HTTP_200_OK, question_response.data)
        self.assertEqual(question_response.data['concepts'], [])
        self.assert_private_activity_fields_are_redacted(user_response.data)
        self.assert_private_activity_fields_are_redacted(question_response.data)
