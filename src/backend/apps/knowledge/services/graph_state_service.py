from __future__ import annotations

import re
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.knowledge.models import UserKnowledgeGraphState

_SAFE_PHASE_RE = re.compile(r'[^a-zA-Z0-9_.:-]+')
_SAFE_PHASE_MAX_LENGTH = 80

_REASON_MESSAGES = {
    UserKnowledgeGraphState.StaleReason.ACTIVITY_SYNC_FAILED: 'Graph activity sync failed',
    UserKnowledgeGraphState.StaleReason.ACTIVITY_REBUILD_FAILED: 'Graph activity rebuild failed',
    UserKnowledgeGraphState.StaleReason.MANUAL_REBUILD_REQUESTED: 'Graph rebuild was requested',
    UserKnowledgeGraphState.StaleReason.UNKNOWN: 'Graph freshness update failed',
}


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
