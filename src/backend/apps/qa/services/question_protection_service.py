from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from apps.qa.models import Question
from apps.user.models import CustomUser
from apps.user.services.reputation_service import ReputationService


@dataclass(frozen=True)
class ProtectionProgress:
    points_to_next_level: int | None = None
    next_level: str | None = None
    next_level_label: str | None = None


@dataclass(frozen=True)
class QuestionProtectionState:
    is_protected: bool
    author_level: str | None
    protected_until: timezone.datetime | None
    reason_code: str
    progress: ProtectionProgress


@dataclass(frozen=True)
class ProtectionDecision:
    allowed: bool
    reason_code: str
    required_level: str | None
    required_level_label: str | None
    viewer_level: str | None
    viewer_level_label: str | None
    protected_until: timezone.datetime | None
    points_to_next_level: int | None
    next_level: str | None
    next_level_label: str | None


class QuestionProtectionService:
    ANSWER_REQUIRED_LEVEL = CustomUser.ReputationLevel.EXPERT

    ANSWER_ALLOWED = 'answer_allowed'
    ANSWER_BLOCKED_INSUFFICIENT_LEVEL = 'answer_blocked_insufficient_level'
    ANSWER_BLOCKED_ANONYMOUS = 'answer_blocked_anonymous'

    DOWNVOTE_ALLOWED = 'question_downvote_allowed'
    DOWNVOTE_BLOCKED_PROTECTED = 'question_downvote_blocked_protected'

    NOT_PROTECTED = 'question_not_protected'
    PROTECTED_NEWCOMER = 'question_protected_newcomer'
    PROTECTED_MISSING_AUTHOR = 'question_not_protected_missing_author'

    @classmethod
    def get_protection_state(cls, question: Question) -> QuestionProtectionState:
        author = question.user
        protected_until = question.question_created_at + ReputationService.get_protected_newcomer_window()

        if author is None:
            return QuestionProtectionState(
                is_protected=False,
                author_level=None,
                protected_until=None,
                reason_code=cls.PROTECTED_MISSING_AUTHOR,
                progress=ProtectionProgress(),
            )

        author_progress = ReputationService.get_progress(author)
        author_level = author_progress['level']
        is_within_window = timezone.now() < protected_until
        is_protected = author_level == CustomUser.ReputationLevel.NEWCOMER and is_within_window

        return QuestionProtectionState(
            is_protected=is_protected,
            author_level=author_level,
            protected_until=protected_until if is_protected else None,
            reason_code=cls.PROTECTED_NEWCOMER if is_protected else cls.NOT_PROTECTED,
            progress=ProtectionProgress(
                points_to_next_level=author_progress.get('points_to_next_level'),
                next_level=author_progress.get('next_level'),
                next_level_label=author_progress.get('next_level_label'),
            ),
        )

    @classmethod
    def get_answer_eligibility(cls, question: Question, viewer: CustomUser | None) -> ProtectionDecision:
        state = cls.get_protection_state(question)
        if not state.is_protected:
            return cls._build_decision(
                allowed=True,
                reason_code=cls.ANSWER_ALLOWED,
                viewer=viewer,
                protected_until=None,
            )

        if viewer is None:
            return cls._build_decision(
                allowed=False,
                reason_code=cls.ANSWER_BLOCKED_ANONYMOUS,
                viewer=None,
                protected_until=state.protected_until,
            )

        viewer_progress = ReputationService.get_progress(viewer)
        viewer_level = viewer_progress['level']
        if cls._is_level_at_least(viewer_level, cls.ANSWER_REQUIRED_LEVEL):
            return cls._build_decision(
                allowed=True,
                reason_code=cls.ANSWER_ALLOWED,
                viewer=viewer,
                viewer_progress=viewer_progress,
                protected_until=state.protected_until,
            )

        return cls._build_decision(
            allowed=False,
            reason_code=cls.ANSWER_BLOCKED_INSUFFICIENT_LEVEL,
            viewer=viewer,
            viewer_progress=viewer_progress,
            protected_until=state.protected_until,
        )

    @classmethod
    def get_question_downvote_eligibility(cls, question: Question, viewer: CustomUser | None) -> ProtectionDecision:
        state = cls.get_protection_state(question)
        if not state.is_protected:
            return cls._build_decision(
                allowed=True,
                reason_code=cls.DOWNVOTE_ALLOWED,
                viewer=viewer,
                protected_until=None,
                required_level=None,
            )

        viewer_progress = ReputationService.get_progress(viewer) if viewer is not None else None
        return cls._build_decision(
            allowed=False,
            reason_code=cls.DOWNVOTE_BLOCKED_PROTECTED,
            viewer=viewer,
            viewer_progress=viewer_progress,
            protected_until=state.protected_until,
            required_level=None,
        )

    @classmethod
    def _build_decision(
        cls,
        *,
        allowed: bool,
        reason_code: str,
        viewer: CustomUser | None,
        viewer_progress: dict | None = None,
        protected_until,
        required_level: str | None = ANSWER_REQUIRED_LEVEL,
    ) -> ProtectionDecision:
        if viewer is not None and viewer_progress is None:
            viewer_progress = ReputationService.get_progress(viewer)

        required_level_label = (
            CustomUser.ReputationLevel(required_level).label if required_level is not None else None
        )
        viewer_level = viewer_progress.get('level') if viewer_progress else None
        viewer_level_label = viewer_progress.get('level_label') if viewer_progress else None

        return ProtectionDecision(
            allowed=allowed,
            reason_code=reason_code,
            required_level=required_level,
            required_level_label=required_level_label,
            viewer_level=viewer_level,
            viewer_level_label=viewer_level_label,
            protected_until=protected_until,
            points_to_next_level=viewer_progress.get('points_to_next_level') if viewer_progress else None,
            next_level=viewer_progress.get('next_level') if viewer_progress else None,
            next_level_label=viewer_progress.get('next_level_label') if viewer_progress else None,
        )

    @classmethod
    def _is_level_at_least(cls, actual_level: str, required_level: str) -> bool:
        ordered_levels = ReputationService.LEVEL_ORDER
        return ordered_levels.index(actual_level) >= ordered_levels.index(required_level)
