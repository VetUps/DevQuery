from decimal import Decimal
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import QuestionConceptEdge, UserConceptActivity
from apps.knowledge.services import (
    sync_posted_solution_activity,
    sync_question_graph,
)
from apps.knowledge.services.activity_types import (
    APPROVED_EDIT,
    AUTHORED_QUESTION,
    BEST_SOLUTION,
    POSTED_SOLUTION,
    QUESTION_UPVOTE,
    SOLUTION_UPVOTE,
)
from apps.qa.models import Question, QuestionEditProposal, Solution, SolutionEdits, Tag, Vote
from apps.qa.services.question_edit_service import QuestionChangePayload, QuestionEditService
from apps.qa.services.solution_edits_service import SolutionEditService
from apps.qa.services.solution_service import SolutionService
from apps.qa.services.vote_service import VoteService
from apps.user.models import CustomUser, ReputationTransaction


class UserConceptActivityLifecycleTests(APITestCase):
    def setUp(self):
        self.asker = CustomUser.objects.create_user(
            user_email='activity-asker@example.com',
            user_name='activity-asker',
            password='not-a-secret',
        )
        self.asker.user_reputation_score = 30
        self.asker.save(update_fields=['user_reputation_score'])
        self.solver = CustomUser.objects.create_user(
            user_email='activity-solver@example.com',
            user_name='activity-solver',
            password='not-a-secret',
        )
        self.editor = CustomUser.objects.create_user(
            user_email='activity-editor@example.com',
            user_name='activity-editor',
            password='not-a-secret',
        )
        self.voter = CustomUser.objects.create_user(
            user_email='activity-voter@example.com',
            user_name='activity-voter',
            password='not-a-secret',
        )

    def _create_question_with_graph(self, *, author=None, tags=('django', 'rest')) -> Question:
        question = Question.objects.create(
            user=author if author is not None else self.asker,
            question_title='How do runtime activity hooks work?',
            question_body='The body must never appear in diagnostics.',
        )
        for tag_name in tags:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            question.tags.add(tag)
            Tag.objects.filter(pk=tag.pk).update(questions_count=tag.questions_count + 1)
        sync_question_graph(question)
        question.refresh_from_db()
        return question

    def _activity_count(self, activity_type=None):
        rows = UserConceptActivity.objects.all()
        if activity_type is not None:
            rows = rows.filter(activity_type=activity_type)
        return rows.count()

    def _assert_activity(self, *, user, activity_type, count, total_weight):
        rows = UserConceptActivity.objects.filter(user=user, activity_type=activity_type)
        self.assertEqual(rows.count(), count)
        self.assertEqual(sum((row.weight_delta for row in rows), Decimal('0.0000')), Decimal(total_weight))

    def test_api_question_and_solution_create_write_idempotent_authored_and_posted_activity(self):
        self.client.force_authenticate(self.asker)
        question_response = self.client.post(
            '/question/',
            {
                'question_title': 'How do I create activity from the API?',
                'question_body': 'Question body is private implementation detail.',
                'tags': ['django', 'rest'],
            },
            format='json',
        )
        self.assertEqual(question_response.status_code, status.HTTP_201_CREATED, question_response.data)
        question = Question.objects.get(question_id=question_response.data['question_id'])

        self._assert_activity(user=self.asker, activity_type=AUTHORED_QUESTION, count=2, total_weight='2.0000')

        self.client.force_authenticate(self.solver)
        solution_response = self.client.post(
            '/solution/',
            {
                'question': str(question.question_id),
                'solution_body': 'Use the shared activity service after the solution write.',
            },
            format='json',
        )
        self.assertEqual(solution_response.status_code, status.HTTP_201_CREATED, solution_response.data)
        solution = Solution.objects.get(solution_id=solution_response.data['solution_id'])

        self._assert_activity(user=self.solver, activity_type=POSTED_SOLUTION, count=2, total_weight='2.0000')
        sync_posted_solution_activity(solution)
        self._assert_activity(user=self.solver, activity_type=POSTED_SOLUTION, count=2, total_weight='2.0000')

    def test_best_solution_and_approved_edits_create_activity_only_for_positive_new_transactions(self):
        question = self._create_question_with_graph()
        solution = Solution.objects.create(
            user=self.solver,
            question=question,
            solution_body='Runtime best-solution activity source.',
        )
        proposal = QuestionEditService.create_proposal(
            question=question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Approved question edit activity',
                body='Approved question edit body.',
                tags=['django', 'rest'],
            ),
        )
        rejected = QuestionEditService.create_proposal(
            question=question,
            actor=self.voter,
            payload=QuestionChangePayload(
                title='Rejected question edit activity',
                body='Rejected question edit body.',
                tags=['django'],
            ),
        )
        solution_edit = SolutionEdits.objects.create(
            solution=solution,
            user=self.editor,
            solution_edit_body_before=solution.solution_body,
            solution_edit_body_after='Approved solution edit body.',
        )

        SolutionService.set_best_solution(solution, True, self.asker)
        SolutionService.set_best_solution(solution, True, self.asker)
        QuestionEditService.change_proposal_approval(
            proposal_id=str(proposal.question_edit_id),
            actor=self.asker,
            approved=True,
        )
        QuestionEditService.change_proposal_approval(
            proposal_id=str(rejected.question_edit_id),
            actor=self.asker,
            approved=False,
        )
        SolutionEditService.change_approve(str(solution_edit.solution_edit_id), True, self.solver)

        self._assert_activity(user=self.solver, activity_type=BEST_SOLUTION, count=2, total_weight='4.0000')
        self._assert_activity(user=self.editor, activity_type=APPROVED_EDIT, count=4, total_weight='2.0000')
        self.assertFalse(UserConceptActivity.objects.filter(user=self.voter, activity_type=APPROVED_EDIT).exists())
        self.assertEqual(
            ReputationTransaction.objects.filter(
                user=self.solver,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.BEST_SOLUTION,
            ).count(),
            1,
        )

    def test_upvote_activity_is_created_once_for_question_and_solution_upvote_transitions_only(self):
        question = self._create_question_with_graph()
        solution = Solution.objects.create(
            user=self.solver,
            question=question,
            solution_body='Runtime upvote activity source.',
        )

        VoteService.cast_vote('question', str(question.question_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.cast_vote('question', str(question.question_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.remove_vote('question', str(question.question_id), self.voter)
        VoteService.cast_vote('question', str(question.question_id), Vote.VoteType.DOWNVOTE, self.voter)
        VoteService.cast_vote('solution', str(solution.solution_id), Vote.VoteType.DOWNVOTE, self.voter)
        VoteService.cast_vote('solution', str(solution.solution_id), Vote.VoteType.UPVOTE, self.voter)
        VoteService.cast_vote('solution', str(solution.solution_id), Vote.VoteType.UPVOTE, self.voter)

        self._assert_activity(user=self.asker, activity_type=QUESTION_UPVOTE, count=2, total_weight='0.5000')
        self._assert_activity(user=self.solver, activity_type=SOLUTION_UPVOTE, count=2, total_weight='1.5000')
        self.assertEqual(self._activity_count(QUESTION_UPVOTE), 2)
        self.assertEqual(self._activity_count(SOLUTION_UPVOTE), 2)

    def test_malformed_sources_and_activity_service_errors_do_not_create_partial_duplicate_rows(self):
        no_edge_question = Question.objects.create(
            user=self.asker,
            question_title='No concept edges',
            question_body='No concept activity should be invented.',
        )
        no_edge_solution = Solution.objects.create(
            user=self.solver,
            question=no_edge_question,
            solution_body='No related concept edges.',
        )

        no_edge_result = sync_posted_solution_activity(no_edge_solution)
        self.assertEqual(no_edge_result.skipped_reason, 'missing_concept_edges')
        self.assertFalse(UserConceptActivity.objects.exists())

        question = self._create_question_with_graph()
        baseline_count = self._activity_count()
        with patch(
            'apps.qa.services.vote_service.sync_reputation_transaction_activity',
            side_effect=RuntimeError('activity phase failed safely'),
        ):
            with self.assertRaisesMessage(RuntimeError, 'activity phase failed safely'):
                VoteService.cast_vote('question', str(question.question_id), Vote.VoteType.UPVOTE, self.voter)

        self.assertEqual(self._activity_count(), baseline_count)
