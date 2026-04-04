from rest_framework.exceptions import NotFound
from ..models import Solution

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
