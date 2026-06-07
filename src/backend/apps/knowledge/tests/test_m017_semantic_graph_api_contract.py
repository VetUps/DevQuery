from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from apps.knowledge.models import (
    KnowledgeConcept,
    UserConceptActivity,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    UserKnowledgeGraphSemanticState,
)
from apps.knowledge.serializers import UserGraphRebuildResponseSerializer
from apps.qa.models import Question
from apps.user.models import CustomUser


@override_settings(DJANGO_TEST_SQLITE=True)
class OwnerSemanticGraphApiContractTests(APITestCase):
    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='m017-semantic-owner@example.com',
            user_name='m017-semantic-owner',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='m017-semantic-viewer@example.com',
            user_name='m017-semantic-viewer',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        self.django = self._concept('m017-django', 'M017 Django')
        self.rest = self._concept('m017-rest', 'M017 REST')
        self.hidden = self._concept('m017-hidden', 'M017 Hidden')
        self.question = self._question('M017 semantic source')
        self.rest_question = self._question('M017 REST source')
        self.hidden_question = self._question('M017 hidden source')
        self._activity(self.question, self.django, 'django')
        self._activity(self.rest_question, self.rest, 'rest')

    def _concept(self, slug, name):
        return KnowledgeConcept.objects.create(slug=slug, name=name)

    def _question(self, title):
        return Question.objects.create(
            user=self.owner,
            question_title=title,
            question_body='Private body source_id=unsafe token=sk_live_m017 m017-semantic-owner@example.com Traceback provider.py',
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
            idempotency_key=f'm017-contract:{question.pk}:{suffix}',
        )

    def _group(self, group_key, *, lifecycle_status='active', concept=None, **overrides):
        now = timezone.now()
        values = {
            'user': self.owner,
            'provider': 'unsafe-grouping-provider-must-not-appear',
            'model': 'unsafe-grouping-model-must-not-appear',
            'group_key': group_key,
            'label': f'{group_key} safe label',
            'description': 'Safe aggregate semantic description.',
            'rationale': 'Safe aggregate lifecycle rationale.',
            'confidence': Decimal('0.9000'),
            'evidence': {'signals': [{'candidate_count': 2}]},
            'reuse_evidence': {'matched_member_signature': True, 'previous_member_count': 2},
            'lifecycle_status': lifecycle_status,
            'lifecycle_reason_code': 'provider_missed_group' if lifecycle_status == 'stale' else '',
            'first_seen_at': now,
            'last_seen_at': now,
            'stale_at': now if lifecycle_status == 'stale' else None,
            'archived_at': now if lifecycle_status == 'archived' else None,
            'generated_at': now,
        }
        values.update(overrides)
        group = UserKnowledgeGraphSemanticGroup.objects.create(**values)
        if concept is not None:
            UserKnowledgeGraphSemanticGroupMembership.objects.create(
                group=group,
                concept=concept,
                rank=1,
                confidence=Decimal('0.8100'),
                evidence={'signals': [{'concept_slug': concept.slug, 'candidate_count': 2}]},
            )
        return group

    def _semantic_state(self):
        return UserKnowledgeGraphSemanticState.objects.create(
            user=self.owner,
            status=UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR,
            reason_code='provider_error',
            phase='semantic_provider',
            enabled=True,
            dry_run=False,
            source_provider='unsafe-source-provider-must-not-appear',
            source_model='unsafe-source-model-must-not-appear',
            grouping_provider='unsafe-grouping-provider-must-not-appear',
            grouping_model='unsafe-grouping-model-must-not-appear',
            source_item_count=5,
            changed_source_item_count=3,
            reused_snapshot_count=2,
            snapshot_item_count=4,
            neighbor_candidate_count=7,
            semantic_group_count=2,
            semantic_group_membership_count=3,
            semantic_group_reused_count=1,
            semantic_group_created_count=2,
            semantic_group_changed_count=3,
            semantic_group_stale_count=4,
            semantic_group_archived_count=5,
            estimated_token_count=11,
            estimated_cost=Decimal('0.120000'),
            budget_cap=Decimal('1.500000'),
            last_error_message='provider.py Traceback source_id=abc token=sk_live_m017 m017-semantic-owner@example.com private source text',
            started_at=timezone.now(),
            finished_at=timezone.now(),
        )

    def assert_no_private_semantic_internals(self, payload):
        rendered = repr(payload)
        for unsafe in (
            'unsafe-source-provider-must-not-appear',
            'unsafe-source-model-must-not-appear',
            'unsafe-grouping-provider-must-not-appear',
            'unsafe-grouping-model-must-not-appear',
            'm017-semantic-owner@example.com',
            'Private body',
            'private source text',
            'source_id',
            'sk_live',
            'Traceback',
            'provider.py',
            'vector_payload',
            str(self.hidden_question.pk),
        ):
            self.assertNotIn(unsafe, rendered)

    def test_owner_graph_exposes_safe_semantic_diagnostics_and_lifecycle_groups(self):
        state = self._semantic_state()
        active = self._group('active-backend', lifecycle_status='active', concept=self.django)
        stale = self._group('stale-api', lifecycle_status='stale', concept=self.rest)
        self._group('archived-visible', lifecycle_status='archived', concept=self.django)
        self._group('active-hidden-only', lifecycle_status='active', concept=self.hidden)
        self.client.force_authenticate(self.owner)

        with patch('apps.knowledge.services.semantic_rebuild_service.create_source_provider') as source_factory, patch(
            'apps.knowledge.services.semantic_rebuild_service.create_grouping_provider'
        ) as grouping_factory:
            response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        source_factory.assert_not_called()
        grouping_factory.assert_not_called()
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR)
        self.assertEqual(response.data['semantic']['reason_code'], 'provider_error')
        self.assertEqual(response.data['semantic']['phase'], 'semantic_provider')
        self.assertEqual(response.data['semantic']['enabled'], True)
        self.assertEqual(response.data['semantic']['dry_run'], False)
        self.assertEqual(response.data['semantic']['source_item_count'], 5)
        self.assertEqual(response.data['semantic']['total_source_count'], 5)
        self.assertEqual(response.data['semantic']['changed_source_count'], 3)
        self.assertEqual(response.data['semantic']['provider_called_source_count'], 3)
        self.assertEqual(response.data['semantic']['reused_snapshot_count'], 2)
        self.assertEqual(response.data['semantic']['persisted_snapshot_count'], 4)
        self.assertEqual(response.data['semantic']['neighbour_candidate_count'], 7)
        self.assertEqual(response.data['semantic']['semantic_group_reused_count'], 1)
        self.assertEqual(response.data['semantic']['semantic_group_created_count'], 2)
        self.assertEqual(response.data['semantic']['semantic_group_changed_count'], 3)
        self.assertEqual(response.data['semantic']['semantic_group_stale_count'], 4)
        self.assertEqual(response.data['semantic']['semantic_group_archived_count'], 5)
        self.assertEqual(response.data['semantic']['estimated_token_count'], 11)
        self.assertEqual(response.data['semantic']['estimated_cost'], '0.120000')
        self.assertEqual(response.data['semantic']['budget_cap'], '1.500000')
        self.assertEqual(response.data['semantic']['last_error_message'], 'Knowledge graph semantic diagnostics unavailable.')
        self.assertEqual(
            response.data['semantic']['view'],
            {'mode': 'semantic', 'visible_lifecycle_statuses': ['active', 'stale'], 'archived_groups_included': False},
        )
        self.assertEqual(response.data['semantic_graph']['schema_version'], 1)
        self.assertEqual(response.data['semantic_graph']['mode'], 'semantic')
        self.assertEqual(response.data['semantic_graph']['status'], UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR)
        self.assertEqual(response.data['semantic_graph']['reason_code'], 'provider_error')
        self.assertEqual(response.data['semantic_graph']['phase'], 'semantic_provider')
        self.assertEqual(response.data['semantic_graph']['enabled'], True)
        self.assertEqual(response.data['semantic_graph']['available'], False)
        self.assertEqual(response.data['semantic_graph']['visible_group_count'], 2)
        self.assertEqual(response.data['semantic_graph']['visible_member_count'], 2)
        self.assertEqual(response.data['semantic_graph']['semantic_edge_count'], 0)
        self.assertEqual(response.data['semantic_graph']['lifecycle_counts'], {'active': 1, 'stale': 1})
        self.assertEqual(response.data['semantic_graph']['supported_lifecycle_statuses'], ['active', 'stale'])
        self.assertEqual(response.data['semantic_graph']['archived_groups_included'], False)

        owner_route_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
        self.assertEqual(owner_route_response.status_code, status.HTTP_200_OK, owner_route_response.data)
        self.assertEqual(owner_route_response.data['semantic_graph'], response.data['semantic_graph'])
        self.assertEqual(owner_route_response.data['semantic'], response.data['semantic'])

        groups_by_key = {group['group_key']: group for group in response.data['semantic_groups']}
        self.assertEqual(set(groups_by_key), {'active-backend', 'stale-api'})
        self.assertEqual(groups_by_key['active-backend']['lifecycle_status'], 'active')
        self.assertEqual(groups_by_key['active-backend']['lifecycle_reason_code'], '')
        self.assertEqual(groups_by_key['active-backend']['reuse_evidence'], active.reuse_evidence)
        self.assertEqual(groups_by_key['active-backend']['member_count'], 1)
        self.assertIsNotNone(groups_by_key['active-backend']['first_seen_at'])
        self.assertIsNone(groups_by_key['active-backend']['archived_at'])
        self.assertEqual(groups_by_key['stale-api']['lifecycle_status'], 'stale')
        self.assertEqual(groups_by_key['stale-api']['lifecycle_reason_code'], 'provider_missed_group')
        self.assertEqual(groups_by_key['stale-api']['reuse_evidence'], stale.reuse_evidence)
        self.assertIsNotNone(groups_by_key['stale-api']['stale_at'])
        self.assert_no_private_semantic_internals(response.data)
        state.refresh_from_db()
        self.assertEqual(state.status, UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR)

    def test_owner_graph_without_semantic_state_returns_pending_defaults_without_creating_state(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get('/knowledge-graph/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['semantic_groups'], [])
        self.assertEqual(response.data['semantic_edges'], [])
        self.assertEqual(response.data['semantic']['status'], UserKnowledgeGraphSemanticState.Status.PENDING)
        self.assertEqual(response.data['semantic']['enabled'], False)
        self.assertEqual(response.data['semantic']['dry_run'], True)
        self.assertEqual(response.data['semantic']['semantic_group_count'], 0)
        self.assertEqual(response.data['semantic']['semantic_group_membership_count'], 0)
        self.assertEqual(response.data['semantic']['estimated_token_count'], 0)
        self.assertEqual(response.data['semantic']['estimated_cost'], '0.000000')
        self.assertEqual(response.data['semantic']['budget_cap'], '0.000000')
        self.assertEqual(
            response.data['semantic_graph'],
            {
                'schema_version': 1,
                'mode': 'semantic',
                'status': UserKnowledgeGraphSemanticState.Status.PENDING,
                'reason_code': '',
                'phase': '',
                'enabled': False,
                'available': False,
                'visible_group_count': 0,
                'visible_member_count': 0,
                'semantic_edge_count': 0,
                'lifecycle_counts': {'active': 0, 'stale': 0},
                'supported_lifecycle_statuses': ['active', 'stale'],
                'archived_groups_included': False,
            },
        )
        self.assertFalse(UserKnowledgeGraphSemanticState.objects.filter(user=self.owner).exists())

    def test_public_user_graph_omits_owner_semantic_diagnostics_and_lifecycle_data(self):
        self._semantic_state()
        self._group('active-backend', lifecycle_status='active', concept=self.django)
        self.client.force_authenticate(self.viewer)

        response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('semantic', response.data)
        self.assertNotIn('semantic_graph', response.data)
        self.assertNotIn('semantic_view', response.data)
        self.assertNotIn('semantic_groups', response.data)
        self.assertNotIn('semantic_edges', response.data)
        self.assert_no_private_semantic_internals(response.data)
        self.assertNotIn('active-backend', repr(response.data))
        self.assertNotIn('lifecycle_status', repr(response.data))

    def test_anonymous_user_and_question_graphs_omit_semantic_view_metadata(self):
        self._semantic_state()
        self._group('active-backend', lifecycle_status='active', concept=self.django)
        self.client.force_authenticate(user=None)

        user_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')
        question_response = self.client.get(f'/knowledge-graph/questions/{self.question.pk}/')

        self.assertEqual(user_response.status_code, status.HTTP_200_OK, user_response.data)
        self.assertEqual(question_response.status_code, status.HTTP_200_OK, question_response.data)
        for payload in (user_response.data, question_response.data):
            self.assertNotIn('semantic', payload)
            self.assertNotIn('semantic_graph', payload)
            self.assertNotIn('semantic_view', payload)
            self.assertNotIn('semantic_groups', payload)
            self.assertNotIn('semantic_edges', payload)
            self.assertNotIn('semantic_state', repr(payload))
            self.assertNotIn('reuse_evidence', repr(payload))
            self.assertNotIn('lifecycle_status', repr(payload))
            self.assert_no_private_semantic_internals(payload)

    def test_rebuild_response_serializer_omits_provider_model_internals_but_keeps_safe_counters(self):
        semantic = {
            'status': 'succeeded',
            'reason_code': '',
            'phase': '',
            'enabled': True,
            'dry_run': False,
            'source_provider': 'unsafe-source-provider-must-not-appear',
            'source_model': 'unsafe-source-model-must-not-appear',
            'grouping_provider': 'unsafe-grouping-provider-must-not-appear',
            'grouping_model': 'unsafe-grouping-model-must-not-appear',
            'source_item_count': 3,
            'total_source_count': 3,
            'changed_source_count': 2,
            'provider_called_source_count': 2,
            'reused_snapshot_count': 1,
            'persisted_snapshot_count': 3,
            'neighbour_candidate_count': 4,
            'semantic_group_count': 2,
            'semantic_group_membership_count': 5,
            'semantic_group_reused_count': 1,
            'semantic_group_created_count': 2,
            'semantic_group_changed_count': 3,
            'semantic_group_stale_count': 4,
            'semantic_group_archived_count': 5,
            'estimated_token_count': 8,
            'estimated_cost': Decimal('0.010000'),
            'budget_cap': Decimal('1.000000'),
            'last_error_message': '',
            'started_at': None,
            'finished_at': None,
        }
        payload = {
            'user_id': self.owner.pk,
            'processed_questions': 0,
            'processed_activity_sources': 0,
            'structural_summary': {},
            'activity_summary': {},
            'state': {
                'status': 'fresh',
                'stale_reason': '',
                'last_error_message': '',
                'last_failed_phase': '',
                'last_rebuild_started_at': None,
                'last_rebuild_finished_at': None,
            },
            'semantic': semantic,
        }

        data = UserGraphRebuildResponseSerializer(payload).data

        self.assertEqual(data['semantic']['semantic_group_reused_count'], 1)
        self.assertEqual(data['semantic']['semantic_group_created_count'], 2)
        self.assertEqual(data['semantic']['semantic_group_changed_count'], 3)
        self.assertEqual(data['semantic']['semantic_group_stale_count'], 4)
        self.assertEqual(data['semantic']['semantic_group_archived_count'], 5)
        self.assertNotIn('source_provider', data['semantic'])
        self.assertNotIn('source_model', data['semantic'])
        self.assertNotIn('grouping_provider', data['semantic'])
        self.assertNotIn('grouping_model', data['semantic'])
        self.assert_no_private_semantic_internals(data)
