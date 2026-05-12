from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal
from typing import Any

from django.db.models import Count, Max, Sum
from django.utils import timezone

from apps.knowledge.models import QuestionConceptEdge, UserConceptActivity, UserKnowledgeGraphState
from apps.knowledge.services.graph_state_service import get_user_graph_state

ZERO_WEIGHT = Decimal('0.0000')

# Existing M015 provisional rule contract values. S07 makes these thresholds
# explicit and executable without introducing new product semantics.
CONCEPT_STATE_STALE_AFTER_DAYS = 90
CONCEPT_STATE_STRONG_MIN_TOTAL_WEIGHT = Decimal('3.0000')
CONCEPT_STATE_GROWING_MIN_TOTAL_WEIGHT = Decimal('1.0000')
CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT = 2

RECOMMENDATION_LIMIT = 3

STATE_STRONG = 'strong'
STATE_GROWING = 'growing'
STATE_WEAK = 'weak'
STATE_STALE = 'stale'
STATE_ISOLATED = 'isolated'

TONE_BY_STATE = {
    STATE_STRONG: 'confident',
    STATE_GROWING: 'momentum',
    STATE_WEAK: 'needs_practice',
    STATE_STALE: 'refresh',
    STATE_ISOLATED: 'connect',
}

ACTION_REVIEW_RELATED = 'review_related_questions'
ACTION_ANSWER_QUESTION = 'answer_question'
ACTION_PRACTICE_FOUNDATION = 'practice_foundation'
ACTION_REFRESH_STALE = 'refresh_stale'
ACTION_CONNECT_CONCEPT = 'connect_concept'

STATE_PRIORITY = {
    STATE_WEAK: 10,
    STATE_STALE: 20,
    STATE_ISOLATED: 30,
    STATE_GROWING: 40,
    STATE_STRONG: 50,
}


def _safe_decimal(value: Decimal | None) -> Decimal:
    return value if value is not None else ZERO_WEIGHT


def _insights_state_payload(state: UserKnowledgeGraphState) -> dict[str, Any]:
    """Return graph state diagnostics without provider error text."""

    return {
        'status': state.status,
        'stale_reason': state.stale_reason,
        'last_failed_phase': state.last_failed_phase,
        'last_rebuild_started_at': state.last_rebuild_started_at,
        'last_rebuild_finished_at': state.last_rebuild_finished_at,
    }


def get_insights_error_payload(user) -> dict[str, Any]:
    return {
        'error': {
            'code': 'knowledge_graph_insights_unavailable',
            'message': 'Knowledge graph insights are temporarily unavailable.',
        },
        'state': _insights_state_payload(get_user_graph_state(user)),
    }


def _related_question_counts(concept_ids: set[int]) -> dict[int, int]:
    if not concept_ids:
        return {}
    return {
        row['concept_id']: row['related_question_count']
        for row in QuestionConceptEdge.objects.filter(concept_id__in=concept_ids)
        .values('concept_id')
        .annotate(related_question_count=Count('question_id', distinct=True))
    }


def _activity_types_by_concept(user, concept_ids: set[int]) -> dict[int, list[str]]:
    if not concept_ids:
        return {}
    rows = (
        UserConceptActivity.objects.filter(user=user, concept_id__in=concept_ids)
        .values('concept_id', 'activity_type')
        .distinct()
        .order_by('concept_id', 'activity_type')
    )
    grouped: dict[int, list[str]] = defaultdict(list)
    for row in rows:
        grouped[row['concept_id']].append(row['activity_type'])
    return grouped


def _classify_state(*, total_weight: Decimal, source_count: int, related_question_count: int, last_activity_at) -> str:
    if last_activity_at and last_activity_at <= timezone.now() - timezone.timedelta(days=CONCEPT_STATE_STALE_AFTER_DAYS):
        return STATE_STALE
    if related_question_count == 0:
        return STATE_ISOLATED
    if total_weight >= CONCEPT_STATE_STRONG_MIN_TOTAL_WEIGHT and source_count >= CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT:
        return STATE_STRONG
    if total_weight >= CONCEPT_STATE_GROWING_MIN_TOTAL_WEIGHT and source_count >= CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT:
        return STATE_GROWING
    return STATE_WEAK


def _base_action_payload(slug: str, name: str) -> dict[str, str | int]:
    return {
        'query': name,
        'tag': slug,
        'search': name,
        'order': 'relevance',
        'page': 1,
    }


