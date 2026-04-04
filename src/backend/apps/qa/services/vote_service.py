from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, OuterRef, Subquery, CharField, F, IntegerField, Value, QuerySet
from django.db.models.functions import Coalesce
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound

from ..models import Vote, Question, Solution
from ...user.models import CustomUser


class VoteService:
    """
    Сервис для управления голосами
    """

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
    def validate_vote_permission(target_object: Question | Solution, user: CustomUser) -> None:
        """
        Проверяет, что пользователь не голосует за собственный контент
        :param target_object: Объект вопроса или решения
        :param user: Пользователь
        :raises PermissionDenied: если пользователь пытается голосовать за свой контент
        """
        if target_object.user == user:
            raise PermissionDenied('Нельзя голосовать за собственный контент')

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
    def cast_vote(target_type: str, target_id: str, vote_type: str, user: CustomUser) -> tuple[Vote, bool]:
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

        target_object = VoteService.get_target_object(target_type, target_id)
        VoteService.validate_vote_permission(target_object, user)

        content_type = VoteService.get_content_type(target_type)

        # Проверяем существующий голос
        existing_vote = Vote.objects.filter(
            user=user,
            content_type=content_type,
            object_id=target_id
        ).first()

        if existing_vote:
            if existing_vote.vote_type != vote_type:
                existing_vote.vote_type = vote_type
                existing_vote.save(update_fields=['vote_type', 'updated_at'])
            return existing_vote, False

        vote = Vote.objects.create(
            user=user,
            content_type=content_type,
            object_id=target_id,
            vote_type=vote_type
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
