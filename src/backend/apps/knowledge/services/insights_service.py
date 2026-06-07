# Кратко: готовит выводы для графа знаний.
from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db.models import Avg, Count, Max, Min, Sum
from django.utils import timezone

from apps.knowledge.models import (
    QuestionConceptEdge,
    UserConceptActivity,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphState,
)
from apps.knowledge.services.graph_state_service import get_user_graph_state

ZERO_WEIGHT = Decimal('0.0000')
SCORE_ZERO = Decimal('0.0000')
SCORE_ONE = Decimal('1.0000')
SCORE_QUANT = Decimal('0.0001')

# Existing M015 provisional rule contract values. S07 makes these thresholds
# explicit and executable without introducing new product semantics.
CONCEPT_STATE_STALE_AFTER_DAYS = 90
CONCEPT_STATE_STRONG_MIN_TOTAL_WEIGHT = Decimal('3.0000')
CONCEPT_STATE_GROWING_MIN_TOTAL_WEIGHT = Decimal('1.0000')
CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT = 2

# S02 scoring-v2 constants: keep scoring deterministic and explainable.
SCORING_STRENGTH_WEIGHT_CAP = Decimal('5.0000')
SCORING_FRESHNESS_FULL_DAYS = 30
SCORING_FRESHNESS_STALE_DAYS = CONCEPT_STATE_STALE_AFTER_DAYS
SCORING_CONNECTIVITY_DEGREE_CAP = Decimal('3.0000')
SCORING_DIVERSITY_TYPE_CAP = Decimal('3.0000')
SCORING_ACTIVITY_TYPE_LIMIT = 6
SCORING_EVIDENCE_LIMIT = 5
SCORING_HIGH_CONFIDENCE_MIN = Decimal('0.8000')
SCORING_MEDIUM_CONFIDENCE_MIN = Decimal('0.5000')
SCORING_STRONG_STATE_SCORE_MIN = Decimal('0.7000')
SCORING_GROWING_STATE_SCORE_MIN = Decimal('0.4500')
SCORING_GROWING_DIVERSITY_MIN = Decimal('0.5000')
SCORING_GROWING_CONFIDENCE_MIN = Decimal('0.5000')
SCORING_STALE_FRESHNESS_MAX = Decimal('0.2500')
SCORING_STALE_STRENGTH_MIN = Decimal('0.5000')
SCORING_STATE_STRENGTH_WEIGHT = Decimal('0.35')
SCORING_STATE_FRESHNESS_WEIGHT = Decimal('0.20')
SCORING_STATE_CONNECTIVITY_WEIGHT = Decimal('0.15')
SCORING_STATE_DIVERSITY_WEIGHT = Decimal('0.15')
SCORING_STATE_CONFIDENCE_WEIGHT = Decimal('0.15')

RECOMMENDATION_LIMIT = 3
TOP_LEVEL_RECOMMENDATION_LIMIT = 5
SEMANTIC_RECOMMENDATION_ROW_LIMIT = 100
RECOMMENDATION_EVIDENCE_LIMIT = 4

STATE_STRONG = 'strong'
STATE_GROWING = 'growing'
STATE_WEAK = 'weak'
STATE_STALE = 'stale'
STATE_ISOLATED = 'isolated'

CONFIDENCE_HIGH = 'high'
CONFIDENCE_MEDIUM = 'medium'
CONFIDENCE_LOW = 'low'

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


RECOMMENDATION_STATE_BASE_SCORE = {
    STATE_WEAK: Decimal('0.9500'),
    STATE_STALE: Decimal('0.9000'),
    STATE_ISOLATED: Decimal('0.8200'),
    STATE_GROWING: Decimal('0.4500'),
    STATE_STRONG: Decimal('0.2000'),
}

RECOMMENDATION_STATE_REASON = {
    STATE_WEAK: 'weak_concept_needs_practice',
    STATE_STALE: 'stale_concept_needs_refresh',
    STATE_ISOLATED: 'isolated_concept_needs_connections',
    STATE_GROWING: 'growing_concept_has_momentum',
    STATE_STRONG: 'strong_concept_maintenance',
}

