from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TestCase

from apps.knowledge.models import KnowledgeConcept, QuestionConceptEdge, UserConceptActivity
from apps.knowledge.services import get_user_concept_activity_summary, rebuild_user_concept_activity
from apps.qa.models import Question, QuestionEditProposal, Solution, SolutionEdits
from apps.user.models import ReputationTransaction


class UserConceptActivityRebuildTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.asker = User.objects.create_user(
            user_email='asker@example.com',
            user_name='asker',
            password='not-a-secret',
        )
        self.solver = User.objects.create_user(
            user_email='solver@example.com',
            user_name='solver',
            password='not-a-secret',
        )
        self.editor = User.objects.create_user(
            user_email='editor@example.com',
            user_name='editor',
            password='not-a-secret',
        )
        self.voter = User.objects.create_user(
            user_email='voter@example.com',
            user_name='voter',
            password='not-a-secret',
        )
        self.django = KnowledgeConcept.objects.create(slug='django', name='Django')
        self.python = KnowledgeConcept.objects.create(slug='python', name='Python')
        self.question = Question.objects.create(
            user=self.asker,
            question_title='How do I rebuild concept activity?',
            question_body='Private body text must not appear in command output.',
        )
        QuestionConceptEdge.objects.create(question=self.question, concept=self.django)
        QuestionConceptEdge.objects.create(question=self.question, concept=self.python)
        self.solution = Solution.objects.create(
            user=self.solver,
            question=self.question,
            solution_body='Use a deterministic rebuild service.',
            solution_is_best=False,
        )

    def record_transaction(self, *, user, reason, source, actor=None, amount=1):
        content_type = ContentType.objects.get_for_model(source, for_concrete_model=False)
        return ReputationTransaction.objects.create(
            user=user,
            actor=actor,
            reputation_transaction_amount=amount,
            reputation_transaction_reason=reason,
            content_type=content_type,
            object_id=source.pk,
            note='test ledger fact',
        )

    def test_rebuild_is_idempotent_and_aggregation_is_explainable(self):
        self.record_transaction(
            user=self.solver,
            reason=ReputationTransaction.TransactionReason.BEST_SOLUTION,
            source=self.solution,
            actor=self.asker,
            amount=15,
        )
        self.record_transaction(
            user=self.solver,
            reason=ReputationTransaction.TransactionReason.SOLUTION_UPVOTED,
            source=self.solution,
            actor=self.voter,
            amount=10,
        )
        self.solution.solution_is_best = False
        self.solution.save(update_fields=['solution_is_best'])

        first = rebuild_user_concept_activity()
        second = rebuild_user_concept_activity()

        self.assertEqual(first.created_rows, 8)
        self.assertEqual(second.created_rows, 0)
        self.assertEqual(UserConceptActivity.objects.count(), 8)
        summary = get_user_concept_activity_summary(self.solver)
        self.assertEqual(summary.total_weight, Decimal('7.5000'))
        self.assertEqual(summary.breakdown_by_activity_type['posted_solution'], Decimal('2.0000'))
        self.assertEqual(summary.breakdown_by_activity_type['best_solution'], Decimal('4.0000'))
        self.assertEqual(summary.breakdown_by_activity_type['solution_upvote'], Decimal('1.5000'))
        self.assertEqual(summary.source_counts_by_activity_type['posted_solution'], 2)
        self.assertEqual(summary.related_question_ids, [self.question.pk])

    def test_rebuild_skips_malformed_or_unsupported_sources_without_inventing_concepts(self):
        edge_count = QuestionConceptEdge.objects.count()
        no_edge_question = Question.objects.create(
            user=self.asker,
            question_title='No concept edges here',
            question_body='No activity should be invented.',
        )
        null_owner_question = Question.objects.create(
            user=None,
            question_title='Anonymous question',
            question_body='Skipped safely.',
        )
        ReputationTransaction.objects.create(
            user=self.asker,
            reputation_transaction_amount=-1,
            reputation_transaction_reason=ReputationTransaction.TransactionReason.SOLUTION_DOWNVOTED,
            content_type=ContentType.objects.get_for_model(self.solution, for_concrete_model=False),
            object_id=self.solution.pk,
            note='unsupported negative fact',
        )

        summary = rebuild_user_concept_activity()

        self.assertEqual(QuestionConceptEdge.objects.count(), edge_count)
        self.assertEqual(summary.skipped_sources, 3)
        self.assertFalse(UserConceptActivity.objects.filter(source_object_id=no_edge_question.pk).exists())
        self.assertFalse(UserConceptActivity.objects.filter(source_object_id=null_owner_question.pk).exists())

    def test_approved_edit_transactions_map_to_related_question_edges(self):
        question_edit = QuestionEditProposal.objects.create(
            question=self.question,
            author=self.editor,
            reviewed_by=self.asker,
            question_edit_title_before='Before',
            question_edit_body_before='Before body',
            question_edit_tags_before=[],
            question_edit_title_after='After',
            question_edit_body_after='After body',
            question_edit_tags_after=[],
            question_edit_is_approved=True,
        )
        solution_edit = SolutionEdits.objects.create(
            solution=self.solution,
            user=self.editor,
            solution_edit_body_before='Before',
            solution_edit_body_after='After',
            solution_edit_is_approved=True,
        )
        self.record_transaction(
            user=self.editor,
            reason=ReputationTransaction.TransactionReason.APPROVED_EDIT,
            source=question_edit,
            actor=self.asker,
            amount=2,
        )
        self.record_transaction(
            user=self.editor,
            reason=ReputationTransaction.TransactionReason.APPROVED_EDIT,
            source=solution_edit,
            actor=self.solver,
            amount=2,
        )

        rebuild_user_concept_activity()

        summary = get_user_concept_activity_summary(self.editor)
        self.assertEqual(summary.total_weight, Decimal('2.0000'))
        self.assertEqual(summary.breakdown_by_activity_type['approved_edit'], Decimal('2.0000'))
        self.assertEqual(summary.source_counts_by_activity_type['approved_edit'], 4)

    def test_management_command_outputs_aggregate_redacted_counts(self):
        out = StringIO()

        call_command('rebuild_user_concept_activity', user_id=str(self.asker.pk), stdout=out)

        output = out.getvalue()
        self.assertIn('User concept activity rebuild complete:', output)
        self.assertIn('processed_sources=', output)
        self.assertIn('authored_question=', output)
        self.assertNotIn(self.question.question_body, output)
        self.assertNotIn(self.asker.user_email, output)

    def test_empty_database_returns_zero_counts(self):
        UserConceptActivity.objects.all().delete()
        ReputationTransaction.objects.all().delete()
        Solution.objects.all().delete()
        Question.objects.all().delete()

        summary = rebuild_user_concept_activity()

        self.assertEqual(summary.processed_sources, 0)
        self.assertEqual(summary.created_rows, 0)
        self.assertEqual(summary.updated_rows, 0)
        self.assertEqual(summary.skipped_sources, 0)
