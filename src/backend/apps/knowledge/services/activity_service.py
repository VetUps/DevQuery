from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import DatabaseError, transaction
from django.db.models import Count, Sum

from apps.knowledge.models import QuestionConceptEdge, UserConceptActivity
from apps.knowledge.services.activity_types import (
    APPROVED_EDIT,
    AUTHORED_QUESTION,
    BEST_SOLUTION,
    CANONICAL_ACTIVITY_WEIGHTS,
    POSTED_SOLUTION,
    QUESTION_UPVOTE,
    SOLUTION_UPVOTE,
)
from apps.qa.models import Question, QuestionEditProposal, Solution, SolutionEdits
from apps.user.models import ReputationTransaction


class UserConceptActivityRebuildError(Exception):
    """Safe aggregate exception for user concept activity rebuild failures."""


SUPPORTED_LEDGER_REASON_TO_ACTIVITY = {
    ReputationTransaction.TransactionReason.BEST_SOLUTION: BEST_SOLUTION,
    ReputationTransaction.TransactionReason.QUESTION_UPVOTED: QUESTION_UPVOTE,
    ReputationTransaction.TransactionReason.SOLUTION_UPVOTED: SOLUTION_UPVOTE,
    ReputationTransaction.TransactionReason.APPROVED_EDIT: APPROVED_EDIT,
}

ACTIVITY_SOURCE_BY_TYPE = {
    AUTHORED_QUESTION: UserConceptActivity.Source.QUESTION,
    POSTED_SOLUTION: UserConceptActivity.Source.SOLUTION,
    BEST_SOLUTION: UserConceptActivity.Source.REPUTATION_TRANSACTION,
    APPROVED_EDIT: UserConceptActivity.Source.REPUTATION_TRANSACTION,
    QUESTION_UPVOTE: UserConceptActivity.Source.REPUTATION_TRANSACTION,
    SOLUTION_UPVOTE: UserConceptActivity.Source.REPUTATION_TRANSACTION,
}


@dataclass(frozen=True)
class ActivitySource:
    user: object
    activity_type: str
    source_object: object
    related_question: Question


@dataclass
class UserConceptActivityRebuildSummary:
    """Aggregate, redaction-safe summary for activity rebuilds."""

    processed_sources: int = 0
    created_rows: int = 0
    updated_rows: int = 0
    skipped_sources: int = 0
    skipped_by_reason: dict[str, int] = field(default_factory=dict)
    rows_by_activity_type: dict[str, int] = field(default_factory=dict)

    def mark_skipped(self, reason: str) -> None:
        self.skipped_sources += 1
        self.skipped_by_reason[reason] = self.skipped_by_reason.get(reason, 0) + 1

    def mark_rows(self, activity_type: str, *, created: int, updated: int) -> None:
        self.created_rows += created
        self.updated_rows += updated
        self.rows_by_activity_type[activity_type] = (
            self.rows_by_activity_type.get(activity_type, 0) + created + updated
        )

    def as_stdout_fields(self) -> dict[str, int]:
        fields = {
            'processed_sources': self.processed_sources,
            'created_rows': self.created_rows,
            'updated_rows': self.updated_rows,
            'skipped_sources': self.skipped_sources,
        }
        for activity_type in sorted(CANONICAL_ACTIVITY_WEIGHTS):
            fields[activity_type] = self.rows_by_activity_type.get(activity_type, 0)
        for reason in sorted(self.skipped_by_reason):
            fields[f'skipped_{reason}'] = self.skipped_by_reason[reason]
        return fields


@dataclass(frozen=True)
class UserConceptActivitySummary:
    """Explainable per-user concept totals without exposing raw activity rows."""

    user_id: object
    total_weight: Decimal
    totals_by_concept: dict[int, Decimal]
    breakdown_by_activity_type: dict[str, Decimal]
    source_counts_by_activity_type: dict[str, int]
    related_question_ids: list[object]


def _source_label(source_object: object) -> str:
    return source_object.__class__.__name__.lower()