RECOMMENDATION_REASON_PRIORITY = {
    'weak_concept_needs_practice': 10,
    'stale_concept_needs_refresh': 20,
    'isolated_concept_needs_connections': 30,
    'semantic_neighbour_suggests_bridge': 40,
    'growing_concept_has_momentum': 50,
    'strong_concept_maintenance': 60,
}

UNSAFE_RECOMMENDATION_EVIDENCE_KEY_MARKERS = (
    'body',
    'content_hash',
    'email',
    'hash',
    'idempotency_key',
    'model',
    'provider',
    'raw',
    'secret',
    'source_id',
    'source_object_id',
    'text',
    'token',
    'vec' + 'tor',
)
UNSAFE_RECOMMENDATION_VALUE_MARKERS = ('<', '>', 'sk_', 'source_id', 'content_hash', 'vec' + 'tor_payload', '@')


def _safe_decimal(value: Decimal | None) -> Decimal:
    """Возвращает Decimal без пустого значения."""
    return value if value is not None else ZERO_WEIGHT


def _bounded_score(value: Decimal | int | float | None) -> Decimal:
    """Обрабатывает bounded оценку."""
    if value is None:
        return SCORE_ZERO
    score = Decimal(str(value))
    if score < SCORE_ZERO:
        return SCORE_ZERO
    if score > SCORE_ONE:
        return SCORE_ONE
    return score.quantize(SCORE_QUANT, rounding=ROUND_HALF_UP)


def _ratio_score(value: Decimal | int, cap: Decimal) -> Decimal:
    """Обрабатывает ratio оценку."""
    if cap <= ZERO_WEIGHT:
        return SCORE_ZERO
    return _bounded_score(Decimal(str(value)) / cap)


def _freshness_score(last_activity_at) -> Decimal:
    """Обрабатывает freshness оценку."""
    if not last_activity_at:
        return SCORE_ZERO
    age_days = Decimal(str(max((timezone.now() - last_activity_at).total_seconds(), 0))) / Decimal('86400')
    if age_days <= Decimal(SCORING_FRESHNESS_FULL_DAYS):
        return SCORE_ONE
    if age_days >= Decimal(SCORING_FRESHNESS_STALE_DAYS):
        return SCORE_ZERO
    score = SCORE_ONE - (
        (age_days - Decimal(SCORING_FRESHNESS_FULL_DAYS))
        / Decimal(SCORING_FRESHNESS_STALE_DAYS - SCORING_FRESHNESS_FULL_DAYS)
    )
    return _bounded_score(score)


def _confidence_band(confidence_score: Decimal) -> str:
    """Обрабатывает confidence band."""
    if confidence_score >= SCORING_HIGH_CONFIDENCE_MIN:
        return CONFIDENCE_HIGH
    if confidence_score >= SCORING_MEDIUM_CONFIDENCE_MIN:
        return CONFIDENCE_MEDIUM
    return CONFIDENCE_LOW


def _state_score(*, strength_score: Decimal, freshness_score: Decimal, connectivity_score: Decimal, diversity_score: Decimal, confidence_score: Decimal) -> Decimal:
    """Обрабатывает состояние оценку."""
    return _bounded_score(
        (strength_score * SCORING_STATE_STRENGTH_WEIGHT)
        + (freshness_score * SCORING_STATE_FRESHNESS_WEIGHT)
        + (connectivity_score * SCORING_STATE_CONNECTIVITY_WEIGHT)
        + (diversity_score * SCORING_STATE_DIVERSITY_WEIGHT)
        + (confidence_score * SCORING_STATE_CONFIDENCE_WEIGHT)
    )


def _insights_state_payload(state: UserKnowledgeGraphState) -> dict[str, Any]:
    """Обрабатывает выводы состояние ответ API."""

    return {
        'status': state.status,
        'stale_reason': state.stale_reason,
        'last_failed_phase': state.last_failed_phase,
        'last_rebuild_started_at': state.last_rebuild_started_at,
        'last_rebuild_finished_at': state.last_rebuild_finished_at,
    }


def get_insights_error_payload(user) -> dict[str, Any]:
    """Возвращает данные выводов ошибки ответа API."""
    return {
        'error': {
            'code': 'knowledge_graph_insights_unavailable',
            'message': 'Knowledge graph insights are temporarily unavailable.',
        },
        'state': _insights_state_payload(get_user_graph_state(user)),
    }


