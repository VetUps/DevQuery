# Кратко: считает изменения репутации.
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ValidationError

from apps.user.models import CustomUser, ReputationLevelThreshold, ReputationPolicyConfig, ReputationTransaction


DEFAULT_THRESHOLDS = {
    CustomUser.ReputationLevel.NEWCOMER: 0,
    CustomUser.ReputationLevel.PARTICIPANT: 30,
    CustomUser.ReputationLevel.EXPERT: 100,
    CustomUser.ReputationLevel.MASTER: 300,
}
DEFAULT_PROTECTED_NEWCOMER_WINDOW_HOURS = 12


@dataclass(frozen=True)
class ResolvedReputationLevel:
    value: str
    label: str
    minimum_score: int
    is_manual_override: bool = False
    manual_level: str | None = None
    manual_level_label: str | None = None
    derived_level: str | None = None
    derived_level_label: str | None = None


class ReputationService:
    LEVEL_ORDER = [
        CustomUser.ReputationLevel.NEWCOMER,
        CustomUser.ReputationLevel.PARTICIPANT,
        CustomUser.ReputationLevel.EXPERT,
        CustomUser.ReputationLevel.MASTER,
    ]

    @classmethod
    def _thresholds(cls) -> list[ReputationLevelThreshold]:
        """Обрабатывает thresholds."""
        thresholds = list(ReputationLevelThreshold.objects.filter(is_active=True).order_by('minimum_score'))
        if thresholds:
            cls.validate_thresholds(thresholds)
            return thresholds

        return [
            ReputationLevelThreshold(level=level, minimum_score=score, is_active=True)
            for level, score in DEFAULT_THRESHOLDS.items()
        ]

    @classmethod
    def get_policy_config(cls) -> ReputationPolicyConfig:
        """Возвращает данные policy настроек."""
        config = ReputationPolicyConfig.objects.order_by('created_at').first()
        if config is not None:
            config.full_clean()
            return config

        return ReputationPolicyConfig(protected_newcomer_window_hours=DEFAULT_PROTECTED_NEWCOMER_WINDOW_HOURS)

    @classmethod
    def get_protected_newcomer_window(cls):
        """Возвращает данные protected newcomer window."""
        return cls.get_policy_config().protected_newcomer_window

    @classmethod
    def get_protected_newcomer_window_hours(cls) -> int:
        """Возвращает данные protected newcomer window hours."""
        return cls.get_policy_config().protected_newcomer_window_hours

    @classmethod
    def update_protected_newcomer_window_hours(cls, protected_newcomer_window_hours: int) -> ReputationPolicyConfig:
        """Обновляет данные protected newcomer window hours."""
        with transaction.atomic():
            config = ReputationPolicyConfig.objects.select_for_update().filter(singleton_key='default').first()
            if config is None:
                config = ReputationPolicyConfig()

            config.protected_newcomer_window_hours = protected_newcomer_window_hours
            try:
                config.full_clean()
            except DjangoValidationError as exc:
                raise ValidationError(exc.message_dict) from exc
            config.save()
            return config

    @classmethod
    def _level_label(cls, level: str) -> str:
        """Обрабатывает level метку."""
        return CustomUser.ReputationLevel(level).label

    @classmethod
    def _minimum_score_for_level(cls, level: str) -> int:
        """Обрабатывает minimum оценку level."""
        return next(
            threshold.minimum_score for threshold in cls._thresholds() if threshold.level == level
        )

    @classmethod
    def _resolve_level_from_score(cls, score: int) -> ResolvedReputationLevel:
        """Обрабатывает resolve level оценку."""
        matching_threshold = cls._thresholds()[0]
        for threshold in cls._thresholds():
            if score >= threshold.minimum_score:
                matching_threshold = threshold
            else:
                break

        return ResolvedReputationLevel(
            value=matching_threshold.level,
            label=cls._level_label(matching_threshold.level),
            minimum_score=matching_threshold.minimum_score,
            is_manual_override=False,
            manual_level=None,
            manual_level_label=None,
            derived_level=matching_threshold.level,
            derived_level_label=cls._level_label(matching_threshold.level),
        )

    @classmethod
    def validate_thresholds(cls, thresholds: Iterable[ReputationLevelThreshold]) -> None:
        """Проверяет поле thresholds перед сохранением."""
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
        """Обрабатывает resolve level."""
        if user is not None:
            derived_resolution = cls._resolve_level_from_score(user.user_reputation_score)
            if user.manual_reputation_level:
                manual_level = user.manual_reputation_level
                return ResolvedReputationLevel(
                    value=manual_level,
                    label=cls._level_label(manual_level),
                    minimum_score=cls._minimum_score_for_level(manual_level),
                    is_manual_override=True,
                    manual_level=manual_level,
                    manual_level_label=cls._level_label(manual_level),
                    derived_level=derived_resolution.value,
                    derived_level_label=derived_resolution.label,
                )

            return derived_resolution

        if score is None:
            raise ValidationError('Нужно передать пользователя или значение репутации.')

        return cls._resolve_level_from_score(score)

    @classmethod
    def get_progress(cls, user: CustomUser) -> dict:
        """Возвращает данные progress."""
        thresholds = cls._thresholds()
        resolved_level = cls.resolve_level(user=user)
        progression_level = resolved_level.derived_level or resolved_level.value
        current_index = next(index for index, threshold in enumerate(thresholds) if threshold.level == progression_level)
        next_threshold = thresholds[current_index + 1] if current_index + 1 < len(thresholds) else None

        return {
            'score': user.user_reputation_score,
            'level': resolved_level.value,
            'level_label': resolved_level.label,
            'level_minimum_score': resolved_level.minimum_score,
            'is_manual_override': resolved_level.is_manual_override,
            'manual_level': resolved_level.manual_level,
            'manual_level_label': resolved_level.manual_level_label,
            'derived_level': resolved_level.derived_level,
            'derived_level_label': resolved_level.derived_level_label,
            'next_level': next_threshold.level if next_threshold else None,
            'next_level_label': CustomUser.ReputationLevel(next_threshold.level).label if next_threshold else None,
            'next_level_minimum_score': next_threshold.minimum_score if next_threshold else None,
            'points_to_next_level': max(next_threshold.minimum_score - user.user_reputation_score, 0) if next_threshold else 0,
        }

    @classmethod
    def set_manual_level_override(
        cls,
        *,
        user: CustomUser,
        manual_level: str | None,
        actor: CustomUser | None = None,
        note: str = '',
    ) -> CustomUser:
        """Обновляет данные manual level override."""
        if manual_level in {'', None}:
            normalized_level = None
        else:
            try:
                normalized_level = CustomUser.ReputationLevel(manual_level).value
            except ValueError as exc:
                raise ValidationError({'manual_reputation_level': _('Некорректный уровень репутации.')}) from exc

        with transaction.atomic():
            locked_user = CustomUser.objects.select_for_update().get(pk=user.pk)
            previous_manual_level = locked_user.manual_reputation_level
            if previous_manual_level == normalized_level:
                return locked_user

            locked_user.manual_reputation_level = normalized_level

            # Manual overrides normally move the score to the target level floor so admin views,
            # ledgers, and derived progress stay consistent. The newcomer override is different:
            # it is used as a temporary capability gate and must not erase earned reputation.
            score_delta = 0
            update_fields = ['manual_reputation_level']
            if normalized_level is not None:
                target_score = cls._minimum_score_for_level(normalized_level)
                previous_score = locked_user.user_reputation_score
                should_adjust_score = normalized_level != CustomUser.ReputationLevel.NEWCOMER
                if should_adjust_score and target_score != previous_score:
                    score_delta = target_score - previous_score
                    locked_user.user_reputation_score = target_score
                    update_fields.append('user_reputation_score')

            locked_user.save(update_fields=update_fields)
            user.manual_reputation_level = normalized_level
            user.user_reputation_score = locked_user.user_reputation_score

            note_lines = []
            if previous_manual_level:
                note_lines.append(f'Предыдущий ручной уровень: {cls._level_label(previous_manual_level)}.')
            else:
                note_lines.append('Предыдущий ручной уровень отсутствовал.')

            if normalized_level:
                note_lines.append(f'Новый ручной уровень: {cls._level_label(normalized_level)}.')
            else:
                note_lines.append('Ручной уровень очищен.')

            resolved_after_change = cls.resolve_level(user=locked_user)
            note_lines.append(
                f'Расчетный уровень по очкам: {resolved_after_change.derived_level_label or resolved_after_change.label}.'
            )
            note_lines.append(f'Текущий счет репутации: {locked_user.user_reputation_score}.')
            if score_delta != 0:
                note_lines.append(f'Изменение очков: {score_delta:+d}.')
            if note:
                note_lines.append(note)

            ReputationTransaction.objects.create(
                user=locked_user,
                actor=actor,
                reputation_transaction_amount=score_delta,
                reputation_transaction_reason=ReputationTransaction.TransactionReason.MANUAL_LEVEL_OVERRIDE,
                note=' '.join(note_lines),
            )

            return locked_user

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
        """Обрабатывает record транзакцию."""
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