def _idempotency_key(*, source_object: object, concept_id: int, activity_type: str) -> str:
    return f'{activity_type}:{_source_label(source_object)}:{source_object.pk}:concept:{concept_id}'


def _question_edges(question: Question) -> list[QuestionConceptEdge]:
    prefetched = getattr(question, '_prefetched_objects_cache', {}).get('concept_edges')
    if prefetched is not None:
        return list(prefetched)
    return list(question.concept_edges.select_related('concept').order_by('concept_id'))


def _safe_pk(source_object: object) -> object:
    return getattr(source_object, 'pk', None)


def _upsert_activity_for_source(source: ActivitySource, *, edges: list[QuestionConceptEdge] | None = None) -> tuple[int, int, bool]:
    edges = edges if edges is not None else _question_edges(source.related_question)
    if not edges:
        return 0, 0, True

    activity_source = ACTIVITY_SOURCE_BY_TYPE[source.activity_type]
    weight = CANONICAL_ACTIVITY_WEIGHTS[source.activity_type]
    source_content_type = ContentType.objects.get_for_model(source.source_object, for_concrete_model=False)
    created_rows = 0
    updated_rows = 0

    for edge in edges:
        defaults = {
            'user': source.user,
            'concept': edge.concept,
            'activity_type': source.activity_type,
            'weight_delta': weight,
            'source': activity_source,
            'provider': 'activity-rebuild',
            'confidence': edge.confidence,
            'source_content_type': source_content_type,
            'source_object_id': _safe_pk(source.source_object),
            'related_question': source.related_question,
        }
        key = _idempotency_key(
            source_object=source.source_object,
            concept_id=edge.concept_id,
            activity_type=source.activity_type,
        )
        existing = UserConceptActivity.objects.filter(idempotency_key=key).first()
        if existing is None:
            UserConceptActivity.objects.create(idempotency_key=key, **defaults)
            created_rows += 1
            continue

        changed_fields = []
        for field_name, value in defaults.items():
            current_value = getattr(existing, field_name)
            if current_value != value:
                setattr(existing, field_name, value)
                changed_fields.append(field_name)
        if changed_fields:
            existing.save(update_fields=[*changed_fields, 'updated_at'])
            updated_rows += 1

    return created_rows, updated_rows, False


def _question_sources(queryset: Iterable[Question]) -> Iterable[ActivitySource | str]:
    for question in queryset:
        if question.user_id is None:
            yield 'missing_user'
            continue
        yield ActivitySource(
            user=question.user,
            activity_type=AUTHORED_QUESTION,
            source_object=question,
            related_question=question,
        )


def _solution_sources(queryset: Iterable[Solution]) -> Iterable[ActivitySource | str]:
    for solution in queryset:
        if solution.user_id is None:
            yield 'missing_user'
            continue
        if solution.question_id is None:
            yield 'missing_related_question'
            continue
        yield ActivitySource(
            user=solution.user,
            activity_type=POSTED_SOLUTION,
            source_object=solution,
            related_question=solution.question,
        )


def _source_question_for_transaction(transaction_row: ReputationTransaction) -> Question | None:
    source_object = transaction_row.source
    if source_object is None:
        return None
    if isinstance(source_object, Question):
        return source_object
    if isinstance(source_object, Solution):
        return source_object.question
    if isinstance(source_object, QuestionEditProposal):
        return source_object.question
    if isinstance(source_object, SolutionEdits):
        return source_object.solution.question
    return None


def _ledger_sources(queryset: Iterable[ReputationTransaction]) -> Iterable[ActivitySource | str]:
    for transaction_row in queryset:
        activity_type = SUPPORTED_LEDGER_REASON_TO_ACTIVITY.get(transaction_row.reputation_transaction_reason)
        if activity_type is None:
            yield 'unsupported_ledger_reason'
            continue
        if transaction_row.user_id is None:
            yield 'missing_user'
            continue
        related_question = _source_question_for_transaction(transaction_row)
        if related_question is None:
            yield 'missing_related_question'
            continue
        yield ActivitySource(
            user=transaction_row.user,
            activity_type=activity_type,
            source_object=transaction_row,
            related_question=related_question,
        )


