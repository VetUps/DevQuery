# Кратко: работает с решениями и их изменениями.
from django.db import transaction
from django.db.models import QuerySet
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from apps.knowledge.services import recover_sync_reputation_transaction_activity
from ...user.models import CustomUser, ReputationTransaction
from ...user.services.reputation_service import ReputationService
from ..models import Solution, SolutionEdits
from .solution_service import SolutionService


class SolutionEditService:
    APPROVED_EDIT_REPUTATION_AWARD = 2

    @staticmethod
    def _base_queryset() -> QuerySet[SolutionEdits]:
        """Обрабатывает base queryset."""
        return SolutionEdits.objects.select_related(
            'solution__question',
            'solution__user',
            'user',
        )

    @staticmethod
    def get_solution_edit(solution_edit_id: str) -> SolutionEdits:
        """Возвращает данные решения правки."""
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
        """Обрабатывает change."""
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
            transaction_row = ReputationService.record_transaction(
                user=solution_edit.user,
                amount=SolutionEditService.APPROVED_EDIT_REPUTATION_AWARD,
                reason=ReputationTransaction.TransactionReason.APPROVED_EDIT,
                actor=user,
                source=solution_edit,
                note='Награда за одобренную правку решения.',
            )
            recover_sync_reputation_transaction_activity(transaction_row, phase='approved_solution_edit')

        # Сохранение
        solution_edit.solution_edit_is_approved = is_approved
        solution_edit.save()

    @staticmethod
    def history(solution_id: str) -> QuerySet[SolutionEdits]:
        """Возвращает историю правок."""
        solution = SolutionService.get_solution(solution_id)
        solution_edits = (SolutionEditService._base_queryset()
                          .filter(solution=solution, solution_edit_is_approved=True)
                          .order_by('-solution_edit_edited_at'))

        return solution_edits

    @staticmethod
    def not_approved(solution_id: str, user: CustomUser) -> QuerySet[SolutionEdits]:
        """Возвращает неодобренные правки."""
        solution = SolutionService.get_solution(solution_id)
        SolutionEditService.is_user_solution_author(solution, user)
        solution_edits = (SolutionEditService._base_queryset()
                          .filter(solution=solution, solution_edit_is_approved__isnull=True)
                          .order_by('-solution_edit_edited_at'))

        return solution_edits

    @staticmethod
    def review_queue(user: CustomUser) -> QuerySet[SolutionEdits]:
        """Возвращает очередь правок на проверку."""
        return (
            SolutionEditService._base_queryset()
            .filter(solution__user=user, solution_edit_is_approved__isnull=True)
            .order_by('-solution_edit_edited_at')
        )

    @staticmethod
    def my_history(user: CustomUser) -> QuerySet[SolutionEdits]:
        """Возвращает историю правок текущего пользователя."""
        return (
            SolutionEditService._base_queryset()
            .filter(solution__user=user, solution_edit_is_approved__isnull=False)
            .order_by('-solution_edit_edited_at')
        )

    @staticmethod
    def _validate_change_approve(
        solution: Solution,
        solution_edit: SolutionEdits,
        user: CustomUser,
    ) -> None:
        """Проверяет change."""
        SolutionEditService.is_user_solution_author(solution, user)
        SolutionEditService._is_solution_edit_in_waiting_status(solution_edit)

    @staticmethod
    def is_user_solution_author(solution: Solution, user: CustomUser) -> bool:
        """Проверяет условие для пользователя решения автора."""
        if solution.user != user:
            raise PermissionDenied('Вы не автор оригинального решения')
        return True

    @staticmethod
    def _is_solution_edit_in_waiting_status(solution_edit: SolutionEdits) -> None:
        """Проверяет условие: решение edit in waiting status."""
        if solution_edit.solution_edit_is_approved is not None:
            raise ValidationError('Правка уже была одобрена/отклонена')
