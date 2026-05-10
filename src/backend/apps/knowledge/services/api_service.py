from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db.models import Count, Sum

from apps.knowledge.models import KnowledgeConcept, QuestionConceptEdge, UserConceptActivity, UserKnowledgeGraphState
from apps.knowledge.services.graph_state_service import get_user_graph_state
from apps.qa.models import Question

ZERO_WEIGHT = Decimal('0.0000')


def _safe_decimal(value: Decimal | None) -> Decimal:
    return value if value is not None else ZERO_WEIGHT


def _state_payload(state: UserKnowledgeGraphState) -> dict[str, Any]:
    return {
        'status': state.status,
        'stale_reason': state.stale_reason,
        'last_error_message': state.last_error_message,
        'last_failed_phase': state.last_failed_phase,
        'last_rebuild_started_at': state.last_rebuild_started_at,
        'last_rebuild_finished_at': state.last_rebuild_finished_at,
    }


def _activity_breakdown_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            'activity_type': row['activity_type'],
            'total_weight': _safe_decimal(row['total_weight']),
            'source_count': row['source_count'],
        }
        for row in rows
    ]


def get_user_graph_payload(user, *, is_owner: bool) -> dict[str, Any]:
    """Build a redacted aggregate user knowledge graph DTO.

    The response is intentionally derived from grouped UserConceptActivity rows.
    It never serializes raw event ids, source object ids, idempotency keys, source
    bodies, email addresses, provider exception text, or stack traces.
    """

    state = get_user_graph_state(user)
    activity_rows = UserConceptActivity.objects.filter(user=user)

    concept_total_rows = list(
        activity_rows.values(
            'concept_id',
            'concept__slug',
            'concept__name',
            'concept__source',
            'concept__provider',
            'concept__confidence',
        )
        .annotate(total_weight=Sum('weight_delta'), source_count=Count('id'))
        .order_by('concept__slug', 'concept_id')
    )
    overall_breakdown_rows = list(
        activity_rows.values('activity_type')
        .annotate(total_weight=Sum('weight_delta'), source_count=Count('id'))
        .order_by('activity_type')
    )
    concept_breakdown_rows = list(
        activity_rows.values('concept_id', 'activity_type')
        .annotate(total_weight=Sum('weight_delta'), source_count=Count('id'))
        .order_by('concept_id', 'activity_type')
    )
    related_question_rows = list(
        activity_rows.exclude(related_question_id__isnull=True)
        .values(
            'concept_id',
            'related_question_id',
            'related_question__question_title',
            'related_question__question_status',
        )
        .distinct()
        .order_by('concept_id', 'related_question__question_title', 'related_question_id')
    )

    breakdown_by_concept: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in concept_breakdown_rows:
        breakdown_by_concept[row['concept_id']].append(row)

    questions_by_concept: dict[int, list[dict[str, Any]]] = defaultdict(list)
    seen_related_questions: set[tuple[int, Any]] = set()
    for row in related_question_rows:
        key = (row['concept_id'], row['related_question_id'])
        if key in seen_related_questions:
            continue
        seen_related_questions.add(key)
        questions_by_concept[row['concept_id']].append(
            {
                'question_id': row['related_question_id'],
                'title': row['related_question__question_title'],
                'status': row['related_question__question_status'],
            }
        )

    concepts = []
    for row in concept_total_rows:
        concept_id = row['concept_id']
        concepts.append(
            {
                'concept_id': concept_id,
                'slug': row['concept__slug'],
                'name': row['concept__name'],
                'source': row['concept__source'],
                'provider': row['concept__provider'],
                'confidence': row['concept__confidence'],
                'total_weight': _safe_decimal(row['total_weight']),
                'source_count': row['source_count'],
                'activity_breakdown': _activity_breakdown_payload(breakdown_by_concept[concept_id]),
                'related_questions': questions_by_concept[concept_id],
            }
        )

    total_weight = sum((_safe_decimal(row['total_weight']) for row in concept_total_rows), ZERO_WEIGHT)

    return {
        'user_id': user.pk,
        'viewer': {'is_owner': is_owner},
        'state': _state_payload(state),
        'total_weight': total_weight,
        'activity_breakdown': _activity_breakdown_payload(overall_breakdown_rows),
        'concepts': concepts,
    }


def get_question_graph_payload(question: Question) -> dict[str, Any]:
    """Build a redacted aggregate question graph DTO from structural edges."""

    edges = (
        QuestionConceptEdge.objects.filter(question=question)
        .select_related('concept', 'tag')
        .order_by('concept__slug', 'concept_id')
    )
    concepts = []
    for edge in edges:
        concepts.append(
            {
                'concept_id': edge.concept_id,
                'slug': edge.concept.slug,
                'name': edge.concept.name,
                'concept_source': edge.concept.source,
                'concept_provider': edge.concept.provider,
                'tag': None if edge.tag_id is None else {'id': edge.tag_id, 'name': edge.tag.name},
                'source': edge.source,
                'provider': edge.provider,
                'confidence': edge.confidence,
            }
        )

    return {
        'question_id': question.pk,
        'title': question.question_title,
        'status': question.question_status,
        'concepts': concepts,
    }