def _apply_sources(sources: Iterable[ActivitySource | str], summary: UserConceptActivityRebuildSummary) -> None:
    edge_cache: dict[object, list[QuestionConceptEdge]] = {}
    for source in sources:
        summary.processed_sources += 1
        if isinstance(source, str):
            summary.mark_skipped(source)
            continue
        question_key = source.related_question.pk
        if question_key not in edge_cache:
            edge_cache[question_key] = _question_edges(source.related_question)
        created_rows, updated_rows, skipped_for_edges = _upsert_activity_for_source(
            source,
            edges=edge_cache[question_key],
        )
        if skipped_for_edges:
            summary.mark_skipped('missing_concept_edges')
            continue
        summary.mark_rows(source.activity_type, created=created_rows, updated=updated_rows)


def rebuild_user_concept_activity(*, user_id=None) -> UserConceptActivityRebuildSummary:
    """Rebuild durable positive user-concept activity from current source facts and ledger facts."""

    question_queryset = (
        Question.objects.select_related('user')
        .prefetch_related('concept_edges__concept')
        .order_by('pk')
    )
    solution_queryset = (
        Solution.objects.select_related('user', 'question')
        .prefetch_related('question__concept_edges__concept')
        .order_by('pk')
    )
    ledger_queryset = (
        ReputationTransaction.objects.select_related('user', 'content_type')
        .order_by('pk')
    )

    if user_id is not None:
        question_queryset = question_queryset.filter(user_id=user_id)
        solution_queryset = solution_queryset.filter(user_id=user_id)
        ledger_queryset = ledger_queryset.filter(user_id=user_id)

    summary = UserConceptActivityRebuildSummary()
    try:
        with transaction.atomic():
            _apply_sources(_question_sources(question_queryset), summary)
            _apply_sources(_solution_sources(solution_queryset), summary)
            _apply_sources(_ledger_sources(ledger_queryset), summary)
    except DatabaseError as exc:
        raise UserConceptActivityRebuildError('activity rebuild database write failed') from exc
    except Exception as exc:  # defensive boundary for command-safe diagnostics
        raise UserConceptActivityRebuildError('activity rebuild failed') from exc

    return summary


def get_user_concept_activity_summary(user_or_id) -> UserConceptActivitySummary:
    """Return redacted explainable totals for a single user."""

    user_id = getattr(user_or_id, 'pk', user_or_id)
    rows = UserConceptActivity.objects.filter(user_id=user_id)

    totals_by_concept = {
        row['concept_id']: row['total'] or Decimal('0.0000')
        for row in rows.values('concept_id').annotate(total=Sum('weight_delta')).order_by('concept_id')
    }
    breakdown_by_activity_type = {
        row['activity_type']: row['total'] or Decimal('0.0000')
        for row in rows.values('activity_type').annotate(total=Sum('weight_delta')).order_by('activity_type')
    }
    source_counts_by_activity_type = {
        row['activity_type']: row['count']
        for row in rows.values('activity_type')
        .annotate(count=Count('id'))
        .order_by('activity_type')
    }
    related_question_ids = list(
        rows.exclude(related_question_id__isnull=True)
        .order_by('related_question_id')
        .values_list('related_question_id', flat=True)
        .distinct()
    )
    return UserConceptActivitySummary(
        user_id=user_id,
        total_weight=sum(totals_by_concept.values(), Decimal('0.0000')),
        totals_by_concept=totals_by_concept,
        breakdown_by_activity_type=breakdown_by_activity_type,
        source_counts_by_activity_type=source_counts_by_activity_type,
        related_question_ids=related_question_ids,
    )


def validate_user_exists(user_id):
    if user_id is None:
        return None
    User = get_user_model()
    return User.objects.get(pk=user_id)
