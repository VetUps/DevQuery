from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import KnowledgeConcept, UserConceptActivity, UserKnowledgeGraphLayout
from apps.qa.models import Question
from apps.user.models import CustomUser


class KnowledgeGraphLayoutAPITests(APITestCase):
    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='layout-owner@example.com',
            user_name='layout-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='layout-viewer@example.com',
            user_name='layout-viewer',
            password='not-a-secret',
        )
        self.django = KnowledgeConcept.objects.create(slug='django', name='Django')
        self.vue = KnowledgeConcept.objects.create(slug='vue', name='Vue')
        self.unknown = KnowledgeConcept.objects.create(slug='unknown', name='Unknown')
        self.question = Question.objects.create(
            user=self.owner,
            question_title='How do I save graph layouts?',
            question_body='Private body must stay private.',
        )
        content_type = ContentType.objects.get_for_model(Question)
        for concept, suffix in ((self.django, 'django'), (self.vue, 'vue')):
            UserConceptActivity.objects.create(
                user=self.owner,
                concept=concept,
                activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
                weight_delta=Decimal('1.0000'),
                source=UserConceptActivity.Source.QUESTION,
                provider='activity-rebuild',
                confidence=Decimal('1.0000'),
                source_content_type=content_type,
                source_object_id=self.question.pk,
                related_question=self.question,
                idempotency_key=f'layout:{self.question.pk}:{suffix}',
            )

    def test_owner_can_save_read_and_reset_layout_positions(self):
        self.client.force_authenticate(self.owner)
        payload = {
            'schema_version': 1,
            'positions': {
                str(self.django.pk): {'x': 120.5, 'y': -40.25},
                str(self.vue.pk): {'x': 300, 'y': 80},
            },
            'user_id': str(self.viewer.pk),
        }

        save_response = self.client.put('/knowledge-graph/me/layout/', payload, format='json')

        self.assertEqual(save_response.status_code, status.HTTP_200_OK, save_response.data)
        self.assertEqual(save_response.data['schema_version'], 1)
        self.assertEqual(save_response.data['positions'][str(self.django.pk)], {'x': 120.5, 'y': -40.25})
        self.assertIsNotNone(save_response.data['updated_at'])
        self.assertTrue(UserKnowledgeGraphLayout.objects.filter(user=self.owner).exists())
        self.assertFalse(UserKnowledgeGraphLayout.objects.filter(user=self.viewer).exists())

        graph_response = self.client.get('/knowledge-graph/me/')
        self.assertEqual(graph_response.status_code, status.HTTP_200_OK, graph_response.data)
        self.assertEqual(graph_response.data['layout']['positions'][str(self.vue.pk)], {'x': 300.0, 'y': 80.0})
        self.assertNotIn('layout-owner@example.com', repr(graph_response.data))
        self.assertNotIn('Private body must stay private.', repr(graph_response.data))

        layout_response = self.client.get('/knowledge-graph/me/layout/')
        self.assertEqual(layout_response.status_code, status.HTTP_200_OK, layout_response.data)
        self.assertEqual(layout_response.data['positions'][str(self.django.pk)], {'x': 120.5, 'y': -40.25})

        reset_response = self.client.delete('/knowledge-graph/me/layout/')
        self.assertEqual(reset_response.status_code, status.HTTP_200_OK, reset_response.data)
        self.assertEqual(reset_response.data, {'schema_version': 1, 'positions': {}, 'updated_at': None})
        self.assertFalse(UserKnowledgeGraphLayout.objects.filter(user=self.owner).exists())

    def test_public_graph_does_not_expose_owner_layout_even_to_authenticated_viewers(self):
        UserKnowledgeGraphLayout.objects.create(
            user=self.owner,
            positions={str(self.django.pk): {'x': 1, 'y': 2}},
        )
        self.client.force_authenticate(self.viewer)

        response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('layout', response.data)

    def test_layout_save_rejects_unknown_concepts_and_invalid_shapes(self):
        self.client.force_authenticate(self.owner)

        unknown_response = self.client.put(
            '/knowledge-graph/me/layout/',
            {'schema_version': 1, 'positions': {str(self.unknown.pk): {'x': 1, 'y': 2}}},
            format='json',
        )
        string_coordinate_response = self.client.put(
            '/knowledge-graph/me/layout/',
            {'schema_version': 1, 'positions': {str(self.django.pk): {'x': 'left', 'y': 2}}},
            format='json',
        )
        missing_coordinate_response = self.client.put(
            '/knowledge-graph/me/layout/',
            {'schema_version': 1, 'positions': {str(self.django.pk): {'x': 1}}},
            format='json',
        )
        extreme_coordinate_response = self.client.put(
            '/knowledge-graph/me/layout/',
            {'schema_version': 1, 'positions': {str(self.django.pk): {'x': 100001, 'y': 2}}},
            format='json',
        )
        invalid_key_response = self.client.put(
            '/knowledge-graph/me/layout/',
            {'schema_version': 1, 'positions': {'9' * 64: {'x': 1, 'y': 2}}},
            format='json',
        )

        self.assertEqual(unknown_response.status_code, status.HTTP_400_BAD_REQUEST, unknown_response.data)
        self.assertEqual(string_coordinate_response.status_code, status.HTTP_400_BAD_REQUEST, string_coordinate_response.data)
        self.assertEqual(missing_coordinate_response.status_code, status.HTTP_400_BAD_REQUEST, missing_coordinate_response.data)
        self.assertEqual(extreme_coordinate_response.status_code, status.HTTP_400_BAD_REQUEST, extreme_coordinate_response.data)
        self.assertEqual(invalid_key_response.status_code, status.HTTP_400_BAD_REQUEST, invalid_key_response.data)
        self.assertFalse(UserKnowledgeGraphLayout.objects.filter(user=self.owner).exists())

    def test_anonymous_layout_requests_are_denied(self):
        get_response = self.client.get('/knowledge-graph/me/layout/')
        put_response = self.client.put('/knowledge-graph/me/layout/', {'schema_version': 1, 'positions': {}}, format='json')
        delete_response = self.client.delete('/knowledge-graph/me/layout/')

        self.assertIn(get_response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
        self.assertIn(put_response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
        self.assertIn(delete_response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_graph_read_prunes_positions_for_concepts_no_longer_in_user_graph(self):
        UserKnowledgeGraphLayout.objects.create(
            user=self.owner,
            positions={
                str(self.django.pk): {'x': 10, 'y': 20},
                str(self.unknown.pk): {'x': 99, 'y': 100},
                str(self.vue.pk): {'x': 'broken', 'y': 30},
            },
        )
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn(str(self.django.pk), response.data['layout']['positions'])
        self.assertNotIn(str(self.unknown.pk), response.data['layout']['positions'])
        self.assertNotIn(str(self.vue.pk), response.data['layout']['positions'])
