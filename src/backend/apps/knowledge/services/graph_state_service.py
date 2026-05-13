from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import DatabaseError
from django.utils import timezone

from apps.knowledge.models import UserKnowledgeGraphSemanticState, UserKnowledgeGraphState
from apps.qa.models import Question, QuestionEditProposal, Solution, SolutionEdits
from apps.user.models import ReputationTransaction

_SAFE_PHASE_RE = re.compile(r'[^a-zA-Z0-9_.:-]+')
_SAFE_PHASE_MAX_LENGTH = 80

_REASON_MESSAGES = {
    UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED: 'Graph activity sync failed',
    UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED: 'Graph activity rebuild failed',
    UserKnowledgeGraphState.StaleReason.MANUAL_REBUILD_REQUESTED: 'Graph rebuild was requested',
    UserKnowledgeGraphState.StaleReason.UNKNOWN: 'Graph freshness update failed',
}

_SUPPORTED_STRUCTURAL_LEDGER_REASONS = {
    ReputationTransaction.TransactionReason.BEST_SOLUTION,
    ReputationTransaction.TransactionReason.QUESTION_UPVOTED,
    ReputationTransaction.TransactionReason.SOLUTION_UPVOTED,
    ReputationTransaction.TransactionReason.APPROVED_EDIT,
}
logger = logging.getLogger(__name__)


class UserKnowledgeGraphRebuildError(Exception):
    """Safe owner-scoped graph rebuild failure for service/API callers."""


@dataclass(frozen=True)
class UserKnowledgeGraphRebuildSummary:
    """Aggregate, redaction-safe owner graph rebuild result."""

    user_id: Any
    structural_summary: Any
    activity_summary: Any
    state: UserKnowledgeGraphState
    semantic: dict[str, Any] | None = None

    @property
    def processed_questions(self) -> int:
        return self.structural_summary.processed_questions

    @property
    def processed_activity_sources(self) -> int:
        return self.activity_summary.processed_sources

    def as_stdout_fields(self) -> dict[str, int]:
        fields = {
            f'structural_{name}': value
            for name, value in self.structural_summary.as_stdout_fields().items()
        }
        fields.update(
            {
                f'activity_{name}': value
                for name, value in self.activity_summary.as_stdout_fields().items()
            }
        )
        return fields


def _user_id(user_or_id: Any) -> Any:
    return getattr(user_or_id, 'pk', user_or_id)


def _validate_reason(reason: str) -> str:
    valid_reasons = {choice.value for choice in UserKnowledgeGraphState.StaleReason}
    if reason not in valid_reasons:
        raise ValidationError({'stale_reason': [f'Unsupported graph stale reason: {reason}']})
    return reason


def _safe_phase(phase: str | None) -> str:
    if not phase:
        return ''
    normalized = _SAFE_PHASE_RE.sub('_', str(phase).strip()).strip('_.:-')
    if not normalized:
        return 'unknown'
    return normalized[:_SAFE_PHASE_MAX_LENGTH]


def _safe_error_message(*, reason: str, phase: str, error: BaseException | None) -> str:
    """Return a fixed diagnostic that never includes raw exception text."""

    if error is None:
        return ''
    base_message = _REASON_MESSAGES.get(reason, _REASON_MESSAGES[UserKnowledgeGraphState.StaleReason.UNKNOWN])
    if phase:
        return f'{base_message} during {phase}.'
    return f'{base_message}.'


def _save_state(state: UserKnowledgeGraphState, update_fields: list[str]) -> UserKnowledgeGraphState:
    state.full_clean()
    state.save(update_fields=[*update_fields, 'updated_at'])
    return state


def get_user_graph_state(user_or_id: Any) -> UserKnowledgeGraphState:
    """Return the durable per-user graph freshness row, creating a fresh default row once."""

    user_id = _user_id(user_or_id)
    if user_id is None:
        raise ValidationError({'user': ['A user or user id is required.']})
    state, _ = UserKnowledgeGraphState.objects.get_or_create(user_id=user_id)
    return state


