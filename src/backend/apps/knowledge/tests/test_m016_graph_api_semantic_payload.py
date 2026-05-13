from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

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


class OwnerGraphSemanticPayloadTests(APITestCase):
    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='semantic-owner@example.com',
            user_name='semantic-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='semantic-viewer@example.com',
            user_name='semantic-viewer',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        self.django = self._concept('django', 'Django')
        self.rest = self._concept('rest-api', 'REST API')
        self.vue = self._concept('vue', 'Vue')
        self.hidden = self._concept('hidden', 'Hidden')
        self.q_django = self._question('Django ORM source')
        self.q_rest = self._question('REST serializer source')
        self.q_vue = self._question('Vue frontend source')
        self.q_hidden = self._question('Hidden semantic source')
        self._activity(self.q_django, self.django, 'django')
        self._activity(self.q_rest, self.rest, 'rest')
        self._activity(self.q_vue, self.vue, 'vue')
        self.snap_django = self._snapshot(self.q_django, 'hash-django')
        self.snap_rest = self._snapshot(self.q_rest, 'hash-rest')
        self.snap_vue = self._snapshot(self.q_vue, 'hash-vue')
        self.snap_hidden = self._snapshot(self.q_hidden, 'hash-hidden')

    def _concept(self, slug, name):
        return KnowledgeConcept.objects.create(slug=slug, name=name)

    def _question(self, title):
        return Question.objects.create(
            user=self.owner,
            question_title=title,
            question_body='Private body with semantic-owner@example.com sk_live_secret must never appear.',
        )

    def _activity(self, question, concept, suffix):
        return UserConceptActivity.objects.create(
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
            idempotency_key=f's05:{question.pk}:{suffix}',
        )

    def _snapshot(self, question, content_hash):
        return UserKnowledgeGraphEmbeddingSnapshot.objects.create(
            user=self.owner,
            source_type='question',
            source_id=str(question.pk),
            provider='embedding-provider',
            model='embedding-model',
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
            provider='embedding-provider',
            model='embedding-model',
            dimensions=3,
            similarity_score=Decimal(similarity),
            rank=rank,
            generated_at=timezone.now(),
        )

    def _group(self, group_key='backend-django', generated_at=None):
        return UserKnowledgeGraphSemanticGroup.objects.create(
            user=self.owner,
            provider='grouping-provider',
            model='grouping-model',
            group_key=group_key,
            label='Django backend cluster',
            description='Aggregated safe group description.',
            rationale='Concepts are often practiced together.',
            confidence=Decimal('0.9200'),
            evidence={'signals': [{'concept_slug': 'django', 'score': '0.91'}]},
            generated_at=generated_at or timezone.now(),
        )

    def _membership(self, group, concept, rank=1, confidence='0.8800'):
        return UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=group,
            concept=concept,
            rank=rank,
            confidence=Decimal(confidence),
            evidence={'signals': [{'concept_slug': concept.slug, 'candidate_count': 2}]},
        )

    def assert_semantic_edges_are_aggregate_safe(self, semantic_edges):
        rendered = repr(semantic_edges)
        for forbidden in [
            'source_id',
            'content_hash',
            'vector_payload',
            'embedding-provider',
            'embedding-model',
            'semantic-owner@example.com',
            'sk_live_secret',
            'Private body',
            str(self.q_django.pk),
            str(self.q_rest.pk),
            str(self.q_vue.pk),
            str(self.q_hidden.pk),
        ]:
            self.assertNotIn(forbidden, rendered)

    def assert_semantic_groups_are_owner_safe(self, semantic_groups):
        rendered = repr(semantic_groups)
        for forbidden in [
            'source_id',
            'content_hash',
            'vector_payload',
            'grouping-provider',
            'grouping-model',
            'embedding-provider',
            'embedding-model',
            'semantic-owner@example.com',
            'sk_live_secret',
            'Private body',
            str(self.q_django.pk),
            str(self.q_rest.pk),
            str(self.q_vue.pk),
            str(self.q_hidden.pk),
        ]:
            self.assertNotIn(forbidden, rendered)

    def test_owner_graph_exposes_semantic_groups_with_visible_safe_memberships(self):
        group = self._group()
        self._membership(group, self.rest, rank=2, confidence='0.8400')
        self._membership(group, self.django, rank=1, confidence='0.8800')
        self._membership(group, self.hidden, rank=3, confidence='0.7700')
        empty_group = self._group(group_key='hidden-only')
        self._membership(empty_group, self.hidden, rank=1, confidence='0.9100')
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data['semantic_groups'],
            [
                {
                    'group_key': 'backend-django',
                    'label': 'Django backend cluster',
                    'description': 'Aggregated safe group description.',
                    'rationale': 'Concepts are often practiced together.',
                    'confidence': '0.9200',
                    'generated_at': response.data['semantic_groups'][0]['generated_at'],
                    'evidence': {'signals': [{'concept_slug': 'django', 'score': '0.91'}]},
                    'members': [
                        {
                            'concept_id': self.django.pk,
                            'slug': 'django',
                            'name': 'Django',
                            'rank': 1,
                            'confidence': '0.8800',
                            'evidence': {'signals': [{'concept_slug': 'django', 'candidate_count': 2}]},
                        },
                        {
                            'concept_id': self.rest.pk,
                            'slug': 'rest-api',
                            'name': 'REST API',
                            'rank': 2,
                            'confidence': '0.8400',
                            'evidence': {'signals': [{'concept_slug': 'rest-api', 'candidate_count': 2}]},
                        },
                    ],
                }
            ],
        )
        self.assert_semantic_groups_are_owner_safe(response.data['semantic_groups'])
        self.assertNotIn(self.hidden.pk, {member['concept_id'] for group in response.data['semantic_groups'] for member in group['members']})

    def test_owner_graph_exposes_deduplicated_semantic_edges_without_changing_structural_edges(self):
        self._candidate(self.snap_django, self.snap_rest, '0.91000', 2)
        self._candidate(self.snap_rest, self.snap_django, '0.96000', 3)
        self._candidate(self.snap_django, self.snap_vue, '0.95000', 1)
        self._candidate(self.snap_hidden, self.snap_django, '0.99000', 4)
        QuestionConceptEdge.objects.create(
            question=self.q_django,
            concept=self.django,
            confidence=Decimal('1.0000'),
        )
        QuestionConceptEdge.objects.create(
            question=self.q_django,
            concept=self.rest,
            confidence=Decimal('1.0000'),
        )
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
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
                            'question_id': str(self.q_django.pk),
                            'title': 'Django ORM source',
                            'status': Question.Status.OPEN_STATUS,
                        }
                    ],
                }
            ],
        )
        self.assertEqual(
            response.data['semantic_edges'],
            [
                {
                    'id': f'semantic-neighbour:{min(self.django.pk, self.rest.pk)}:{max(self.django.pk, self.rest.pk)}',
                    'source_concept_id': min(self.django.pk, self.rest.pk),
                    'target_concept_id': max(self.django.pk, self.rest.pk),
                    'weight': '0.96000',
                    'similarity_score': '0.96000',
                    'confidence': '0.96000',
                    'rank': 3,
                    'reason': 'semantic_neighbour',
                    'evidence': {'candidate_count': 2, 'best_rank': 3},
                },
                {
                    'id': f'semantic-neighbour:{min(self.django.pk, self.vue.pk)}:{max(self.django.pk, self.vue.pk)}',
                    'source_concept_id': min(self.django.pk, self.vue.pk),
                    'target_concept_id': max(self.django.pk, self.vue.pk),
                    'weight': '0.95000',
                    'similarity_score': '0.95000',
                    'confidence': '0.95000',
                    'rank': 1,
                    'reason': 'semantic_neighbour',
                    'evidence': {'candidate_count': 1, 'best_rank': 1},
                },
            ],
        )
        self.assert_semantic_edges_are_aggregate_safe(response.data['semantic_edges'])
        self.assertNotIn(self.hidden.pk, {edge['source_concept_id'] for edge in response.data['semantic_edges']})
        self.assertNotIn(self.hidden.pk, {edge['target_concept_id'] for edge in response.data['semantic_edges']})

    def test_owner_with_no_candidates_gets_empty_semantic_edges(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('semantic_edges', response.data)
        self.assertEqual(response.data['semantic_edges'], [])
        self.assertIn('semantic_groups', response.data)
        self.assertEqual(response.data['semantic_groups'], [])

    def test_public_user_graph_suppresses_owner_semantic_edges(self):
        self._candidate(self.snap_django, self.snap_rest, '0.91000', 1)
        group = self._group()
        self._membership(group, self.django)
        self.client.force_authenticate(self.viewer)

        response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('semantic_edges', response.data)
        self.assertNotIn('semantic_groups', response.data)
        self.assertNotIn('0.91000', repr(response.data))
        self.assertNotIn('semantic_neighbour', repr(response.data))
        self.assertNotIn('Django backend cluster', repr(response.data))
        self.assertNotIn('backend-django', repr(response.data))

    def test_question_graph_suppresses_semantic_groups(self):
        group = self._group()
        self._membership(group, self.django)
        self.client.force_authenticate(self.owner)

        response = self.client.get(f'/knowledge-graph/questions/{self.q_django.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('semantic_groups', response.data)
        self.assertNotIn('semantic_edges', response.data)
        self.assertNotIn('Django backend cluster', repr(response.data))
        self.assertNotIn('backend-django', repr(response.data))
        self.assertNotIn('grouping-provider', repr(response.data))

    def test_graph_get_reads_semantic_candidates_without_provider_factories(self):
        self._candidate(self.snap_django, self.snap_rest, '0.91000', 1)

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
            response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data['semantic_edges']), 1)
        source_factory.assert_not_called()
        grouping_factory.assert_not_called()