def _owner_visible_topology(concept_ids: set[int], owner_question_ids: set[Any]) -> tuple[dict[int, int], dict[int, int]]:
    """Обрабатывает владельца visible topology."""

    if not concept_ids or not owner_question_ids:
        return {}, {}

    rows = (
        QuestionConceptEdge.objects.filter(question_id__in=owner_question_ids, concept_id__in=concept_ids)
        .values('question_id', 'concept_id')
        .order_by('question_id', 'concept_id')
    )
    concepts_by_question: dict[Any, set[int]] = defaultdict(set)
    related_question_ids_by_concept: dict[int, set[Any]] = defaultdict(set)
    for row in rows:
        question_id = row['question_id']
        concept_id = row['concept_id']
        concepts_by_question[question_id].add(concept_id)
        related_question_ids_by_concept[concept_id].add(question_id)

    neighbours_by_concept: dict[int, set[int]] = {concept_id: set() for concept_id in concept_ids}
    for question_concepts in concepts_by_question.values():
        if len(question_concepts) < 2:
            continue
        for concept_id in question_concepts:
            neighbours_by_concept[concept_id].update(question_concepts - {concept_id})

    related_counts = {
        concept_id: len(related_question_ids_by_concept.get(concept_id, set())) for concept_id in concept_ids
    }
    degree_counts = {concept_id: len(neighbours_by_concept.get(concept_id, set())) for concept_id in concept_ids}
    return related_counts, degree_counts


def _activity_metrics_by_concept(user, concept_ids: set[int]) -> dict[int, dict[str, Any]]:
    """Обрабатывает активность metrics concept."""
    if not concept_ids:
        return {}

    metrics: dict[int, dict[str, Any]] = {
        concept_id: {'activity_types': [], 'owner_question_ids': set()} for concept_id in concept_ids
    }
    activity_type_rows = (
        UserConceptActivity.objects.filter(user=user, concept_id__in=concept_ids)
        .values('concept_id', 'activity_type')
        .annotate(type_weight=Sum('weight_delta'), type_source_count=Count('id'))
        .order_by('concept_id', 'activity_type')
    )
    for row in activity_type_rows:
        concept_metrics = metrics.setdefault(row['concept_id'], {'activity_types': [], 'owner_question_ids': set()})
        activity_type = row['activity_type'] or ''
        if activity_type and len(concept_metrics['activity_types']) < SCORING_ACTIVITY_TYPE_LIMIT:
            concept_metrics['activity_types'].append(activity_type)

    question_rows = (
        UserConceptActivity.objects.filter(
            user=user,
            concept_id__in=concept_ids,
            related_question_id__isnull=False,
        )
        .values('concept_id', 'related_question_id')
        .distinct()
    )
    for row in question_rows:
        metrics.setdefault(row['concept_id'], {'activity_types': [], 'owner_question_ids': set()})['owner_question_ids'].add(
            row['related_question_id']
        )

    return metrics


def _classify_state_v2(
    *,
    total_weight: Decimal,
    source_count: int,
    owner_visible_related_question_count: int,
    last_activity_at,
    state_score: Decimal,
    strength_score: Decimal,
    freshness_score: Decimal,
    diversity_score: Decimal,
    confidence_score: Decimal,
) -> str:
    # Stale wins before strength so old-but-heavy concepts prompt refresh instead of maintenance.
    """Обрабатывает classify состояние v2."""
    if last_activity_at and last_activity_at <= timezone.now() - timezone.timedelta(days=CONCEPT_STATE_STALE_AFTER_DAYS):
        return STATE_STALE
    if freshness_score <= SCORING_STALE_FRESHNESS_MAX and strength_score >= SCORING_STALE_STRENGTH_MIN:
        return STATE_STALE
    # S02 isolation is owner-visible: no owner-visible concept edge rows means global topology is ignored.
    if owner_visible_related_question_count == 0:
        return STATE_ISOLATED
    if (
        state_score >= SCORING_STRONG_STATE_SCORE_MIN
        and total_weight >= CONCEPT_STATE_STRONG_MIN_TOTAL_WEIGHT
        and source_count >= CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT
    ):
        return STATE_STRONG
    if (
        total_weight >= CONCEPT_STATE_GROWING_MIN_TOTAL_WEIGHT
        and source_count >= CONCEPT_STATE_MIN_MULTI_SOURCE_COUNT
        and diversity_score >= SCORING_GROWING_DIVERSITY_MIN
        and confidence_score >= SCORING_GROWING_CONFIDENCE_MIN
    ):
        return STATE_GROWING
    return STATE_WEAK