def mark_user_graph_stale(
    user_or_id: Any,
    *,
    reason: str,
    phase: str | None = None,
    error: BaseException | None = None,
) -> UserKnowledgeGraphState:
    """Mark a user's graph stale with aggregate-safe diagnostics."""

    safe_reason = _validate_reason(reason)
    safe_phase = _safe_phase(phase)
    state = get_user_graph_state(user_or_id)
    state.status = UserKnowledgeGraphState.Status.STALE
    state.stale_reason = safe_reason
    state.last_failed_phase = safe_phase
    state.last_error_message = _safe_error_message(reason=safe_reason, phase=safe_phase, error=error)
    return _save_state(state, ['status', 'stale_reason', 'last_failed_phase', 'last_error_message'])


def mark_user_graph_failed(
    user_or_id: Any,
    *,
    reason: str,
    phase: str | None = None,
    error: BaseException | None = None,
) -> UserKnowledgeGraphState:
    """Mark a user's graph failed with aggregate-safe diagnostics."""

    safe_reason = _validate_reason(reason)
    safe_phase = _safe_phase(phase)
    state = get_user_graph_state(user_or_id)
    state.status = UserKnowledgeGraphState.Status.FAILED
    state.stale_reason = safe_reason
    state.last_failed_phase = safe_phase
    state.last_error_message = _safe_error_message(reason=safe_reason, phase=safe_phase, error=error)
    return _save_state(state, ['status', 'stale_reason', 'last_failed_phase', 'last_error_message'])


def mark_user_graph_rebuilding(user_or_id: Any, *, phase: str | None = None) -> UserKnowledgeGraphState:
    """Record that an owner-scoped graph rebuild is in progress."""

    state = get_user_graph_state(user_or_id)
    state.status = UserKnowledgeGraphState.Status.REBUILDING
    state.stale_reason = UserKnowledgeGraphState.StaleReason.MANUAL_REBUILD_REQUESTED
    state.last_error_message = ''
    state.last_failed_phase = _safe_phase(phase)
    state.last_rebuild_started_at = timezone.now()
    state.last_rebuild_finished_at = None
    return _save_state(
        state,
        [
            'status',
            'stale_reason',
            'last_error_message',
            'last_failed_phase',
            'last_rebuild_started_at',
            'last_rebuild_finished_at',
        ],
    )


def mark_user_graph_fresh(user_or_id: Any, *, phase: str | None = None) -> UserKnowledgeGraphState:
    """Record that a user's graph is fresh after a successful rebuild/sync."""

    state = get_user_graph_state(user_or_id)
    state.status = UserKnowledgeGraphState.Status.FRESH
    state.stale_reason = ''
    state.last_error_message = ''
    state.last_failed_phase = _safe_phase(phase)
    state.last_rebuild_finished_at = timezone.now()
    return _save_state(
        state,
        ['status', 'stale_reason', 'last_error_message', 'last_failed_phase', 'last_rebuild_finished_at'],
    )


def validate_user_for_graph_state(user_id: Any):
    """Return a user for callers that need to validate owner-scoped graph state input."""

    if user_id is None:
        return None
    User = get_user_model()
    return User.objects.get(pk=user_id)


def _safe_rebuild_failure(*, phase: str, exc: BaseException) -> UserKnowledgeGraphRebuildError:
    return UserKnowledgeGraphRebuildError(f'User knowledge graph rebuild failed during {_safe_phase(phase)}')


def _semantic_state_payload(state: UserKnowledgeGraphSemanticState) -> dict[str, Any]:
    return {
        'status': state.status,
        'reason_code': state.reason_code,
        'phase': state.phase,
        'enabled': state.enabled,
        'dry_run': state.dry_run,
        'source_provider': state.source_provider,
        'source_model': state.source_model,
        'grouping_provider': state.grouping_provider,
        'grouping_model': state.grouping_model,
        'source_item_count': state.source_item_count,
        'semantic_group_count': state.semantic_group_count,
        'semantic_group_membership_count': state.semantic_group_membership_count,
        'estimated_token_count': state.estimated_token_count,
        'estimated_cost': state.estimated_cost,
        'budget_cap': state.budget_cap,
        'last_error_message': state.last_error_message,
        'started_at': state.started_at,
        'finished_at': state.finished_at,
    }


