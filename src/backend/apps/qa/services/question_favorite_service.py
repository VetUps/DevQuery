from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, OuterRef, QuerySet, Value
from django.db.models.functions import Coalesce

from ..models import Question, QuestionFavorite
from ...user.models import CustomUser


class QuestionFavoriteService:
    """
    Question-specific favorite operations.

    The service is intentionally not generic: this slice only supports favoriting
    questions, and all methods return persisted server truth rather than toggling
    state.
    """

    @staticmethod
    def add_favorite(user: CustomUser, question: Question) -> tuple[QuestionFavorite, bool]:
        """
        Idempotently add a favorite row for a user/question pair.

        :return: (favorite, created) where created is False when the row already existed.
        """
        try:
            with transaction.atomic():
                return QuestionFavorite.objects.get_or_create(user=user, question=question)
        except IntegrityError:
            # Concurrent duplicate inserts may race against the unique constraint.
            # Treat that as idempotent success by returning the row that won.
            return QuestionFavorite.objects.get(user=user, question=question), False

    @staticmethod
    def remove_favorite(user: CustomUser, question: Question) -> int:
        """
        Idempotently remove a favorite row.

        :return: number of favorite rows deleted (0 or 1 with the unique constraint).
        """
        deleted_count, _ = QuestionFavorite.objects.filter(user=user, question=question).delete()
        return deleted_count

    @staticmethod
    def annotate_favorites(queryset: QuerySet[Question], user: CustomUser | None = None) -> QuerySet[Question]:
        """
        Annotate questions with aggregate and viewer-specific favorite state.

        Adds:
        - favorites_count: public aggregate count, defaulting to 0.
        - is_favorited: True only for an authenticated viewer who favorited the row.
        """
        queryset = queryset.annotate(
            favorites_count=Coalesce(Count('favorites', distinct=True), Value(0)),
        )

        if user and user.is_authenticated:
            return queryset.annotate(
                is_favorited=Exists(
                    QuestionFavorite.objects.filter(user=user, question=OuterRef('pk'))
                )
            )

        return queryset.annotate(is_favorited=Value(False))

    @staticmethod
    def get_favorite_state(question: Question, user: CustomUser | None = None) -> dict[str, int | bool]:
        """
        Return the public count plus current viewer state for a question.

        Uses annotations when present and falls back to direct database truth for
        unannotated objects.
        """
        favorites_count = getattr(question, 'favorites_count', None)
        if favorites_count is None:
            favorites_count = QuestionFavorite.objects.filter(question=question).count()

        if user and user.is_authenticated:
            is_favorited = getattr(question, 'is_favorited', None)
            if is_favorited is None:
                is_favorited = QuestionFavorite.objects.filter(user=user, question=question).exists()
        else:
            is_favorited = False

        return {
            'favorites_count': favorites_count or 0,
            'is_favorited': bool(is_favorited),
        }
