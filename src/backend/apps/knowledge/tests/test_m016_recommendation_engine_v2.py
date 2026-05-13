from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import (
    KnowledgeConcept,
    QuestionConceptEdge,
    UserConceptActivity,
    UserKnowledgeGraphEmbeddingSnapshot,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
)
from apps.qa.models import Question
from apps.user.models import CustomUser


class RecommendationEngineV2InsightsTests(APITestCase):
    maxDiff = None

    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='recommendation-owner@example.com',
            user_name='recommendation-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='recommendation-viewer@example.com',
            user_name='recommendation-viewer',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        self.strong = self._concept('django', 'Django')
        self.growing = self._concept('rest-api', 'REST API')
        self.weak_alpha = self._concept('alpha-testing', 'Alpha Testing')
        self.weak_beta = self._concept('beta-testing', 'Beta Testing')
        self.stale = self._concept('legacy-python', 'Legacy Python')
        self.isolated = self._concept('isolated-topic', 'Isolated Topic')
        self.hidden = self._concept('hidden-topic', 'Hidden Topic')

        self.q_shared = self._question(
            'How do Django and REST APIs fit together?',
            'PRIVATE BODY: provider-name embedding-model source_id vector_payload sk_live_secret owner@example.com must not leak.',
        )
        self.q_alpha = self._question('How should I test alpha code?', 'PRIVATE BODY: raw alpha evidence must not leak.')
        self.q_beta = self._question('How should I test beta code?', 'PRIVATE BODY: raw beta evidence must not leak.')
        self.q_stale = self._question('How did old Python code work?', 'PRIVATE BODY: stale source text must not leak.')
        self.q_isolated = self._question('Why is this topic isolated?', 'PRIVATE BODY: isolated source text must not leak.')
        self.q_hidden = self._question('Hidden semantic source', 'PRIVATE BODY: hidden source text must not leak.')

        self._edge(self.q_shared, self.strong)
        self._edge(self.q_shared, self.growing)
        self._edge(self.q_alpha, self.weak_alpha)
        self._edge(self.q_beta, self.weak_beta)
        self._edge(self.q_stale, self.stale)
        # The isolated concept intentionally has activity but no structural edge.

        self._activity(self.strong, self.q_shared, '2.0000', UserConceptActivity.ActivityType.AUTHORED_QUESTION, 'strong-a')
        self._activity(self.strong, self.q_shared, '1.5000', UserConceptActivity.ActivityType.QUESTION_UPVOTE, 'strong-b')
        self._activity(self.growing, self.q_shared, '0.9000', UserConceptActivity.ActivityType.APPROVED_EDIT, 'growing-a')
        self._activity(self.growing, self.q_shared, '0.7000', UserConceptActivity.ActivityType.POSTED_SOLUTION, 'growing-b')
        self._activity(self.weak_alpha, self.q_alpha, '0.2000', UserConceptActivity.ActivityType.AUTHORED_QUESTION, 'weak-alpha')
        self._activity(self.weak_beta, self.q_beta, '0.2000', UserConceptActivity.ActivityType.AUTHORED_QUESTION, 'weak-beta')
        self._activity(
            self.stale,
            self.q_stale,
            '1.1000',
            UserConceptActivity.ActivityType.POSTED_SOLUTION,
            'stale',
            created_at=timezone.now() - timedelta(days=120),
        )
        self._activity(self.isolated, self.q_isolated, '0.8000', UserConceptActivity.ActivityType.AUTHORED_QUESTION, 'isolated')

        self.snap_shared = self._snapshot(self.q_shared, 'hash-shared')
        self.snap_isolated = self._snapshot(self.q_isolated, 'hash-isolated')
        self.snap_alpha = self._snapshot(self.q_alpha, 'hash-alpha')
        self.snap_hidden = self._snapshot(self.q_hidden, 'hash-hidden')

    def _concept(self, slug, name):
        return KnowledgeConcept.objects.create(slug=slug, name=name, provider='unsafe-provider-name', confidence=Decimal('1.0000'))

    def _question(self, title, body):
        return Question.objects.create(user=self.owner, question_title=title, question_body=body)

    def _edge(self, question, concept):
        return QuestionConceptEdge.objects.create(
            question=question,
            concept=concept,
            provider='unsafe-edge-provider',
            confidence=Decimal('1.0000'),
        )

    def _activity(self, concept, question, weight, activity_type, suffix, *, created_at=None):
        activity = UserConceptActivity.objects.create(
            user=self.owner,
            concept=concept,
            activity_type=activity_type,
            weight_delta=Decimal(weight),
            source=UserConceptActivity.Source.QUESTION,
            provider='unsafe-activity-provider',
            confidence=Decimal('1.0000'),
            source_content_type=self.question_content_type,
            source_object_id=question.pk,
            related_question=question,
            idempotency_key=f'm016-rec:{question.pk}:{suffix}:raw-idempotency-key',
        )
        if created_at is not None:
            UserConceptActivity.objects.filter(pk=activity.pk).update(created_at=created_at, updated_at=created_at)
            activity.refresh_from_db()
        return activity

    def _snapshot(self, question, content_hash):
        return UserKnowledgeGraphEmbeddingSnapshot.objects.create(
            user=self.owner,
            source_type='question',
            source_id=str(question.pk),
            provider='unsafe-embedding-provider',
            model='unsafe-embedding-model',
            dimensions=3,
            content_hash=content_hash,
            vector_payload=[0.1, 0.2, 0.3],
            generated_at=timezone.now(),
        )

    def _candidate(self, source_snapshot, target_snapshot, similarity, rank):
        return UserKnowledgeGraphSemanticCandidate.objects.create(
            user=self.owner,
            source_snapshot=source_snapshot,
            target_snapshot=target_snapshot,
            provider='unsafe-embedding-provider',
            model='unsafe-embedding-model',
            dimensions=3,
            similarity_score=Decimal(similarity),
            rank=rank,
            generated_at=timezone.now(),
        )

    def _group(self):
        return UserKnowledgeGraphSemanticGroup.objects.create(
            user=self.owner,
            provider='unsafe-grouping-provider',
            model='unsafe-grouping-model',
            group_key='safe-bridge-group',
            label='Safe bridge group',
            description='Safe aggregate description.',
            rationale='Safe aggregate rationale.',
            confidence=Decimal('0.9100'),
            evidence={'signals': [{'concept_slug': 'isolated-topic', 'score': '0.91'}]},
            generated_at=timezone.now(),
        )

    def _membership(self, group, concept, rank=1):
        return UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=group,
            concept=concept,
            rank=rank,
            confidence=Decimal('0.8800'),
            evidence={'signals': [{'concept_slug': concept.slug, 'candidate_count': 1}]},
        )

    def assert_recommendations_are_safe(self, payload):
        rendered = repr(payload)
        for forbidden in [
            'recommendation-owner@example.com',
            'recommendation-viewer@example.com',
            'PRIVATE BODY:',
            'provider-name',
            'unsafe-embedding-provider',
            'unsafe-embedding-model',
            'unsafe-grouping-provider',
            'unsafe-grouping-model',
            'unsafe-activity-provider',
            'source_id',
            'source_object_id',
            'idempotency_key',
            'raw-idempotency-key',
            'content_hash',
            'vector_payload',
            'sk_live_secret',
            str(self.q_shared.pk),
            str(self.q_alpha.pk),
            str(self.q_beta.pk),
            str(self.q_stale.pk),
            str(self.q_isolated.pk),
            str(self.q_hidden.pk),
        ]:
            self.assertNotIn(forbidden, rendered)

    def test_owner_insights_returns_bounded_ranked_diversified_recommendations(self):
        self._candidate(self.snap_isolated, self.snap_shared, '0.96000', 1)
        self._candidate(self.snap_alpha, self.snap_shared, '0.92000', 2)
        self._candidate(self.snap_hidden, self.snap_shared, '0.99000', 3)
        group = self._group()
        self._membership(group, self.isolated, rank=1)
        self._membership(group, self.strong, rank=2)
        self._membership(group, self.hidden, rank=3)
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        recommendations = response.data['recommendations']
        self.assertEqual(response.data['summary']['recommendation_count'], len(recommendations))
        self.assertLessEqual(len(recommendations), 5)
        self.assertEqual([item['rank'] for item in recommendations], list(range(1, len(recommendations) + 1)))
        self.assertEqual([item['rank'] for item in recommendations], sorted(item['rank'] for item in recommendations))
        self.assertEqual([item['score'] for item in recommendations], sorted((item['score'] for item in recommendations), reverse=True))
        self.assertIn('semantic_neighbour_suggests_bridge', {item['reason_code'] for item in recommendations})
        self.assertGreaterEqual(
            len({item['reason_code'] for item in recommendations}),
            4,
            'Fixture includes weak/stale/isolated/semantic-neighbour signals and should not collapse to one reason.',
        )
        for recommendation in recommendations:
            self.assertEqual(
                set(recommendation),
                {'rank', 'id', 'score', 'confidence', 'priority', 'label', 'reason_code', 'target', 'action', 'evidence'},
            )
            self.assertGreaterEqual(Decimal(str(recommendation['score'])), Decimal('0'))
            self.assertLessEqual(Decimal(str(recommendation['score'])), Decimal('1'))
            self.assertGreaterEqual(Decimal(str(recommendation['confidence'])), Decimal('0'))
            self.assertLessEqual(Decimal(str(recommendation['confidence'])), Decimal('1'))
            self.assertIn(recommendation['priority'], {'high', 'medium', 'low'})
            self.assertIn('concept', recommendation['target'])
            self.assertIn('discovery', recommendation['target'])
            self.assertIn('type', recommendation['action'])
            self.assertIn('payload', recommendation['action'])
            self.assertLessEqual(len(recommendation['evidence']), 4)
        concepts_by_slug = {item['slug']: item for item in response.data['concepts']}
        self.assertIn('review_related_questions', {item['action']['type'] for item in concepts_by_slug['alpha-testing']['recommendations']})
        self.assertIn('connect_concept', {item['action']['type'] for item in concepts_by_slug['isolated-topic']['recommendations']})
        self.assert_recommendations_are_safe(response.data)

    def test_owner_insights_degrades_without_semantic_rows_and_tie_order_is_deterministic(self):
        self.client.force_authenticate(self.owner)

        first = self.client.get('/knowledge-graph/me/insights/')
        second = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data['recommendations'], second.data['recommendations'])
        self.assertLessEqual(len(first.data['recommendations']), 5)
        self.assertNotIn('semantic_neighbour_suggests_bridge', {item['reason_code'] for item in first.data['recommendations']})
        weak_recommendations = [
            item for item in first.data['recommendations'] if item['reason_code'] == 'weak_concept_needs_practice'
        ]
        self.assertLessEqual([item['target']['concept']['slug'] for item in weak_recommendations], ['alpha-testing', 'beta-testing'])
        self.assert_recommendations_are_safe(first.data)

    def test_insights_read_uses_persisted_semantic_rows_without_provider_factories(self):
        self._candidate(self.snap_isolated, self.snap_shared, '0.96000', 1)

        def fail_provider_factory(*args, **kwargs):
            raise AssertionError('Insights recommendation reads must not instantiate semantic providers.')

        with patch(
            'apps.knowledge.services.semantic_rebuild_service.create_source_provider',
            side_effect=fail_provider_factory,
        ) as source_factory, patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider',
            side_effect=fail_provider_factory,
        ) as grouping_factory:
            self.client.force_authenticate(self.owner)
            response = self.client.get('/knowledge-graph/me/insights/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('semantic_neighbour_suggests_bridge', {item['reason_code'] for item in response.data['recommendations']})
        source_factory.assert_not_called()
        grouping_factory.assert_not_called()
