from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import KnowledgeConcept, QuestionConceptEdge, UserConceptActivity, UserKnowledgeGraphState
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class OwnerKnowledgeGraphInsightsAPIContractTests(APITestCase):
    """Executable M015 owner-only insights contract.

    These tests intentionally describe the private insights API before the endpoint exists.
    They lock the response shape, privacy boundary, graph-state diagnostics, and redacted
    failure behavior expected from the implementation task that follows this scaffolding.
    """

    maxDiff = None

    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='insights-owner@example.com',
            user_name='insights-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='insights-viewer@example.com',
            user_name='insights-viewer',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)

        self.strong = self.create_concept('django', 'Django', KnowledgeConcept.Source.TAG, 'tag-sync', '1.0000')
        self.growing = self.create_concept('rest-api', 'REST API', KnowledgeConcept.Source.PROVIDER, 'provider-a', '0.9000')
        self.weak = self.create_concept('testing', 'Testing', KnowledgeConcept.Source.PROVIDER, 'provider-a', '0.7000')
        self.stale = self.create_concept('legacy-python', 'Legacy Python', KnowledgeConcept.Source.MANUAL, 'curator', '0.8000')
        self.isolated = self.create_concept('isolated-topic', 'Isolated Topic', KnowledgeConcept.Source.PROVIDER, 'provider-b', '0.6500')

        self.tag = Tag.objects.create(name='django', questions_count=3)
        self.primary_question = self.create_question(
            'How do I expose private graph insights safely?',
            'PRIVATE BODY: embeddings, prompt-like text, and source material must never leak.',
        )
        self.secondary_question = self.create_question(
            'How should REST graph actions be suggested?',
            'PRIVATE BODY: recommendation source text must never leak.',
        )
        self.weak_question = self.create_question(
            'How do I start testing this graph?',
            'PRIVATE BODY: weak concept raw activity must stay private.',
        )
        self.stale_question = self.create_question(
            'How did the old Python graph work?',
            'PRIVATE BODY: stale source details must stay private.',
        )
        self.isolated_question = self.create_question(
            'Why is this concept isolated?',
            'PRIVATE BODY: isolated source details must stay private.',
        )

        self.create_edge(self.primary_question, self.strong, tag=self.tag, source=QuestionConceptEdge.Source.TAG)
        self.create_edge(self.primary_question, self.growing)
        self.create_edge(self.secondary_question, self.strong)
        self.create_edge(self.secondary_question, self.growing)
        self.create_edge(self.weak_question, self.weak)
        self.create_edge(self.stale_question, self.stale)
        # Intentionally no QuestionConceptEdge for self.isolated: an activity-only concept is graph-isolated.

        self.create_activity(
            self.strong,
            self.primary_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '2.0000',
            idempotency_suffix='strong-authored',
        )
        self.create_activity(
            self.strong,
            self.secondary_question,
            UserConceptActivity.ActivityType.QUESTION_UPVOTE,
            UserConceptActivity.Source.REPUTATION_TRANSACTION,
            '1.5000',
            idempotency_suffix='strong-upvote',
        )
        self.create_activity(
            self.growing,
            self.primary_question,
            UserConceptActivity.ActivityType.APPROVED_EDIT,
            UserConceptActivity.Source.APPROVED_EDIT,
            '0.9000',
            idempotency_suffix='growing-edit',
        )
        self.create_activity(
            self.growing,
            self.secondary_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '0.7000',
            idempotency_suffix='growing-solution',
        )
        self.create_activity(
            self.weak,
            self.weak_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '0.2000',
            idempotency_suffix='weak-authored',
        )
        self.create_activity(
            self.stale,
            self.stale_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '1.1000',
            idempotency_suffix='stale-solution',
            created_at=timezone.now() - timedelta(days=120),
        )
        self.create_activity(
            self.isolated,
            self.isolated_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '0.8000',
            idempotency_suffix='isolated-authored',
        )

        self.state = UserKnowledgeGraphState.objects.create(
            user=self.owner,
            status=UserKnowledgeGraphState.Status.STALE,
            stale_reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
            last_error_message='Provider exploded with token sk-live-secret and stack trace line 42.',
            last_failed_phase='insights_calculation',
        )

    def create_concept(self, slug, name, source, provider, confidence):
        return KnowledgeConcept.objects.create(
            slug=slug,
            name=name,
            source=source,
            provider=provider,
            confidence=Decimal(confidence),
        )

    def create_question(self, title, body):
        return Question.objects.create(
            user=self.owner,
            question_title=title,
            question_body=body,
        )

    def create_edge(self, question, concept, *, tag=None, source=QuestionConceptEdge.Source.PROVIDER):
        return QuestionConceptEdge.objects.create(
            question=question,
            concept=concept,
            tag=tag,
            source=source,
            provider='contract-fixture',
            confidence=Decimal('1.0000'),
        )

    def create_activity(
        self,
        concept,
        question,
        activity_type,
        source,
        weight,
        *,
        idempotency_suffix,
        created_at=None,
    ):
        activity = UserConceptActivity.objects.create(
            user=self.owner,
            concept=concept,
            activity_type=activity_type,
            weight_delta=Decimal(weight),
            source=source,
            provider='activity-rebuild',
            confidence=Decimal('1.0000'),
            source_content_type=self.question_content_type,
            source_object_id=question.pk,
            related_question=question,
            idempotency_key=f'm015:{question.pk}:{idempotency_suffix}:raw-idempotency-key',
        )
        if created_at is not None:
            UserConceptActivity.objects.filter(pk=activity.pk).update(created_at=created_at, updated_at=created_at)
            activity.refresh_from_db()
        return activity

    def assert_insights_private_fields_are_redacted(self, payload):
        rendered = repr(payload)
        forbidden_fragments = [
            'insights-owner@example.com',
            'insights-viewer@example.com',
            'PRIVATE BODY:',
            'embeddings',
            'prompt-like text',
            'source_object_id',
            'idempotency_key',
            'raw-idempotency-key',
            str(self.primary_question.pk),
            str(self.secondary_question.pk),
            str(self.weak_question.pk),
            str(self.stale_question.pk),
            str(self.isolated_question.pk),
            'sk-live-secret',
            'stack trace line 42',
            'Traceback',
            'vector',
            'embedding',
        ]
        for fragment in forbidden_fragments:
            self.assertNotIn(
                fragment,
                rendered,
                f'M015 owner-only rule-based insights leaked private source/error term {fragment!r} in payload {rendered}',
            )

    def assert_public_payload_has_no_insight_only_fields(self, payload):
        rendered = repr(payload)
        insight_only_tokens = [
            'semantic_state',
            'tone_token',
            'recommendations',
            'action_payload',
            'reason_code',
            'explanation_token',
            'confidence_band',
            'next_best_action',
        ]
        for token in insight_only_tokens:
            self.assertNotIn(
                token,
                rendered,
                f'M015 public graph leaked owner-only rule-based insights field {token!r} in payload {rendered}',
            )

    def assert_public_payload_has_no_private_diagnostics_or_sources(self, payload):
        rendered = repr(payload)
        forbidden_public_fragments = [
            'insights-owner@example.com',
            'insights-viewer@example.com',
            'PRIVATE BODY:',
            'embeddings',
            'prompt-like text',
            'source_object_id',
            'source_content_type',
            'idempotency_key',
            'raw-idempotency-key',
            'Provider exploded',
            'sk-live-secret',
            'stack trace line 42',
            'Traceback',
            'prompt',
            'vector',
            'embedding',
            '#',
            'rgb(',
            'hsl(',
        ]
        for fragment in forbidden_public_fragments:
            self.assertNotIn(
                fragment,
                rendered,
                f'M015 public graph leaked private diagnostic/source/color term {fragment!r} in payload {rendered}',
            )

    def test_owner_insights_returns_semantic_states_tones_recommendations_and_safe_state(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))
        self.assertEqual(response.data['user_id'], str(self.owner.pk))
        self.assertEqual(response.data['viewer'], {'is_owner': True})
        self.assertEqual(
            response.data['state'],
            {
                'status': UserKnowledgeGraphState.Status.STALE,
                'stale_reason': UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
                'last_failed_phase': 'insights_calculation',
                'last_rebuild_started_at': None,
                'last_rebuild_finished_at': None,
            },
        )
        self.assertNotIn('last_error_message', response.data['state'])
        self.assertEqual(response.data['summary']['concept_count'], 5)
        self.assertEqual(response.data['summary']['recommendation_count'], 5)
        self.assertEqual(response.data['summary']['states'], {
            'strong': 1,
            'growing': 1,
            'weak': 1,
            'stale': 1,
            'isolated': 1,
        })

        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        self.assertEqual(set(concepts_by_slug), {'django', 'rest-api', 'testing', 'legacy-python', 'isolated-topic'})
        self.assertEqual(concepts_by_slug['django']['semantic_state'], 'strong')
        self.assertEqual(concepts_by_slug['django']['tone_token'], 'confident')
        self.assertEqual(concepts_by_slug['rest-api']['semantic_state'], 'growing')
        self.assertEqual(concepts_by_slug['rest-api']['tone_token'], 'momentum')
        self.assertEqual(concepts_by_slug['testing']['semantic_state'], 'weak')
        self.assertEqual(concepts_by_slug['testing']['tone_token'], 'needs_practice')
        self.assertEqual(concepts_by_slug['legacy-python']['semantic_state'], 'stale')
        self.assertEqual(concepts_by_slug['legacy-python']['tone_token'], 'refresh')
        self.assertEqual(concepts_by_slug['isolated-topic']['semantic_state'], 'isolated')
        self.assertEqual(concepts_by_slug['isolated-topic']['tone_token'], 'connect')

        for concept in concepts_by_slug.values():
            self.assertEqual(
                set(concept),
                {
                    'concept_id',
                    'slug',
                    'name',
                    'total_weight',
                    'source_count',
                    'related_question_count',
                    'semantic_state',
                    'tone_token',
                    'recommendations',
                },
            )
            self.assertLessEqual(len(concept['recommendations']), 3)
            self.assertGreaterEqual(len(concept['recommendations']), 1)
            for recommendation in concept['recommendations']:
                self.assertEqual(
                    set(recommendation),
                    {'id', 'priority', 'label', 'reason_code', 'action'},
                )
                self.assertIn(recommendation['priority'], {'high', 'medium', 'low'})
                self.assertIn('type', recommendation['action'])
                self.assertIn('payload', recommendation['action'])
                self.assertNotIn('question_body', recommendation['action']['payload'])
                self.assertNotIn('source_object_id', recommendation['action']['payload'])

        recommendation_ids = [
            recommendation['id']
            for concept in concepts_by_slug.values()
            for recommendation in concept['recommendations']
        ]
        self.assertEqual(len(recommendation_ids), len(set(recommendation_ids)))
        self.assertIn('review_related_questions', {rec['action']['type'] for rec in concepts_by_slug['testing']['recommendations']})
        self.assertIn('connect_concept', {rec['action']['type'] for rec in concepts_by_slug['isolated-topic']['recommendations']})
        self.assert_insights_private_fields_are_redacted(response.data)

    def test_owner_insights_classifies_existing_m015_threshold_boundaries(self):
        boundary_question = self.create_question(
            'Which M015 thresholds are executable?',
            'PRIVATE BODY: boundary test details must not leak.',
        )
        stale_at_cutoff = timezone.now() - timedelta(days=90)

        stale_strong = self.create_concept('boundary-stale', 'Boundary Stale', KnowledgeConcept.Source.PROVIDER, 'provider-boundary', '0.9000')
        strong_exact = self.create_concept('boundary-strong', 'Boundary Strong', KnowledgeConcept.Source.PROVIDER, 'provider-boundary', '0.9000')
        growing_exact = self.create_concept('boundary-growing', 'Boundary Growing', KnowledgeConcept.Source.PROVIDER, 'provider-boundary', '0.9000')
        below_growing = self.create_concept('boundary-weak', 'Boundary Weak', KnowledgeConcept.Source.PROVIDER, 'provider-boundary', '0.9000')
        high_single_source = self.create_concept('boundary-single-source', 'Boundary Single Source', KnowledgeConcept.Source.PROVIDER, 'provider-boundary', '0.9000')

        for concept in [stale_strong, strong_exact, growing_exact, below_growing, high_single_source]:
            self.create_edge(boundary_question, concept)

        self.create_activity(
            stale_strong,
            boundary_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '1.5000',
            idempotency_suffix='boundary-stale-a',
            created_at=stale_at_cutoff,
        )
        self.create_activity(
            stale_strong,
            boundary_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '1.5000',
            idempotency_suffix='boundary-stale-b',
            created_at=stale_at_cutoff,
        )
        self.create_activity(
            strong_exact,
            boundary_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '1.5000',
            idempotency_suffix='boundary-strong-a',
        )
        self.create_activity(
            strong_exact,
            boundary_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '1.5000',
            idempotency_suffix='boundary-strong-b',
        )
        self.create_activity(
            growing_exact,
            boundary_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '0.5000',
            idempotency_suffix='boundary-growing-a',
        )
        self.create_activity(
            growing_exact,
            boundary_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '0.5000',
            idempotency_suffix='boundary-growing-b',
        )
        self.create_activity(
            below_growing,
            boundary_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '0.5000',
            idempotency_suffix='boundary-weak-a',
        )
        self.create_activity(
            below_growing,
            boundary_question,
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            UserConceptActivity.Source.SOLUTION,
            '0.4999',
            idempotency_suffix='boundary-weak-b',
        )
        self.create_activity(
            high_single_source,
            boundary_question,
            UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            UserConceptActivity.Source.QUESTION,
            '3.0000',
            idempotency_suffix='boundary-single-source',
        )

        self.client.force_authenticate(self.owner)
        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, 'data', None))
        concepts_by_slug = {entry['slug']: entry for entry in response.data['concepts']}
        self.assertEqual(concepts_by_slug['boundary-stale']['semantic_state'], 'stale')
        self.assertEqual(concepts_by_slug['boundary-stale']['total_weight'], '3.0000')
        self.assertEqual(concepts_by_slug['boundary-stale']['source_count'], 2)
        self.assertEqual(concepts_by_slug['boundary-strong']['semantic_state'], 'strong')
        self.assertEqual(concepts_by_slug['boundary-strong']['total_weight'], '3.0000')
        self.assertEqual(concepts_by_slug['boundary-strong']['source_count'], 2)
        self.assertEqual(concepts_by_slug['boundary-growing']['semantic_state'], 'growing')
        self.assertEqual(concepts_by_slug['boundary-growing']['total_weight'], '1.0000')
        self.assertEqual(concepts_by_slug['boundary-growing']['source_count'], 2)
        self.assertEqual(concepts_by_slug['boundary-weak']['semantic_state'], 'weak')
        self.assertEqual(concepts_by_slug['boundary-weak']['total_weight'], '0.9999')
        self.assertEqual(concepts_by_slug['boundary-weak']['source_count'], 2)
        self.assertEqual(concepts_by_slug['boundary-single-source']['semantic_state'], 'weak')
        self.assertEqual(concepts_by_slug['boundary-single-source']['total_weight'], '3.0000')
        self.assertEqual(concepts_by_slug['boundary-single-source']['source_count'], 1)
        self.assertEqual(concepts_by_slug['isolated-topic']['semantic_state'], 'isolated')
        self.assertEqual(concepts_by_slug['isolated-topic']['related_question_count'], 0)

    def test_owner_insights_are_authenticated_only(self):
        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_public_user_graph_does_not_expose_owner_insight_contract(self):
        self.client.force_authenticate(self.viewer)

        response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['viewer'], {'is_owner': False})
        self.assertIn('nodes', response.data)
        self.assertIn('edges', response.data)
        self.assert_public_payload_has_no_insight_only_fields(response.data)
        self.assert_public_payload_has_no_private_diagnostics_or_sources(response.data)
        self.assertEqual(
            response.data['state']['last_error_message'],
            '',
            'M015 public graph must redact backend-owned failure text; only owner-only rule-based insights may expose redacted diagnostics.',
        )
        self.assertEqual(
            response.data['state']['last_failed_phase'],
            '',
            'M015 public graph must redact backend-owned failure phase diagnostics outside owner-only rule-based insights.',
        )

    @patch('apps.knowledge.views.get_owner_insights_payload', side_effect=RuntimeError('provider leaked sk-live-secret Traceback raw prompt'), create=True)
    def test_owner_insights_failure_returns_fixed_redacted_error_while_me_graph_still_works(self, _mock_builder):
        self.client.force_authenticate(self.owner)

        insights_response = self.client.get('/knowledge-graph/me/insights/')
        graph_response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(insights_response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, getattr(insights_response, 'data', None))
        self.assertEqual(
            insights_response.data,
            {
                'error': {
                    'code': 'knowledge_graph_insights_unavailable',
                    'message': 'Knowledge graph insights are temporarily unavailable.',
                },
                'state': {
                    'status': UserKnowledgeGraphState.Status.STALE,
                    'stale_reason': UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED,
                    'last_failed_phase': 'insights_calculation',
                    'last_rebuild_started_at': None,
                    'last_rebuild_finished_at': None,
                },
            },
        )
        self.assert_insights_private_fields_are_redacted(insights_response.data)
        self.assertEqual(graph_response.status_code, status.HTTP_200_OK, graph_response.data)
        self.assertEqual(graph_response.data['user_id'], str(self.owner.pk))
        self.assertIn('nodes', graph_response.data)
        self.assertIn('edges', graph_response.data)