def _evidence_entries(
    *,
    total_weight: Decimal,
    freshness_score: Decimal,
    diversity_score: Decimal,
    confidence_score: Decimal,
    owner_graph_degree: int,
    owner_visible_related_question_count: int,
    semantic_state: str,
) -> list[dict[str, Any]]:
    """Обрабатывает evidence entries."""
    entries = [
        {
            'code': 'activity_diversity',
            'label': 'Activity type diversity',
            'value': diversity_score,
            'weight': diversity_score,
        },
        {
            'code': 'confidence_signal',
            'label': 'Concept and activity confidence',
            'value': confidence_score,
            'weight': confidence_score,
        },
        {
            'code': 'owner_visible_connections',
            'label': 'Owner-visible graph connections',
            'value': owner_graph_degree,
            'weight': _ratio_score(owner_graph_degree, SCORING_CONNECTIVITY_DEGREE_CAP),
        },
        {
            'code': 'owner_visible_related_questions',
            'label': 'Owner-visible related questions',
            'value': owner_visible_related_question_count,
            'weight': _bounded_score(Decimal(owner_visible_related_question_count) / Decimal('5')),
        },
        {
            'code': 'total_activity_weight',
            'label': 'Total weighted activity',
            'value': total_weight,
            'weight': _ratio_score(total_weight, SCORING_STRENGTH_WEIGHT_CAP),
        },
    ]
    if semantic_state == STATE_STALE:
        entries.append(
            {
                'code': 'stale_activity',
                'label': 'Activity is older than the stale cutoff',
                'value': freshness_score,
                'weight': SCORE_ONE - freshness_score,
            }
        )
    if semantic_state == STATE_ISOLATED:
        entries.append(
            {
                'code': 'owner_visible_isolated',
                'label': 'No owner-visible concept graph edge',
                'value': owner_visible_related_question_count,
                'weight': SCORE_ONE,
            }
        )
    return sorted(entries, key=lambda item: item['code'])[:SCORING_EVIDENCE_LIMIT]


def _base_action_payload(slug: str, name: str) -> dict[str, str | int]:
    """Обрабатывает base action ответ API."""
    return {
        'query': name,
        'tag': slug,
        'search': name,
        'order': 'relevance',
        'page': 1,
    }


def _recommendation_for_state(*, concept_id: int, slug: str, name: str, state: str) -> dict[str, Any]:
    """Обрабатывает recommendation состояние."""
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




def _is_safe_recommendation_value(value: Any) -> bool:
    """Возвращает безопасные данные: recommendation value."""
    if isinstance(value, dict):
        for key, child in value.items():
            normalized_key = str(key).lower().replace('-', '_')
            if any(marker in normalized_key for marker in UNSAFE_RECOMMENDATION_EVIDENCE_KEY_MARKERS):
                return False
            if not _is_safe_recommendation_value(child):
                return False
        return True
    if isinstance(value, list):
        return all(_is_safe_recommendation_value(child) for child in value)
    if isinstance(value, str):
        normalized_value = value.lower()
        return not any(marker in normalized_value for marker in UNSAFE_RECOMMENDATION_VALUE_MARKERS)
    return True


def _recommendation_evidence_entry(code: str, label: str, value: Decimal | int | str, weight: Decimal | int | float) -> dict[str, Any]:
    """Обрабатывает recommendation evidence entry."""
    entry = {
        'code': code,
        'label': label,
        'value': value,
        'weight': _bounded_score(weight),
    }
    return entry if _is_safe_recommendation_value(entry) else {}


