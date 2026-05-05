from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.user.models import CustomUser, ReputationLevelThreshold, ReputationTransaction


DEFAULT_THRESHOLDS = {
    CustomUser.ReputationLevel.NEWCOMER: 0,
    CustomUser.ReputationLevel.PARTICIPANT: 30,
    CustomUser.ReputationLevel.EXPERT: 100,
    CustomUser.ReputationLevel.MASTER: 300,
}


@dataclass(frozen=True)
class ResolvedReputationLevel:
    value: str
    label: str
    minimum_score: int
    is_manual_override: bool = False


class ReputationService:
    LEVEL_ORDER = [
        CustomUser.ReputationLevel.NEWCOMER,
        CustomUser.ReputationLevel.PARTICIPANT,
        CustomUser.ReputationLevel.EXPERT,
        CustomUser.ReputationLevel.MASTER,
    ]

    @classmethod
    def _thresholds(cls) -> list[ReputationLevelThreshold]:
        thresholds = list(ReputationLevelThreshold.objects.filter(is_active=True).order_by('minimum_score'))
        if thresholds:
            cls.validate_thresholds(thresholds)
            return thresholds

        return [
            ReputationLevelThreshold(level=level, minimum_score=score, is_active=True)
            for level, score in DEFAULT_THRESHOLDS.items()
        ]

    @classmethod
    def validate_thresholds(cls, thresholds: Iterable[ReputationLevelThreshold]) -> None:
        ordered_thresholds = sorted(thresholds, key=lambda threshold: threshold.minimum_score)
        seen_levels = {threshold.level for threshold in ordered_thresholds}
        expected_levels = set(cls.LEVEL_ORDER)

        missing_levels = expected_levels - seen_levels
        if missing_levels:
            raise ValidationError(f'Не настроены пороги репутации: {", ".join(sorted(missing_levels))}.')

        newcomer_threshold = next(
            threshold for threshold in ordered_thresholds if threshold.level == CustomUser.ReputationLevel.NEWCOMER
        )
        if newcomer_threshold.minimum_score != 0:
            raise ValidationError('Порог уровня newcomer должен начинаться с 0.')

        previous_score = None
        for threshold in ordered_thresholds:
            if previous_score is not None and threshold.minimum_score <= previous_score:
                raise ValidationError('Пороги репутации должны строго возрастать.')
            previous_score = threshold.minimum_score

    @classmethod
    def resolve_level(cls, *, score: int | None = None, user: CustomUser | None = None) -> ResolvedReputationLevel:
        if user is not None and user.manual_reputation_level:
            return ResolvedReputationLevel(
                value=user.manual_reputation_level,
                label=CustomUser.ReputationLevel(user.manual_reputation_level).label,
                minimum_score=next(
                    threshold.minimum_score for threshold in cls._thresholds() if threshold.level == user.manual_reputation_level
                ),
                is_manual_override=True,
            )

        reputation_score = user.user_reputation_score if user is not None else score
        if reputation_score is None:
            raise ValidationError('Нужно передать пользователя или значение репутации.')

        matching_threshold = cls._thresholds()[0]
        for threshold in cls._thresholds():
            if reputation_score >= threshold.minimum_score:
                matching_threshold = threshold
            else:
                break

        return ResolvedReputationLevel(
            value=matching_threshold.level,
            label=CustomUser.ReputationLevel(matching_threshold.level).label,
            minimum_score=matching_threshold.minimum_score,
            is_manual_override=False,
        )

    @classmethod
    def get_progress(cls, user: CustomUser) -> dict:
        thresholds = cls._thresholds()
        resolved_level = cls.resolve_level(user=user)
        current_index = next(index for index, threshold in enumerate(thresholds) if threshold.level == resolved_level.value)
        next_threshold = thresholds[current_index + 1] if current_index + 1 < len(thresholds) else None

        return {
            'score': user.user_reputation_score,
            'level': resolved_level.value,
            'level_label': resolved_level.label,
            'level_minimum_score': resolved_level.minimum_score,
            'is_manual_override': resolved_level.is_manual_override,
            'manual_level': user.manual_reputation_level,
            'next_level': next_threshold.level if next_threshold else None,
            'next_level_label': CustomUser.ReputationLevel(next_threshold.level).label if next_threshold else None,
            'next_level_minimum_score': next_threshold.minimum_score if next_threshold else None,
            'points_to_next_level': max(next_threshold.minimum_score - user.user_reputation_score, 0) if next_threshold else 0,
        }

    @classmethod
    def record_transaction(
        cls,
        *,
        user: CustomUser,
        amount: int,
        reason: str,
        actor: CustomUser | None = None,
        source=None,
        note: str = '',
    ) -> ReputationTransaction:
        if amount == 0:
            raise ValidationError('Изменение репутации не может быть нулевым.')

        with transaction.atomic():
            locked_user = CustomUser.objects.select_for_update().get(pk=user.pk)
            next_score = locked_user.user_reputation_score + amount
            if next_score < 0:
                raise ValidationError('Репутация пользователя не может быть отрицательной.')

            locked_user.user_reputation_score = next_score
            locked_user.save(update_fields=['user_reputation_score'])

            content_type = None
            object_id = None
            if source is not None:
                content_type = ContentType.objects.get_for_model(source, for_concrete_model=False)
                object_id = source.pk

            return ReputationTransaction.objects.create(
                user=locked_user,
                actor=actor,
                reputation_transaction_amount=amount,
                reputation_transaction_reason=reason,
                content_type=content_type,
                object_id=object_id,
                note=note,
            )
