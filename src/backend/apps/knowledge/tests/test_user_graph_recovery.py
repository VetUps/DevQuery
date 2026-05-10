from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from apps.knowledge.models import UserConceptActivity, UserKnowledgeGraphState
from apps.knowledge.services import sync_question_graph
from apps.qa.models import Question, QuestionEditProposal, Solution, Tag, Vote
from apps.qa.services.question_edit_service import QuestionChangePayload, QuestionEditService
from apps.qa.services.solution_service import SolutionService
from apps.qa.services.vote_service import VoteService
from apps.user.models import CustomUser, ReputationTransaction


UNSAFE_ERROR = (
    'activity write failed for activity-owner@example.com '
    'body=private answer body token=sk_live_123 raw_events=[secret]'
)


class UserGraphRecoveryTests(APITestCase):
    def setUp(self):
        self.asker = CustomUser.objects.create_user(
            user_email='recovery-asker@example.com',
            user_name='recovery-asker',
            password='not-a-secret',
        )
        self.asker.user_reputation_score = 30
        self.asker.save(update_fields=['user_reputation_score'])
        self.solver = CustomUser.objects.create_user(
            user_email='recovery-solver@example.com',
            user_name='recovery-solver',
            password='not-a-secret',
        )
        self.editor = CustomUser.objects.create_user(
            user_email='recovery-editor@example.com',
            user_name='recovery-editor',
            password='not-a-secret',
        )
        self.voter = CustomUser.objects.create_user(
            user_email='recovery-voter@example.com',
            user_name='recovery-voter',
            password='not-a-secret',
        )

    def _create_question_with_graph(self, *, author=None, tags=('django', 'rest')) -> Question:
        question = Question.objects.create(
            user=author if author is not None else self.asker,
            question_title='How do recoverable graph sync failures work?',
            question_body='Private question body must not appear in diagnostics.',
        )
        for tag_name in tags:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            question.tags.add(tag)
            Tag.objects.filter(pk=tag.pk).update(questions_count=tag.questions_count + 1)
        sync_question_graph(question)
        question.refresh_from_db()
        return question

    def _assert_failed_state_is_safe(self, *, user, phase: str):
        state = UserKnowledgeGraphState.objects.get(user=user)
        self.assertEqual(state.status, UserKnowledgeGraphState.Status.FAILED)
        self.assertEqual(state.stale_reason, UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED)
        self.assertEqual(state.last_failed_phase, phase)
        self.assertIn('Graph activity sync failed', state.last_error_message)
        self.assertNotIn('activity-owner@example.com', state.last_error_message)
        self.assertNotIn('private answer body', state.last_error_message)
        self.assertNotIn('sk_live_123', state.last_error_message)
        self.assertNotIn('raw_events', state.last_error_message)

    def test_solution_create_preserves_solution_and_marks_solver_graph_failed_on_activity_error(self):
        question = self._create_question_with_graph()
        self.client.force_authenticate(self.solver)

        with patch('apps.knowledge.services.activity_service._upsert_activity_for_source', side_effect=RuntimeError(UNSAFE_ERROR)):
            response = self.client.post(
                '/solution/',
                {
                    'question': str(question.question_id),
                    'solution_body': 'Private answer body should be saved but not exposed in graph diagnostics.',
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Solution.objects.filter(user=self.solver, question=question).exists())
        self.assertFalse(UserConceptActivity.objects.filter(user=self.solver).exists())
        self._assert_failed_state_is_safe(user=self.solver, phase='solution_posting')

    def test_best_solution_activity_error_preserves_reputation_and_marks_solution_owner_not_actor(self):
        question = self._create_question_with_graph()
        solution = Solution.objects.create(
            user=self.solver,
            question=question,
            solution_body='Best solution source body must remain out of diagnostics.',
        )

        with patch('apps.knowledge.services.activity_service._upsert_activity_for_source', side_effect=RuntimeError(UNSAFE_ERROR)):
            SolutionService.set_best_solution(solution, True, self.asker)

        solution.refresh_from_db()
        question.refresh_from_db()
        self.assertTrue(solution.solution_is_best)
        self.assertEqual(question.question_status, Question.Status.SOLVED_STATUS)
        self.assertTrue(
            ReputationTransaction.objects.filter(
                user=self.solver,
                actor=self.asker,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.BEST_SOLUTION,
            ).exists()
        )
        self._assert_failed_state_is_safe(user=self.solver, phase='best_solution')
        self.assertFalse(UserKnowledgeGraphState.objects.filter(user=self.asker, status=UserKnowledgeGraphState.Status.FAILED).exists())

    def test_approved_question_edit_activity_error_preserves_edit_facts_after_strict_graph_sync(self):
        question = self._create_question_with_graph(tags=('django', 'rest'))
        proposal = QuestionEditService.create_proposal(
            question=question,
            actor=self.editor,
            payload=QuestionChangePayload(
                title='Approved edit still commits',
                body='Edited private body must not appear in graph diagnostics.',
                tags=['django', 'python'],
            ),
        )

        with patch('apps.knowledge.services.activity_service._upsert_activity_for_source', side_effect=RuntimeError(UNSAFE_ERROR)):
            QuestionEditService.change_proposal_approval(
                proposal_id=str(proposal.question_edit_id),
                actor=self.asker,
                approved=True,
            )

        proposal.refresh_from_db()
        question.refresh_from_db()
        self.assertTrue(proposal.question_edit_is_approved)
        self.assertEqual(question.question_title, 'Approved edit still commits')
        self.assertEqual(set(question.tags.values_list('name', flat=True)), {'django', 'python'})
        self.assertTrue(
            ReputationTransaction.objects.filter(
                user=self.editor,
                actor=self.asker,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.APPROVED_EDIT,
                object_id=proposal.pk,
            ).exists()
        )
        self._assert_failed_state_is_safe(user=self.editor, phase='approved_question_edit')

    def test_first_positive_upvote_activity_error_preserves_vote_reputation_and_marks_content_owner(self):
        question = self._create_question_with_graph()

        with patch('apps.knowledge.services.activity_service._upsert_activity_for_source', side_effect=RuntimeError(UNSAFE_ERROR)):
            vote, created = VoteService.cast_vote('question', str(question.question_id), Vote.VoteType.UPVOTE, self.voter)

        self.assertTrue(created)
        self.assertEqual(vote.vote_type, Vote.VoteType.UPVOTE)
        self.assertTrue(
            ReputationTransaction.objects.filter(
                user=self.asker,
                actor=self.voter,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
                object_id=question.pk,
            ).exists()
        )
        self._assert_failed_state_is_safe(user=self.asker, phase='question_upvote')
        self.assertFalse(UserKnowledgeGraphState.objects.filter(user=self.voter, status=UserKnowledgeGraphState.Status.FAILED).exists())

    def test_missing_transaction_recovery_result_is_skipped_without_graph_state_or_raw_payload(self):
        from apps.knowledge.services import recover_sync_reputation_transaction_activity

        result = recover_sync_reputation_transaction_activity(None, phase='missing transaction: token=raw-secret')

        self.assertEqual(result.skipped_reason, 'missing_transaction')
        self.assertFalse(UserKnowledgeGraphState.objects.exists())