def _concept_question_index(user, visible_concept_ids: set[int], owner_question_ids: set[Any]) -> dict[str, set[int]]:
    """Обрабатывает concept вопрос index."""
    if not visible_concept_ids or not owner_question_ids:
        return {}

    rows = (
        QuestionConceptEdge.objects.filter(question_id__in=owner_question_ids, concept_id__in=visible_concept_ids)
        .values('question_id', 'concept_id')
        .order_by('question_id', 'concept_id')
    )
    concept_ids_by_question_id: dict[str, set[int]] = defaultdict(set)
    for row in rows:
        concept_ids_by_question_id[str(row['question_id'])].add(row['concept_id'])

    activity_rows = (
        UserConceptActivity.objects.filter(
            user=user,
            concept_id__in=visible_concept_ids,
            related_question_id__in=owner_question_ids,
        )
        .values('related_question_id', 'concept_id')
        .distinct()
    )
    for row in activity_rows:
        concept_ids_by_question_id[str(row['related_question_id'])].add(row['concept_id'])
    return concept_ids_by_question_id


def _semantic_neighbour_summaries(
    *,
    user,
    visible_concept_ids: set[int],
    concept_ids_by_question_id: dict[str, set[int]],
) -> dict[int, list[dict[str, Any]]]:
    """Обрабатывает семантические данные neighbour summaries."""
    if len(visible_concept_ids) < 2 or not concept_ids_by_question_id:
        return {}

    neighbours_by_concept: dict[int, dict[int, dict[str, Any]]] = defaultdict(dict)
    candidates = (
        UserKnowledgeGraphSemanticCandidate.objects.filter(
            user=user,
            source_snapshot__source_type='question',
            target_snapshot__source_type='question',
        )
        .select_related('source_snapshot', 'target_snapshot')
        .order_by('-similarity_score', 'rank', 'source_snapshot_id', 'target_snapshot_id', 'id')[:SEMANTIC_RECOMMENDATION_ROW_LIMIT]
    )
    for candidate in candidates:
        source_concept_ids = concept_ids_by_question_id.get(str(candidate.source_snapshot.source_id), set())
        target_concept_ids = concept_ids_by_question_id.get(str(candidate.target_snapshot.source_id), set())
        if not source_concept_ids or not target_concept_ids:
            continue
        for source_concept_id in sorted(source_concept_ids):
            if source_concept_id not in visible_concept_ids:
                continue
            for target_concept_id in sorted(target_concept_ids):
                if target_concept_id not in visible_concept_ids or source_concept_id == target_concept_id:
                    continue
                for concept_id, neighbour_id in ((source_concept_id, target_concept_id), (target_concept_id, source_concept_id)):
                    current = neighbours_by_concept[concept_id].get(neighbour_id)
                    if current is None:
                        neighbours_by_concept[concept_id][neighbour_id] = {
                            'concept_id': neighbour_id,
                            'similarity_score': candidate.similarity_score,
                            'rank': candidate.rank,
                            'candidate_count': 1,
                        }
                    else:
                        current['candidate_count'] += 1
                        if (candidate.similarity_score, -candidate.rank) > (current['similarity_score'], -current['rank']):
                            current['similarity_score'] = candidate.similarity_score
                            current['rank'] = candidate.rank

    return {
        concept_id: sorted(
            neighbours.values(),
            key=lambda item: (-item['similarity_score'], item['rank'], item['concept_id']),
        )[:3]
        for concept_id, neighbours in neighbours_by_concept.items()
    }