def _mark_semantic_boundary_unavailable(user) -> dict[str, Any]:
    now = timezone.now()
    state, _ = UserKnowledgeGraphSemanticState.objects.get_or_create(user=user)
    state.status = UserKnowledgeGraphSemanticState.Status.PROVIDER_ERROR
    state.reason_code = 'provider_error'
    state.phase = 'semantic_boundary'
    state.last_error_message = 'Knowledge graph semantic boundary failed after base rebuild.'
    state.started_at = state.started_at or now
    state.finished_at = now
    state.save(update_fields=['status', 'reason_code', 'phase', 'last_error_message', 'started_at', 'finished_at', 'updated_at'])
    return _semantic_state_payload(state)


def _question_id_from_ledger_source(source_object: object | None):
    if source_object is None:
        return None
    if isinstance(source_object, Question):
        return source_object.pk
    if isinstance(source_object, Solution):
        return source_object.question_id
    if isinstance(source_object, QuestionEditProposal):
        return source_object.question_id
    if isinstance(source_object, SolutionEdits):
        return source_object.solution.question_id
    return None


def _tracked_structural_question_ids(user) -> set[Any]:
    question_ids = set(
        Question.objects.filter(user=user).values_list('pk', flat=True)
    )
    question_ids.update(
        Solution.objects.filter(user=user).values_list('question_id', flat=True)
    )

    ledger_rows = (
        ReputationTransaction.objects.filter(
            user=user,
            reputation_transaction_reason__in=_SUPPORTED_STRUCTURAL_LEDGER_REASONS,
        )
        .select_related('content_type')
        .order_by('pk')
    )
    for transaction_row in ledger_rows:
        question_id = _question_id_from_ledger_source(transaction_row.source)
        if question_id is not None:
            question_ids.add(question_id)

    question_ids.discard(None)
    return question_ids


def get_user_structural_question_queryset(user_or_id):
    """Return questions whose graph structure can affect one owner's activity rebuild."""

    user = validate_user_for_graph_state(_user_id(user_or_id))
    question_ids = _tracked_structural_question_ids(user)
    return Question.objects.filter(pk__in=question_ids).order_by('pk')


