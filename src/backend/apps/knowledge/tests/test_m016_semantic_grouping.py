from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.knowledge.models import (
    KnowledgeConcept,
    UserConceptActivity,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphSemanticGroupMembership,
    UserKnowledgeGraphSemanticState,
    UserKnowledgeGraphState,
)
from apps.qa.models import Question
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