def _recommendation_for_state(*, concept_id: int, slug: str, name: str, state: str) -> dict[str, Any]:
    payload = _base_action_payload(slug, name)
    if state == STATE_WEAK:
        action_type = ACTION_REVIEW_RELATED
        priority = 'high'
        label = f'Review related {name} questions'
        reason_code = 'weak_concept_needs_practice'
    elif state == STATE_STALE:
        action_type = ACTION_REFRESH_STALE
        priority = 'high'
        label = f'Refresh stale {name} knowledge'
        reason_code = 'stale_concept_needs_refresh'
    elif state == STATE_ISOLATED:
        action_type = ACTION_CONNECT_CONCEPT
        priority = 'medium'
        label = f'Connect {name} to related graph topics'
        reason_code = 'isolated_concept_needs_connections'
    elif state == STATE_GROWING:
        action_type = ACTION_ANSWER_QUESTION
        priority = 'medium'
        label = f'Answer a {name} question to build momentum'
        reason_code = 'growing_concept_has_momentum'
    else:
        action_type = ACTION_PRACTICE_FOUNDATION
        priority = 'low'
        label = f'Maintain strong {name} coverage'
        reason_code = 'strong_concept_maintenance'

    return {
        'id': f'{state}:{concept_id}:{action_type}',
        'priority': priority,
        'label': label,
        'reason_code': reason_code,
        'action': {
            'type': action_type,
            'payload': payload,
        },
    }


def get_owner_insights_payload(user) -> dict[str, Any]:
    """Build owner-only, redacted knowledge graph insight DTOs from aggregate activity rows."""

    state = get_user_graph_state(user)
    activity_rows = UserConceptActivity.objects.filter(user=user)
    concept_rows = list(
        activity_rows.values('concept_id', 'concept__slug', 'concept__name')
        .annotate(
            total_weight=Sum('weight_delta'),
            source_count=Count('id'),
            last_activity_at=Max('created_at'),
        )
        .order_by('concept__slug', 'concept_id')
    )
    concept_ids = {row['concept_id'] for row in concept_rows}
    related_counts = _related_question_counts(concept_ids)
    activity_types = _activity_types_by_concept(user, concept_ids)

    concepts = []
    state_counts: Counter[str] = Counter()
    recommendation_count = 0

    for row in concept_rows:
        concept_id = row['concept_id']
        total_weight = _safe_decimal(row['total_weight'])
        source_count = row['source_count']
        related_question_count = related_counts.get(concept_id, 0)
        semantic_state = _classify_state(
            total_weight=total_weight,
            source_count=source_count,
            related_question_count=related_question_count,
            last_activity_at=row['last_activity_at'],
        )
        state_counts[semantic_state] += 1
        recommendation = _recommendation_for_state(
            concept_id=concept_id,
            slug=row['concept__slug'],
            name=row['concept__name'],
            state=semantic_state,
        )
        recommendations = [recommendation][:RECOMMENDATION_LIMIT]
        recommendation_count += len(recommendations)
        concepts.append(
            {
                'concept_id': concept_id,
                'slug': row['concept__slug'],
                'name': row['concept__name'],
                'total_weight': total_weight,
                'source_count': source_count,
                'related_question_count': related_question_count,
                'semantic_state': semantic_state,
                'tone_token': TONE_BY_STATE[semantic_state],
                'recommendations': recommendations,
                '_sort_state_priority': STATE_PRIORITY[semantic_state],
                '_last_activity_at': row['last_activity_at'],
                '_activity_types': activity_types.get(concept_id, []),
            }
        )

    concepts.sort(key=lambda item: (item['_sort_state_priority'], item['slug'], item['concept_id']))
    for concept in concepts:
        concept.pop('_sort_state_priority', None)
        concept.pop('_last_activity_at', None)
        concept.pop('_activity_types', None)

    return {
        'user_id': user.pk,
        'viewer': {'is_owner': True},
        'state': _insights_state_payload(state),
        'summary': {
            'concept_count': len(concepts),
            'recommendation_count': recommendation_count,
            'states': {
                STATE_STRONG: state_counts[STATE_STRONG],
                STATE_GROWING: state_counts[STATE_GROWING],
                STATE_WEAK: state_counts[STATE_WEAK],
                STATE_STALE: state_counts[STATE_STALE],
                STATE_ISOLATED: state_counts[STATE_ISOLATED],
            },
        },
        'concepts': concepts,
    }
