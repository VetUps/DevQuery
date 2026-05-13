from decimal import Decimal
from unittest.mock import Mock

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.knowledge.models import (
    KnowledgeConcept,
    UserConceptActivity,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticState,
    UserKnowledgeGraphState,
)

from apps.knowledge.semantic_providers import (
    KnowledgeGraphEmbeddingResult,
    KnowledgeGraphGroup,
    KnowledgeGraphGroupingResult,
    KnowledgeGraphProviderMetadata,
)
from apps.knowledge.services.semantic_rebuild_service import run_owner_semantic_boundary
from apps.qa.models import Question, Tag
from apps.user.models import CustomUser


class SemanticGroupingStorageContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = CustomUser.objects.create_user(
            user_email='semantic-group-owner@example.com',
            user_name='semantic-group-owner',
            password='not-a-secret',
        )
        self.other_owner = CustomUser.objects.create_user(
            user_email='semantic-group-other@example.com',
            user_name='semantic-group-other',
            password='not-a-secret',
        )
        self.viewer = CustomUser.objects.create_user(
            user_email='semantic-group-viewer@example.com',
            user_name='semantic-group-viewer',
            password='not-a-secret',
        )
        self.django = KnowledgeConcept.objects.create(slug='django', name='Django')
        self.drf = KnowledgeConcept.objects.create(slug='drf', name='Django REST Framework')
        self.question = Question.objects.create(
            user=self.owner,
            question_title='How do I group Django knowledge?',
            question_body='PRIVATE BODY: sk_live_secret and semantic-group-owner@example.com must not leak.',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        for concept, suffix in ((self.django, 'django'), (self.drf, 'drf')):
            UserConceptActivity.objects.create(
                user=self.owner,
                concept=concept,
                activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
                weight_delta=Decimal('1.0000'),
                source=UserConceptActivity.Source.QUESTION,
                provider='activity-rebuild',
                confidence=Decimal('1.0000'),
                source_content_type=self.question_content_type,
                source_object_id=self.question.pk,
                related_question=self.question,
                idempotency_key=f'grouping:{self.question.pk}:{suffix}',
            )
        UserKnowledgeGraphState.objects.create(user=self.owner, status=UserKnowledgeGraphState.Status.FRESH)

    def create_group(self, *, user=None, group_key='backend-django', label='Бэкенд на Django'):
        return UserKnowledgeGraphSemanticGroup.objects.create(
            user=user or self.owner,
            provider='fake-deepseek',
            model='deepseek-grouping-v1',
            group_key=group_key,
            label=label,
            description='Безопасное агрегированное описание группы.',
            rationale='Темы часто встречаются рядом в графе кандидатов.',
            confidence=Decimal('0.9200'),
            evidence={'signals': [{'concept_slug': 'django', 'score': '0.91'}]},
            generated_at=timezone.now(),
        )

    def test_group_rows_are_owner_scoped_and_unique_by_provider_model_group_key(self):
        owner_group = self.create_group()
        other_group = self.create_group(user=self.other_owner, label='Другой владелец')

        self.assertEqual(
            list(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).values_list('id', flat=True)),
            [owner_group.id],
        )
        self.assertEqual(
            list(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.other_owner).values_list('id', flat=True)),
            [other_group.id],
        )
        self.assertEqual(owner_group.provider, 'fake-deepseek')
        self.assertEqual(owner_group.model, 'deepseek-grouping-v1')
        self.assertEqual(owner_group.label, 'Бэкенд на Django')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_group(label='Дубликат')

    def test_memberships_require_existing_concepts_and_do_not_mutate_canonical_concepts(self):
        group = self.create_group()
        original_concepts = list(KnowledgeConcept.objects.order_by('id').values_list('id', 'slug', 'name'))

        membership = UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=group,
            concept=self.django,
            rank=1,
            confidence=Decimal('0.8800'),
            evidence={'signals': [{'concept_slug': self.django.slug, 'candidate_rank': 1}]},
        )

        self.assertEqual(membership.group.user, self.owner)
        self.assertEqual(membership.concept, self.django)
        self.assertEqual(
            list(KnowledgeConcept.objects.order_by('id').values_list('id', 'slug', 'name')),
            original_concepts,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                UserKnowledgeGraphSemanticGroupMembership.objects.create(
                    group=group,
                    concept=self.django,
                    rank=2,
                    confidence=Decimal('0.7700'),
                    evidence={'signals': [{'concept_slug': self.django.slug, 'candidate_rank': 2}]},
                )
        with self.assertRaises(ProtectedError):
            self.django.delete()

    def test_safe_validation_rejects_raw_text_vectors_source_ids_hashes_secrets_emails_and_html(self):
        unsafe_payloads = [
            {'raw_text': 'PRIVATE BODY'},
            {'source_id': str(self.question.pk)},
            {'content_hash': 'abcd' * 16},
            {'vector_payload': [0.1, 0.2]},
            {'signals': [{'note': 'sk_live_secret'}]},
            {'signals': [{'note': 'semantic-group-owner@example.com'}]},
            {'signals': [{'note': '<p>raw html</p>'}]},
        ]
        for index, payload in enumerate(unsafe_payloads):
            group = UserKnowledgeGraphSemanticGroup(
                user=self.owner,
                provider='fake-deepseek',
                model='deepseek-grouping-v1',
                group_key=f'unsafe-{index}',
                label='Безопасная метка',
                confidence=Decimal('0.8000'),
                evidence=payload,
                generated_at=timezone.now(),
            )
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                group.full_clean()

        unsafe_membership = UserKnowledgeGraphSemanticGroupMembership(
            group=self.create_group(group_key='safe-parent'),
            concept=self.drf,
            rank=1,
            confidence=Decimal('0.8000'),
            evidence={'raw_output': {'label': 'provider blob'}},
        )
        with self.assertRaises(ValidationError):
            unsafe_membership.full_clean()

    def test_semantic_state_defaults_include_group_aggregate_counters_only(self):
        state = UserKnowledgeGraphSemanticState.objects.create(user=self.owner)

        self.assertEqual(state.semantic_group_count, 0)
        self.assertEqual(state.semantic_group_membership_count, 0)
        self.assertFalse(hasattr(state, 'semantic_groups'))
        self.assertFalse(hasattr(state, 'semantic_group_memberships'))

    def test_normal_graph_get_payloads_omit_semantic_groups_and_private_group_data(self):
        group = self.create_group(label='Скрытая AI группа')
        UserKnowledgeGraphSemanticGroupMembership.objects.create(
            group=group,
            concept=self.django,
            rank=1,
            confidence=Decimal('0.8800'),
            evidence={'signals': [{'concept_slug': self.django.slug, 'candidate_rank': 1}]},
        )

        self.client.force_authenticate(self.owner)
        own_response = self.client.get('/knowledge-graph/me/')
        self.client.force_authenticate(self.viewer)
        public_response = self.client.get(f'/knowledge-graph/users/{self.owner.pk}/')

        self.assertEqual(own_response.status_code, status.HTTP_200_OK, own_response.data)
        self.assertEqual(public_response.status_code, status.HTTP_200_OK, public_response.data)
        for payload in (own_response.data, public_response.data):
            rendered = repr(payload)
            self.assertNotIn('Скрытая AI группа', rendered)
            self.assertNotIn('backend-django', rendered)
            self.assertNotIn('semantic_group', rendered)
            self.assertNotIn('group_key', rendered)
            self.assertNotIn('fake-deepseek', rendered)
            self.assertNotIn('PRIVATE BODY', rendered)
            self.assertNotIn('sk_live_secret', rendered)
            self.assertNotIn('semantic-group-owner@example.com', rendered)
            self.assertFalse({'semantic_groups', 'groups', 'memberships'} & set(payload))


SEMANTIC_GROUPING_ENABLED_SETTINGS = {
    'DJANGO_TEST_SQLITE': True,
    'KNOWLEDGE_GRAPH_AI_ENABLED': True,
    'KNOWLEDGE_GRAPH_AI_DRY_RUN': False,
    'KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP': 100.0,
    'KNOWLEDGE_GRAPH_EMBEDDING_API_KEY': 'test-key',
    'KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL': 'https://example.test/embeddings',
    'KNOWLEDGE_GRAPH_EMBEDDING_MODEL': 'snapshot-model',
    'KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS': 3,
    'KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS': 0.0,
    'KNOWLEDGE_GRAPH_CHAT_API_KEY': 'test-key',
    'KNOWLEDGE_GRAPH_CHAT_BASE_URL': 'https://example.test/chat',
    'KNOWLEDGE_GRAPH_CHAT_MODEL': 'grouping-model',
    'KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS': 0.0,
}


class GroupingEmbeddingProvider:
    metadata = KnowledgeGraphProviderMetadata(provider='recording-embedding', model='snapshot-model', dimensions=3)

    def __init__(self, vectors):
        self.requests = []
        self._vectors = vectors

    def embed(self, request):
        self.requests.append(request)
        return KnowledgeGraphEmbeddingResult(
            vectors=self._vectors,
            metadata=self.metadata,
            estimated_tokens=7 * len(request.texts),
        )


class RecordingGroupingProvider:
    metadata = KnowledgeGraphProviderMetadata(provider='recording-grouping', model='grouping-model')

    def __init__(self, groups=None):
        self.requests = []
        self._groups = groups

    def group(self, request):
        self.requests.append(request)
        groups = self._groups
        if groups is None:
            slugs = sorted({concept['slug'] for concept in request.concepts})
            groups = [
                KnowledgeGraphGroup(
                    group_key='backend-django',
                    label='Связанные темы',
                    concept_slugs=slugs,
                    rationale='Темы связаны по агрегированным кандидатам графа.',
                    confidence=0.91,
                )
            ]
        return KnowledgeGraphGroupingResult(groups=groups, metadata=self.metadata, estimated_tokens=5)


@override_settings(**SEMANTIC_GROUPING_ENABLED_SETTINGS)
class SemanticGroupingPersistenceBoundaryTests(TestCase):
    def setUp(self):
        self.owner = CustomUser.objects.create_user(
            user_email='semantic-grouping-boundary@example.com',
            user_name='semantic-grouping-boundary',
            password='not-a-secret',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)
        self.django = KnowledgeConcept.objects.create(slug='django-grouping', name='Django Grouping')
        self.drf = KnowledgeConcept.objects.create(slug='drf-grouping', name='DRF Grouping')

    def _question_with_activity(self, *, title, concept, tag_name):
        question = Question.objects.create(
            user=self.owner,
            question_title=title,
            question_body='Private body semantic-grouping-boundary@example.com sk_live_grouping must not leave provider input.',
        )
        tag, _ = Tag.objects.get_or_create(name=tag_name, defaults={'questions_count': 1})
        question.tags.add(tag)
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
            idempotency_key=f't02:{question.pk}:{concept.slug}',
        )
        return question

    def test_candidate_derived_concept_summaries_drive_valid_group_persistence(self):
        self._question_with_activity(title='Django semantic source', concept=self.django, tag_name='django')
        self._question_with_activity(title='DRF semantic source', concept=self.drf, tag_name='drf')
        embedding_provider = GroupingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0], [0.9, 0.1, 0.0]])
        grouping_provider = RecordingGroupingProvider()
        original_concepts = list(KnowledgeConcept.objects.order_by('id').values_list('id', 'slug', 'name'))

        state = run_owner_semantic_boundary(
            self.owner,
            source_provider_factory=Mock(return_value=embedding_provider),
            grouping_provider_factory=Mock(return_value=grouping_provider),
        )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(state['semantic_group_count'], 1)
        self.assertEqual(state['semantic_group_membership_count'], 2)
        self.assertEqual(len(grouping_provider.requests), 1)
        provider_payload = list(grouping_provider.requests[0].concepts)
        self.assertEqual([concept['slug'] for concept in provider_payload], ['django-grouping', 'drf-grouping'])
        rendered_payload = repr(provider_payload)
        self.assertIn('activity_count', rendered_payload)
        self.assertIn('candidate_count', rendered_payload)
        self.assertIn('max_similarity', rendered_payload)
        self.assertNotIn('Django semantic source', rendered_payload)
        self.assertNotIn('Private body', rendered_payload)
        self.assertNotIn('source_id', rendered_payload)
        self.assertNotIn('sk_live_grouping', rendered_payload)
        self.assertNotIn('semantic-grouping-boundary@example.com', rendered_payload)

        group = UserKnowledgeGraphSemanticGroup.objects.get(user=self.owner)
        self.assertEqual(group.label, 'Связанные темы')
        self.assertEqual(group.group_key, 'backend-django')
        self.assertEqual(group.confidence, Decimal('0.9100'))
        memberships = list(group.memberships.order_by('rank'))
        self.assertEqual([membership.concept.slug for membership in memberships], ['django-grouping', 'drf-grouping'])
        self.assertEqual([membership.confidence for membership in memberships], [Decimal('0.9100'), Decimal('0.9100')])
        self.assertIn('candidate_count', repr(memberships[0].evidence))
        self.assertEqual(list(KnowledgeConcept.objects.order_by('id').values_list('id', 'slug', 'name')), original_concepts)

    def test_no_semantic_candidates_skips_grouping_provider_and_persists_zero_group_counters(self):
        self._question_with_activity(title='Only one semantic source', concept=self.django, tag_name='django')
        embedding_provider = GroupingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0]])
        grouping_factory = Mock(side_effect=AssertionError('singleton concepts must not call grouping provider'))

        state = run_owner_semantic_boundary(
            self.owner,
            source_provider_factory=Mock(return_value=embedding_provider),
            grouping_provider_factory=grouping_factory,
        )

        self.assertEqual(state['status'], UserKnowledgeGraphSemanticState.Status.SUCCEEDED)
        self.assertEqual(state['neighbour_candidate_count'], 0)
        self.assertEqual(state['semantic_group_count'], 0)
        self.assertEqual(state['semantic_group_membership_count'], 0)
        grouping_factory.assert_not_called()
        self.assertFalse(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).exists())

    def test_malformed_grouping_output_leaves_existing_groups_atomically_untouched(self):
        self._question_with_activity(title='Django semantic source', concept=self.django, tag_name='django')
        self._question_with_activity(title='DRF semantic source', concept=self.drf, tag_name='drf')
        embedding_provider = GroupingEmbeddingProvider(vectors=[[1.0, 0.0, 0.0], [0.9, 0.1, 0.0]])
        valid_grouping_provider = RecordingGroupingProvider()
        first_state = run_owner_semantic_boundary(
            self.owner,
            source_provider_factory=Mock(return_value=embedding_provider),
            grouping_provider_factory=Mock(return_value=valid_grouping_provider),
        )
        self.assertEqual(first_state['semantic_group_count'], 1)
        existing_group_ids = list(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).values_list('id', flat=True))
        existing_membership_count = UserKnowledgeGraphSemanticGroupMembership.objects.filter(group__user=self.owner).count()

        malformed_provider = RecordingGroupingProvider(groups=[
            KnowledgeGraphGroup(
                group_key='backend-django',
                label='Связанные темы',
                concept_slugs=['django-grouping', 'unknown-injected-slug'],
                rationale='Темы связаны по агрегированным кандидатам графа.',
                confidence=0.91,
            )
        ])
        second_state = run_owner_semantic_boundary(
            self.owner,
            source_provider_factory=Mock(side_effect=AssertionError('snapshots should be reused')),
            grouping_provider_factory=Mock(return_value=malformed_provider),
        )

        self.assertEqual(second_state['status'], UserKnowledgeGraphSemanticState.Status.MALFORMED_RESPONSE)
        self.assertEqual(second_state['phase'], 'grouping')
        self.assertEqual(
            list(UserKnowledgeGraphSemanticGroup.objects.filter(user=self.owner).values_list('id', flat=True)),
            existing_group_ids,
        )
        self.assertEqual(
            UserKnowledgeGraphSemanticGroupMembership.objects.filter(group__user=self.owner).count(),
            existing_membership_count,
        )
        self.assertEqual(UserKnowledgeGraphSemanticCandidate.objects.filter(user=self.owner).count(), 2)
