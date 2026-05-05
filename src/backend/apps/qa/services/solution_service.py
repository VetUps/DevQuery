from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.user.models import ReputationTransaction
from apps.user.services.reputation_service import ReputationService

from ..models import Question, Solution

BEST_SOLUTION_REPUTATION_AWARD = 15


class SolutionService:
    @staticmethod
    def get_solution(solution_id: str) -> Solution:
        """
        Возвращает решение по его ID
        :param solution_id: ID решения
        :return:
        """
        try:
            solution = Solution.objects.get(
                solution_id=solution_id
            )

            return solution
        except Solution.DoesNotExist:
            raise NotFound('Такого решения не существует')

    @staticmethod
    def change_solution_body(solution: Solution, new_body: str) -> None:
        """
        Изменяет содержимое решения
        :param solution: решение
        :param new_body: новое содержимое
        :return:
        """
        solution.solution_body = new_body
        solution.save(update_fields=['solution_body', 'solution_updated_at'])

    @staticmethod
    @transaction.atomic
    def set_best_solution(solution: Solution, solution_is_best: bool, user) -> Solution:
        question = solution.question

        if question.user != user:
            raise PermissionDenied('Только автор вопроса может выбирать лучшее решение')

        solution = Solution.objects.select_related('user', 'question__user').select_for_update().get(pk=solution.pk)
        question = solution.question
        was_best = solution.solution_is_best
        now = timezone.now()

        if solution_is_best:
            Solution.objects.filter(
                question=question,
                solution_is_best=True,
            ).exclude(solution_id=solution.solution_id).update(
                solution_is_best=False,
                solution_updated_at=now,
            )
            solution.solution_is_best = True
            question.question_status = Question.Status.SOLVED_STATUS
        else:
            solution.solution_is_best = False

            has_other_best_solution = Solution.objects.filter(
                question=question,
                solution_is_best=True,
            ).exclude(solution_id=solution.solution_id).exists()

            if not has_other_best_solution:
                question.question_status = Question.Status.OPEN_STATUS

        solution.save(update_fields=['solution_is_best', 'solution_updated_at'])
        question.save(update_fields=['question_status', 'question_updated_at'])

        if solution_is_best and not was_best:
            ReputationService.record_transaction(
                user=solution.user,
                amount=BEST_SOLUTION_REPUTATION_AWARD,
                reason=ReputationTransaction.TransactionReason.BEST_SOLUTION,
                actor=user,
                source=solution,
                note='Награда за выбранное лучшее решение.',
            )

        return solution
