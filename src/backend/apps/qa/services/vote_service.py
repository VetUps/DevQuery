from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, OuterRef, Subquery, CharField, F, IntegerField, Value, QuerySet
from django.db.models.functions import Coalesce
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound, ErrorDetail

from apps.knowledge.services import recover_sync_reputation_transaction_activity

from ..models import Vote, Question, Solution
from .question_protection_service import QuestionProtectionService
from ...user.models import CustomUser, ReputationTransaction
from ...user.services.reputation_service import ReputationService


class VoteService:
    """
    Сервис для управления голосами
    """

    PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE = QuestionProtectionService.DOWNVOTE_BLOCKED_PROTECTED

    REPUTATION_REWARDS = {
        'question': {
            'amount': 5,
            'reason': ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
        },
        'solution': {
            'amount': 10,
            'reason': ReputationTransaction.TransactionReason.SOLUTION_UPVOTED,
        },
    }

    @staticmethod
    def get_target_object(target_type: str, target_id: str) -> Question | Solution:
        """
        Возвращает объект цели по типу и ID
        :param target_type: Тип цели ('question' или 'solution')
        :param target_id: UUID цели
        :return: Объект Question или Solution
        :raises NotFound: если объект не найден
        :raises ValidationError: если target_id невалидный
        """
        try:
            if target_type == 'question':
                return Question.objects.get(question_id=target_id)
            elif target_type == 'solution':
                return Solution.objects.get(solution_id=target_id)
            else:
                raise ValidationError('Неверный тип цели. Допустимые значения: question, solution')
        except (Question.DoesNotExist, Solution.DoesNotExist):
            raise NotFound('Объект не найден')
        except DjangoValidationError:
            raise ValidationError('Невалидный формат ID')

    @staticmethod
    def annotate_votes(
        queryset: QuerySet[Question] | QuerySet[Solution],
        target_model: type[Question] | type[Solution],
        user: CustomUser | None = None,
    ) -> QuerySet[Question] | QuerySet[Solution]:
        """
        Аннотирует queryset статистикой голосов и голосом пользователя.
        :param queryset: Исходный queryset (Question или Solution)
        :param target_model: Модель (Question или Solution)
        :param user: Пользователь для получения его голоса (опционально)
        :return: Аннотированный queryset с полями:
            - vote_upvotes, vote_downvotes, vote_score
            - user_vote_type (если передан user)
        """
        content_type = ContentType.objects.get_for_model(target_model)
        target_votes = Vote.objects.filter(
            content_type=content_type,
            object_id=OuterRef('pk')
        )
        upvotes_subquery = (
            target_votes
            .filter(vote_type=Vote.VoteType.UPVOTE)
            .values('object_id')
            .annotate(total=Count('vote_id'))
            .values('total')[:1]
        )
        downvotes_subquery = (
            target_votes
            .filter(vote_type=Vote.VoteType.DOWNVOTE)
            .values('object_id')
            .annotate(total=Count('vote_id'))
            .values('total')[:1]
        )

        queryset = queryset.annotate(
            vote_upvotes=Coalesce(Subquery(upvotes_subquery, output_field=IntegerField()), Value(0)),
            vote_downvotes=Coalesce(Subquery(downvotes_subquery, output_field=IntegerField()), Value(0)),
        )
        queryset = queryset.annotate(vote_score=F('vote_upvotes') - F('vote_downvotes'))

        if user and user.is_authenticated:
            user_vote_subquery = target_votes.filter(user=user).values('vote_type')[:1]
            queryset = queryset.annotate(
                user_vote_type=Subquery(user_vote_subquery, output_field=CharField())
            )

        return queryset

    @staticmethod
    def get_vote_stats_fast(obj: Question | Solution, target_type: str) -> dict[str, int]:
        """
        Быстрое получение статистики из аннотированного объекта.
        :param obj: Аннотированный объект Question или Solution
        :param target_type: Тип цели ('question' или 'solution')
        :return: dict с upvotes, downvotes, score
        """
        return {
            'upvotes': getattr(obj, 'vote_upvotes', 0) or 0,
            'downvotes': getattr(obj, 'vote_downvotes', 0) or 0,
            'score': getattr(obj, 'vote_score', 0) or 0,
        }

    @staticmethod
    def get_user_vote_fast(obj: Question | Solution) -> str | None:
        """
        Быстрое получение голоса пользователя из аннотированного объекта.
        :param obj: Аннотированный объект Question или Solution
        :return: vote_type ('up', 'down') или None
        """
        return getattr(obj, 'user_vote_type', None)

    @staticmethod
    def build_protected_question_downvote_error(decision=None) -> PermissionDenied:
        message = QuestionProtectionService.build_downvote_denied_message(decision)
        permission_error = PermissionDenied(detail=message)
        permission_error.detail = {
            'detail': ErrorDetail(
                message,
                code=VoteService.PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE,
            ),
            'code': ErrorDetail(
                VoteService.PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE,
                code=VoteService.PROTECTED_QUESTION_DOWNVOTE_ERROR_CODE,
            ),
        }
        return permission_error

    @staticmethod
    def validate_vote_permission(target_object: Question | Solution, user: CustomUser, vote_type: str | None = None) -> None:
        """
        Проверяет, что пользователь не голосует за собственный контент
        :param target_object: Объект вопроса или решения
        :param user: Пользователь
        :raises PermissionDenied: если пользователь пытается голосовать за свой контент
        """
        if target_object.user == user:
            raise PermissionDenied('Нельзя голосовать за собственный контент')

        if isinstance(target_object, Question) and vote_type == Vote.VoteType.DOWNVOTE:
            decision = QuestionProtectionService.get_question_downvote_eligibility(target_object, user)
            if not decision.allowed:
                raise VoteService.build_protected_question_downvote_error(decision)

    @staticmethod
    def get_content_type(target_type: str) -> ContentType:
        """
        Возвращает ContentType для указанного типа цели
        :param target_type: Тип цели ('question' или 'solution')
        :return: ContentType объект
        """
        if target_type == 'question':
            return ContentType.objects.get_for_model(Question)
        elif target_type == 'solution':
            return ContentType.objects.get_for_model(Solution)
        else:
            raise ValidationError('Неверный тип цели')

    @staticmethod
    def should_reward_upvote_transition(previous_vote_type: str | None, next_vote_type: str | None) -> bool:
        """
        Возвращает True, если переход впервые вводит состояние upvote.
        M004 v1 начисляет репутацию только за новые upvote-переходы и
        не выполняет списание при downvote/remove.
        """
        return previous_vote_type != Vote.VoteType.UPVOTE and next_vote_type == Vote.VoteType.UPVOTE

    @classmethod
    def has_existing_upvote_reward(
        cls,
        *,
        target_object: Question | Solution,
        reason: str,
        actor: CustomUser,
    ) -> bool:
        content_type = ContentType.objects.get_for_model(target_object, for_concrete_model=False)
        return ReputationTransaction.objects.filter(
            user=target_object.user,
            actor=actor,
            reputation_transaction_reason=reason,
            content_type=content_type,
            object_id=target_object.pk,
        ).exists()

    @classmethod
    def award_upvote_reputation_if_needed(
        cls,
        *,
        target_type: str,
        target_object: Question | Solution,
        previous_vote_type: str | None,
        next_vote_type: str | None,
        actor: CustomUser,
    ) -> ReputationTransaction | None:
        if not cls.should_reward_upvote_transition(previous_vote_type, next_vote_type):
            return None

        reward = cls.REPUTATION_REWARDS.get(target_type)
        if reward is None:
            return None

        if cls.has_existing_upvote_reward(
            target_object=target_object,
            reason=reward['reason'],
            actor=actor,
        ):
            return None

        transaction_row = ReputationService.record_transaction(
            user=target_object.user,
            amount=reward['amount'],
            reason=reward['reason'],
            actor=actor,
            source=target_object,
            note=(
                f'M004 vote transition reward: {target_type} '
                f'{previous_vote_type or "none"} -> {next_vote_type}'
            ),
        )
        recover_sync_reputation_transaction_activity(transaction_row, phase=f'{target_type}_upvote')
        return transaction_row

    @classmethod
    def cast_vote(cls, target_type: str, target_id: str, vote_type: str, user: CustomUser) -> tuple[Vote, bool]:
        """
        Поставить или изменить голос за объект.
        :param target_type: Тип цели ('question' или 'solution')
        :param target_id: UUID цели
        :param vote_type: Тип голоса ('up' или 'down')
        :param user: Пользователь
        :return: tuple[Vote, bool] -> (голос, был ли он создан)
        :raises PermissionDenied: если голосование за свой контент
        :raises ValidationError: если неверный тип голоса
        """
        if vote_type not in [Vote.VoteType.UPVOTE, Vote.VoteType.DOWNVOTE]:
            raise ValidationError(f'Неверный тип голоса. Допустимые значения: {Vote.VoteType.UPVOTE}, {Vote.VoteType.DOWNVOTE}')

        target_object = cls.get_target_object(target_type, target_id)
        cls.validate_vote_permission(target_object, user, vote_type)

        content_type = cls.get_content_type(target_type)

        # Проверяем существующий голос
        existing_vote = Vote.objects.filter(
            user=user,
            content_type=content_type,
            object_id=target_id
        ).first()

        previous_vote_type = existing_vote.vote_type if existing_vote else None

        if existing_vote:
            if existing_vote.vote_type != vote_type:
                existing_vote.vote_type = vote_type
                existing_vote.save(update_fields=['vote_type', 'updated_at'])
            cls.award_upvote_reputation_if_needed(
                target_type=target_type,
                target_object=target_object,
                previous_vote_type=previous_vote_type,
                next_vote_type=existing_vote.vote_type,
                actor=user,
            )
            return existing_vote, False

        vote = Vote.objects.create(
            user=user,
            content_type=content_type,
            object_id=target_id,
            vote_type=vote_type
        )
        cls.award_upvote_reputation_if_needed(
            target_type=target_type,
            target_object=target_object,
            previous_vote_type=previous_vote_type,
            next_vote_type=vote.vote_type,
            actor=user,
        )
        return vote, True

    @staticmethod
    def remove_vote(target_type: str, target_id: str, user: CustomUser) -> None:
        """
        Удалить голос пользователя за объект
        :param target_type: Тип цели ('question' или 'solution')
        :param target_id: UUID цели
        :param user: Пользователь
        :return: None
        """
        VoteService.get_target_object(target_type, target_id)
        content_type = VoteService.get_content_type(target_type)

        Vote.objects.filter(
            user=user,
            content_type=content_type,
            object_id=target_id
        ).delete()

    @staticmethod
    def get_vote_stats(target_type: str, target_id: str) -> dict[str, int]:
        """
        Возвращает статистику голосов для объекта
        :param target_type: Тип цели ('question' или 'solution')
        :param target_id: UUID цели
        :return: dict с upvotes, downvotes, score
        """
        target_object = VoteService.get_target_object(target_type, target_id)
        content_type = VoteService.get_content_type(target_type)

        upvotes = Vote.objects.filter(
            content_type=content_type,
            object_id=target_id,
            vote_type=Vote.VoteType.UPVOTE
        ).count()

        downvotes = Vote.objects.filter(
            content_type=content_type,
            object_id=target_id,
            vote_type=Vote.VoteType.DOWNVOTE
        ).count()

        return {
            'upvotes': upvotes,
            'downvotes': downvotes,
            'score': upvotes - downvotes
        }

    @staticmethod
    def get_user_vote(target_type: str, target_id: str, user: CustomUser | None) -> str | None:
        """
        Возвращает голос текущего пользователя за объект
        :param target_type: Тип цели ('question' или 'solution')
        :param target_id: UUID цели
        :param user: Пользователь
        :return: vote_type ('up', 'down') или None если голоса нет
        """
        if not user or not user.is_authenticated:
            return None

        target_object = VoteService.get_target_object(target_type, target_id)
        content_type = VoteService.get_content_type(target_type)

        vote = Vote.objects.filter(
            user=user,
            content_type=content_type,
            object_id=target_id
        ).first()

        return vote.vote_type if vote else None
