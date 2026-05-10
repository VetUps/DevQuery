from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from apps.knowledge.models import KnowledgeConcept, UserConceptActivity
from apps.knowledge.services.activity_types import (
    APPROVED_EDIT_WEIGHT,
    AUTHORED_QUESTION_WEIGHT,
    BEST_SOLUTION_WEIGHT,
    CANONICAL_ACTIVITY_WEIGHTS,
    POSTED_SOLUTION_WEIGHT,
    QUESTION_UPVOTE_WEIGHT,
    SOLUTION_UPVOTE_WEIGHT,
)
from apps.qa.models import Question


class UserConceptActivityModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            user_email='concept-activity@example.com',
            user_name='concept-activity',
            password='not-a-secret',
        )
        self.concept = KnowledgeConcept.objects.create(slug='django', name='Django')
        self.question = Question.objects.create(
            user=self.user,
            question_title='How do I model concept activity?',
            question_body='Body text is not part of activity diagnostics.',
        )
        self.question_content_type = ContentType.objects.get_for_model(Question)

    def create_activity(self, **overrides):
        fields = {
            'user': self.user,
            'concept': self.concept,
            'activity_type': UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            'weight_delta': AUTHORED_QUESTION_WEIGHT,
            'source': UserConceptActivity.Source.QUESTION,
            'provider': 'test-suite',
            'confidence': Decimal('1.0000'),
            'source_content_type': self.question_content_type,
            'source_object_id': self.question.pk,
            'related_question': self.question,
            'idempotency_key': 'question:%s:concept:%s:authored' % (self.question.pk, self.concept.pk),
        }
        fields.update(overrides)
        return UserConceptActivity.objects.create(**fields)

    def test_canonical_activity_weights_are_decimal_compatible(self):
        self.assertEqual(AUTHORED_QUESTION_WEIGHT, Decimal('1.0000'))
        self.assertEqual(POSTED_SOLUTION_WEIGHT, Decimal('1.0000'))
        self.assertEqual(BEST_SOLUTION_WEIGHT, Decimal('2.0000'))
        self.assertEqual(APPROVED_EDIT_WEIGHT, Decimal('0.5000'))
        self.assertEqual(QUESTION_UPVOTE_WEIGHT, Decimal('0.2500'))
        self.assertEqual(SOLUTION_UPVOTE_WEIGHT, Decimal('0.7500'))
        self.assertEqual(
            CANONICAL_ACTIVITY_WEIGHTS[UserConceptActivity.ActivityType.SOLUTION_UPVOTE],
            SOLUTION_UPVOTE_WEIGHT,
        )

    def test_persists_activity_with_source_identity_and_four_decimal_weight(self):
        activity = self.create_activity(weight_delta=Decimal('1.2345'))

        activity.refresh_from_db()
        self.assertEqual(activity.user, self.user)
        self.assertEqual(activity.concept, self.concept)
        self.assertEqual(activity.weight_delta, Decimal('1.2345'))
        self.assertEqual(activity.source, UserConceptActivity.Source.QUESTION)
        self.assertEqual(activity.provider, 'test-suite')
        self.assertEqual(activity.confidence, Decimal('1.0000'))
        self.assertEqual(activity.source_content_type, self.question_content_type)
        self.assertEqual(activity.source_object_id, self.question.pk)
        self.assertEqual(activity.source_object, self.question)
        self.assertEqual(activity.related_question, self.question)
        self.assertTrue(activity.created_at)
        self.assertTrue(activity.updated_at)

    def test_duplicate_idempotency_key_raises_integrity_error(self):
        idempotency_key = 'duplicate:%s:%s' % (self.user.pk, self.concept.pk)
        self.create_activity(idempotency_key=idempotency_key)

        with self.assertRaises(IntegrityError):
            self.create_activity(idempotency_key=idempotency_key)

    def test_invalid_activity_source_and_confidence_are_rejected_by_validation(self):
        activity = UserConceptActivity(
            user=self.user,
            concept=self.concept,
            activity_type='downvote',
            weight_delta=Decimal('0.0000'),
            source='unknown-source',
            confidence=Decimal('1.5000'),
            source_content_type=self.question_content_type,
            source_object_id=self.question.pk,
            idempotency_key='invalid:%s:%s' % (self.user.pk, self.concept.pk),
        )

        with self.assertRaises(ValidationError) as context:
            activity.full_clean()

        self.assertIn('activity_type', context.exception.message_dict)
        self.assertIn('source', context.exception.message_dict)
        self.assertIn('confidence', context.exception.message_dict)

    def test_required_provenance_fields_are_not_nullable(self):
        activity = UserConceptActivity(
            activity_type=UserConceptActivity.ActivityType.AUTHORED_QUESTION,
            weight_delta=AUTHORED_QUESTION_WEIGHT,
            source=UserConceptActivity.Source.QUESTION,
            confidence=Decimal('1.0000'),
            idempotency_key='',
        )

        with self.assertRaises(ValidationError) as context:
            activity.full_clean()

        self.assertIn('user', context.exception.message_dict)
        self.assertIn('concept', context.exception.message_dict)
        self.assertIn('source_content_type', context.exception.message_dict)
        self.assertIn('source_object_id', context.exception.message_dict)
        self.assertIn('idempotency_key', context.exception.message_dict)

    def test_activity_rows_do_not_mutate_user_reputation_score(self):
        self.user.user_reputation_score = 42
        self.user.save(update_fields=['user_reputation_score'])

        self.create_activity(weight_delta=BEST_SOLUTION_WEIGHT)

        self.user.refresh_from_db()
        self.assertEqual(self.user.user_reputation_score, 42)