def _semantic_group_summaries(*, user, visible_concepts_by_id: dict[int, dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    """Обрабатывает семантические данные группу summaries."""
    if not visible_concepts_by_id:
        return {}

    groups_by_concept: dict[int, list[dict[str, Any]]] = defaultdict(list)
    groups = (
        UserKnowledgeGraphSemanticGroup.objects.filter(user=user)
        .prefetch_related('memberships__concept')
        .order_by('-generated_at', 'group_key', 'id')
    )
    for group in groups:
        memberships = [
            membership
            for membership in group.memberships.all()
            if membership.concept_id in visible_concepts_by_id
        ]
        if not memberships:
            continue
        memberships.sort(key=lambda membership: (membership.rank, membership.concept.slug, membership.concept_id))
        safe_group = {
            'group_key': group.group_key,
            'label': group.label,
            'confidence': group.confidence,
        }
        if not _is_safe_recommendation_value(safe_group):
            continue
        for membership in memberships:
            groups_by_concept[membership.concept_id].append(
                {
                    **safe_group,
                    'member_rank': membership.rank,
                    'member_confidence': membership.confidence,
                }
            )
    return {concept_id: groups[:2] for concept_id, groups in groups_by_concept.items()}


def _recommendation_priority(score: Decimal) -> str:
    """Обрабатывает recommendation priority."""
    if score >= Decimal('0.7500'):
        return 'high'
    if score >= Decimal('0.4500'):
        return 'medium'
    return 'low'


def _top_level_recommendation_for_concept(
    *,
    concept: dict[str, Any],
    semantic_neighbours: list[dict[str, Any]],
    semantic_groups: list[dict[str, Any]],
    visible_concepts_by_id: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    """Обрабатывает top level recommendation concept."""
    semantic_state = concept['semantic_state']
    best_neighbour = semantic_neighbours[0] if semantic_neighbours else None
    has_semantic_bridge = bool(best_neighbour or semantic_groups)
    if has_semantic_bridge and semantic_state in {STATE_GROWING, STATE_STRONG}:
        reason_code = 'semantic_neighbour_suggests_bridge'
        action_type = ACTION_CONNECT_CONCEPT
        base_score = Decimal('0.6200')
        label = f'Bridge {concept["name"]} through semantic neighbours'
    else:
        reason_code = RECOMMENDATION_STATE_REASON[semantic_state]
        action_type = concept['recommendations'][0]['action']['type']
        base_score = RECOMMENDATION_STATE_BASE_SCORE[semantic_state]
        label = concept['recommendations'][0]['label']

    inverse_state_score = SCORE_ONE - concept['state_score']
    semantic_boost = Decimal('0.0000')
    if best_neighbour:
        semantic_boost = max(semantic_boost, _bounded_score(best_neighbour['similarity_score']) * Decimal('0.1200'))
    if semantic_groups:
        semantic_boost = max(semantic_boost, _bounded_score(semantic_groups[0]['confidence']) * Decimal('0.0800'))
    score = _bounded_score((base_score * Decimal('0.7800')) + (inverse_state_score * Decimal('0.1400')) + semantic_boost)
    confidence = _bounded_score((concept['confidence_score'] * Decimal('0.6500')) + (score * Decimal('0.3500')))

    target: dict[str, Any] = {
        'concept': {
            'concept_id': concept['concept_id'],
            'slug': concept['slug'],
            'name': concept['name'],
        },
        'discovery': _base_action_payload(concept['slug'], concept['name']),
    }
    if best_neighbour:
        neighbour_concept = visible_concepts_by_id.get(best_neighbour['concept_id'])
        if neighbour_concept:
            target['neighbours'] = [
                {
                    'concept_id': neighbour_concept['concept_id'],
                    'slug': neighbour_concept['slug'],
                    'name': neighbour_concept['name'],
                }
            ]
    if semantic_groups:
        group = semantic_groups[0]
        target['group'] = {
            'group_key': group['group_key'],
            'label': group['label'],
        }

    evidence = [
        _recommendation_evidence_entry('state_score', 'Composite concept readiness score', concept['state_score'], concept['state_score']),
        _recommendation_evidence_entry('freshness', 'Freshness signal', concept['freshness_score'], SCORE_ONE - concept['freshness_score']),
        _recommendation_evidence_entry('connectivity', 'Owner-visible connectivity signal', concept['owner_graph_degree'], concept['connectivity_score']),
        _recommendation_evidence_entry('confidence', 'Aggregate confidence signal', concept['confidence_score'], concept['confidence_score']),
    ]
    if best_neighbour:
        evidence.append(
            _recommendation_evidence_entry(
                'semantic_neighbour',
                'Persisted semantic neighbour similarity',
                best_neighbour['similarity_score'],
                best_neighbour['similarity_score'],
            )
        )
    if semantic_groups:
        evidence.append(
            _recommendation_evidence_entry(
                'semantic_group',
                'Persisted semantic group confidence',
                semantic_groups[0]['confidence'],
                semantic_groups[0]['confidence'],
            )
        )
    evidence = [entry for entry in evidence if entry][:RECOMMENDATION_EVIDENCE_LIMIT]

    return {
        'rank': 0,
        'id': f'v2:{reason_code}:{concept["concept_id"]}',
        'score': score,
        'confidence': confidence,
        'priority': _recommendation_priority(score),
        'label': label,
        'reason_code': reason_code,
        'target': target,
        'action': {
            'type': action_type,
            'payload': target['discovery'],
        },
        'evidence': evidence,
        '_sort_reason_priority': RECOMMENDATION_REASON_PRIORITY[reason_code],
        '_sort_slug': concept['slug'],
        '_sort_concept_id': concept['concept_id'],
    }


def _diversified_top_recommendations(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Обрабатывает diversified top recommendations."""
    ordered = sorted(
        recommendations,
        key=lambda item: (-item['score'], item['_sort_reason_priority'], item['_sort_slug'], item['_sort_concept_id']),
    )
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    seen_reasons: set[str] = set()
    for recommendation in ordered:
        if recommendation['reason_code'] in seen_reasons:
            continue
        selected.append(recommendation)
        selected_ids.add(recommendation['id'])
        seen_reasons.add(recommendation['reason_code'])
        if len(selected) >= TOP_LEVEL_RECOMMENDATION_LIMIT:
            break
    if len(selected) < TOP_LEVEL_RECOMMENDATION_LIMIT:
        for recommendation in ordered:
            if recommendation['id'] in selected_ids:
                continue
            selected.append(recommendation)
            selected_ids.add(recommendation['id'])
            if len(selected) >= TOP_LEVEL_RECOMMENDATION_LIMIT:
                break

    reranked = sorted(
        selected,
        key=lambda item: (-item['score'], item['_sort_reason_priority'], item['_sort_slug'], item['_sort_concept_id']),
    )
    for index, recommendation in enumerate(reranked, start=1):
        recommendation['rank'] = index
        recommendation.pop('_sort_reason_priority', None)
        recommendation.pop('_sort_slug', None)
        recommendation.pop('_sort_concept_id', None)
    return reranked

def get_owner_insights_payload(user) -> dict[str, Any]:
    """Возвращает данные владельца выводов ответа API."""

    state = get_user_graph_state(user)
    activity_rows = UserConceptActivity.objects.filter(user=user)
    concept_rows = list(
        activity_rows.values('concept_id', 'concept__slug', 'concept__name', 'concept__confidence')
        .annotate(
            total_weight=Sum('weight_delta'),
            source_count=Count('id'),
            activity_type_count=Count('activity_type', distinct=True),
            last_activity_at=Max('created_at'),
            avg_activity_confidence=Avg('confidence'),
            min_activity_confidence=Min('confidence'),
        )
        .order_by('concept__slug', 'concept_id')
    )
    concept_ids = {row['concept_id'] for row in concept_rows}
    activity_metrics = _activity_metrics_by_concept(user, concept_ids)
    owner_question_ids: set[Any] = set()
    for metrics in activity_metrics.values():
        owner_question_ids.update(metrics.get('owner_question_ids', set()))
    related_counts, degree_counts = _owner_visible_topology(concept_ids, owner_question_ids)

    concepts = []
    state_counts: Counter[str] = Counter()

    for row in concept_rows:
        concept_id = row['concept_id']
        total_weight = _safe_decimal(row['total_weight'])
        source_count = row['source_count']
        activity_types = sorted(activity_metrics.get(concept_id, {}).get('activity_types', []))[:SCORING_ACTIVITY_TYPE_LIMIT]
        owner_visible_related_question_count = related_counts.get(concept_id, 0)
        owner_graph_degree = degree_counts.get(concept_id, 0)
        strength_score = _ratio_score(total_weight, SCORING_STRENGTH_WEIGHT_CAP)
        freshness_score = _freshness_score(row['last_activity_at'])
        connectivity_score = _ratio_score(owner_graph_degree, SCORING_CONNECTIVITY_DEGREE_CAP)
        diversity_score = _ratio_score(len(activity_types), SCORING_DIVERSITY_TYPE_CAP)
        confidence_score = _bounded_score(
            (_safe_decimal(row['concept__confidence']) + _safe_decimal(row['avg_activity_confidence'])) / Decimal('2')
        )
        state_score = _state_score(
            strength_score=strength_score,
            freshness_score=freshness_score,
            connectivity_score=connectivity_score,
            diversity_score=diversity_score,
            confidence_score=confidence_score,
        )
        semantic_state = _classify_state_v2(
            total_weight=total_weight,
            source_count=source_count,
            owner_visible_related_question_count=owner_visible_related_question_count,
            last_activity_at=row['last_activity_at'],
            state_score=state_score,
            strength_score=strength_score,
            freshness_score=freshness_score,
            diversity_score=diversity_score,
            confidence_score=confidence_score,
        )
        state_counts[semantic_state] += 1
        recommendation = _recommendation_for_state(
            concept_id=concept_id,
            slug=row['concept__slug'],
            name=row['concept__name'],
            state=semantic_state,
        )
        recommendations = [recommendation][:RECOMMENDATION_LIMIT]
        concepts.append(
            {
                'concept_id': concept_id,
                'slug': row['concept__slug'],
                'name': row['concept__name'],
                'total_weight': total_weight,
                'source_count': source_count,
                'related_question_count': owner_visible_related_question_count,
                'semantic_state': semantic_state,
                'tone_token': TONE_BY_STATE[semantic_state],
                'recommendations': recommendations,
                'state_score': state_score,
                'strength_score': strength_score,
                'freshness_score': freshness_score,
                'connectivity_score': connectivity_score,
                'diversity_score': diversity_score,
                'confidence_score': confidence_score,
                'confidence_band': _confidence_band(confidence_score),
                'owner_graph_degree': owner_graph_degree,
                'owner_visible_related_question_count': owner_visible_related_question_count,
                'activity_types': activity_types,
                'evidence': _evidence_entries(
                    total_weight=total_weight,
                    freshness_score=freshness_score,
                    diversity_score=diversity_score,
                    confidence_score=confidence_score,
                    owner_graph_degree=owner_graph_degree,
                    owner_visible_related_question_count=owner_visible_related_question_count,
                    semantic_state=semantic_state,
                ),
                '_sort_state_priority': STATE_PRIORITY[semantic_state],
            }
        )

    concepts.sort(key=lambda item: (item['_sort_state_priority'], item['slug'], item['concept_id']))
    for concept in concepts:
        concept.pop('_sort_state_priority', None)

    visible_concepts_by_id = {concept['concept_id']: concept for concept in concepts}
    concept_ids_by_question_id = _concept_question_index(user, set(visible_concepts_by_id), owner_question_ids)
    semantic_neighbours_by_concept = _semantic_neighbour_summaries(
        user=user,
        visible_concept_ids=set(visible_concepts_by_id),
        concept_ids_by_question_id=concept_ids_by_question_id,
    )
    semantic_groups_by_concept = _semantic_group_summaries(user=user, visible_concepts_by_id=visible_concepts_by_id)
    recommendation_candidates = [
        _top_level_recommendation_for_concept(
            concept=concept,
            semantic_neighbours=semantic_neighbours_by_concept.get(concept['concept_id'], []),
            semantic_groups=semantic_groups_by_concept.get(concept['concept_id'], []),
            visible_concepts_by_id=visible_concepts_by_id,
        )
        for concept in concepts
    ]
    top_level_recommendations = _diversified_top_recommendations(recommendation_candidates)

    return {
        'user_id': user.pk,
        'viewer': {'is_owner': True},
        'state': _insights_state_payload(state),
        'summary': {
            'concept_count': len(concepts),
            'recommendation_count': len(top_level_recommendations),
            'states': {
                STATE_STRONG: state_counts[STATE_STRONG],
                STATE_GROWING: state_counts[STATE_GROWING],
                STATE_WEAK: state_counts[STATE_WEAK],
                STATE_STALE: state_counts[STATE_STALE],
                STATE_ISOLATED: state_counts[STATE_ISOLATED],
            },
        },
        'recommendations': top_level_recommendations,
        'concepts': concepts,
    }
