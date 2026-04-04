from django.db import transaction
from django.db.models import QuerySet
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from ..models import Solution, SolutionEdits
from ...user.models import CustomUser
from .solution_service import SolutionService

class SolutionEditService:
    @staticmethod
    def get_solution_edit(solution_edit_id: str) -> SolutionEdits:
        """
        Возвращает правку по её ID
        :param solution_edit_id: ID правки
        :return:
        """
        try:
            solution_edit = SolutionEdits.objects.get(
                solution_edit_id=solution_edit_id
            )

            return solution_edit
        except SolutionEdits.DoesNotExist:
            raise NotFound('Такой правки не существует')

    @staticmethod
    @transaction.atomic
    def change_approve(solution_edit_id: str, is_approved: bool, user: CustomUser) -> None:
        """
        Разрешает/запрещает правку
        :param solution_edit_id: ID правки
        :param is_approved: запрет/разрешение правки
        :param user: пользователь, который совершает действие
        :return:
        """
        solution_edit = SolutionEditService.get_solution_edit(solution_edit_id)

        # Валидация
        SolutionEditService._validate_change_approve(solution_edit.solution, solution_edit, user)

        if is_approved:
            # Отклоняем все остальные правки этого решения
            SolutionEdits.objects.filter(
                solution=solution_edit.solution
            ).exclude(
                Q(solution_edit_id=solution_edit.solution_edit_id) |
                Q(solution_edit_is_approved=True)
            ).update(
                solution_edit_is_approved=False
            )

            # Изменяем содержимое оригинального решения
            SolutionService.change_solution_body(solution_edit.solution, solution_edit.solution_edit_body_after)

        # Сохранение
        solution_edit.solution_edit_is_approved = is_approved
        solution_edit.save()

    @staticmethod
    def history(solution_id: str) -> QuerySet[SolutionEdits]:
        solution = SolutionService.get_solution(solution_id)
        solution_edits = (SolutionEdits.objects
                          .filter(solution=solution, solution_edit_is_approved=True)
                          .order_by('-solution_edit_edited_at'))

        return solution_edits

    @staticmethod
    def not_approved(solution_id: str, user: CustomUser) -> QuerySet[SolutionEdits]:
        solution = SolutionService.get_solution(solution_id)
        SolutionEditService.is_user_solution_author(solution, user)
        solution_edits = (SolutionEdits.objects
                          .filter(solution=solution, solution_edit_is_approved__isnull=True)
                          .order_by('-solution_edit_edited_at'))

        return solution_edits

    @staticmethod
    def _validate_change_approve(
        solution: Solution,
        solution_edit: SolutionEdits,
        user: CustomUser,
    ) -> None:
        """
        Запускает все валидации для процесса смены статуса правки
        :param solution: Оригинальное решение
        :param user: пользователь, который совершает действие
        :return:
        """
        SolutionEditService.is_user_solution_author(solution, user)
        SolutionEditService._is_solution_edit_in_waiting_status(solution_edit)

    @staticmethod
    def is_user_solution_author(solution: Solution, user: CustomUser) -> bool:
        """
        Проверяет права пользователя на смену статуса правки
        :param solution: Оригинальное решение
        :param user: пользователь, который совершает действие
        :return:
        """
        if solution.user != user:
            raise PermissionDenied('Вы не автор оригинального решения')
        return True

    @staticmethod
    def _is_solution_edit_in_waiting_status(solution_edit: SolutionEdits) -> None:
        if solution_edit.solution_edit_is_approved is not None:
            raise ValidationError('Правка уже была одобрена/отклонена')