def rebuild_user_knowledge_graph(user_or_id) -> UserKnowledgeGraphRebuildSummary:
    """Synchronously rebuild one owner's structural inputs and concept activity.

    The state row is marked rebuilding first, failed with fixed diagnostics on any
    structural/activity exception, and fresh only after the activity rebuild has
    completed successfully. The service accepts a user instance or primary key so
    the later owner-only API can validate ownership before delegating here.
    """

    try:
        user = validate_user_for_graph_state(_user_id(user_or_id))
    except (ObjectDoesNotExist, ValidationError, ValueError, TypeError) as exc:
        raise _safe_rebuild_failure(phase='validate_user', exc=exc) from exc

    if user is None:
        raise UserKnowledgeGraphRebuildError('User knowledge graph rebuild requires a user')

    mark_user_graph_rebuilding(user, phase='owner_rebuild')
    logger.info(
        'knowledge graph owner rebuild started',
        extra={
            'event': 'knowledge_graph_owner_rebuild_started',
            'user_id': str(user.pk),
            'phase': 'owner_rebuild',
        },
    )

    try:
        from apps.knowledge.services.activity_service import rebuild_user_concept_activity
        from apps.knowledge.services.lifecycle_service import rebuild_structural_graph

        structural_summary = rebuild_structural_graph(get_user_structural_question_queryset(user))
        logger.info(
            'knowledge graph owner structural rebuild completed',
            extra={
                'event': 'knowledge_graph_owner_structural_rebuild_completed',
                'user_id': str(user.pk),
                'phase': 'structural_rebuild',
                **{f'structural_{name}': value for name, value in structural_summary.as_stdout_fields().items()},
            },
        )
    except (DatabaseError, Exception) as exc:
        mark_user_graph_failed(
            user,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED,
            phase='structural_rebuild',
            error=exc,
        )
        logger.warning(
            'knowledge graph owner structural rebuild failed safely',
            extra={
                'event': 'knowledge_graph_owner_rebuild_failed',
                'user_id': str(user.pk),
                'phase': 'structural_rebuild',
                'reason': UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED,
                'error_type': exc.__class__.__name__,
            },
        )
        raise _safe_rebuild_failure(phase='structural_rebuild', exc=exc) from exc

    try:
        activity_summary = rebuild_user_concept_activity(user_id=user.pk)
        logger.info(
            'knowledge graph owner activity rebuild completed',
            extra={
                'event': 'knowledge_graph_owner_activity_rebuild_completed',
                'user_id': str(user.pk),
                'phase': 'activity_rebuild',
                **{f'activity_{name}': value for name, value in activity_summary.as_stdout_fields().items()},
            },
        )
    except (DatabaseError, Exception) as exc:
        mark_user_graph_failed(
            user,
            reason=UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED,
            phase='activity_rebuild',
            error=exc,
        )
        logger.warning(
            'knowledge graph owner activity rebuild failed safely',
            extra={
                'event': 'knowledge_graph_owner_rebuild_failed',
                'user_id': str(user.pk),
                'phase': 'activity_rebuild',
                'reason': UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED,
                'error_type': exc.__class__.__name__,
            },
        )
        raise _safe_rebuild_failure(phase='activity_rebuild', exc=exc) from exc

    state = mark_user_graph_fresh(user, phase='owner_rebuild')

    semantic = None
    try:
        from apps.knowledge.services.semantic_rebuild_service import run_owner_semantic_boundary

        semantic = run_owner_semantic_boundary(user)
        logger.info(
            'knowledge graph owner semantic rebuild completed',
            extra={
                'event': 'knowledge_graph_owner_semantic_rebuild_completed',
                'user_id': str(user.pk),
                'phase': 'semantic_rebuild',
                'semantic_status': semantic.get('status') if semantic else None,
                'semantic_reason_code': semantic.get('reason_code') if semantic else None,
                'semantic_group_count': semantic.get('semantic_group_count') if semantic else None,
                'neighbour_candidate_count': semantic.get('neighbour_candidate_count') if semantic else None,
            },
        )
    except Exception as exc:
        # Semantic enrichment is an additive M016 boundary check.  It must never
        # roll back or degrade the already-fresh structural/activity graph; the
        # semantic service is responsible for normal provider/config/budget
        # diagnostics, and this catch preserves base rebuild success if an
        # unexpected semantic seam regression escapes that service.
        semantic = _mark_semantic_boundary_unavailable(user)
        logger.warning(
            'knowledge graph owner semantic rebuild hit unexpected safe fallback: semantic_status=%s reason_code=%s error_type=%s',
            semantic.get('status'),
            semantic.get('reason_code'),
            exc.__class__.__name__,
            extra={
                'event': 'knowledge_graph_owner_semantic_rebuild_unexpected_failure',
                'user_id': str(user.pk),
                'phase': 'semantic_rebuild',
                'semantic_status': semantic.get('status'),
                'semantic_reason_code': semantic.get('reason_code'),
                'error_type': exc.__class__.__name__,
            },
        )

    logger.info(
        'knowledge graph owner rebuild completed',
        extra={
            'event': 'knowledge_graph_owner_rebuild_completed',
            'user_id': str(user.pk),
            'phase': 'owner_rebuild',
            **{f'structural_{name}': value for name, value in structural_summary.as_stdout_fields().items()},
            **{f'activity_{name}': value for name, value in activity_summary.as_stdout_fields().items()},
            'graph_status': state.status,
            'semantic_status': semantic.get('status') if semantic else None,
            'semantic_reason_code': semantic.get('reason_code') if semantic else None,
        },
    )

    return UserKnowledgeGraphRebuildSummary(
        user_id=user.pk,
        structural_summary=structural_summary,
        activity_summary=activity_summary,
        state=state,
        semantic=semantic,
    )
