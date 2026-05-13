from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from itertools import combinations
from math import isfinite
from typing import Any

from django.db import transaction
from django.db.models import Count, Sum
from rest_framework import serializers

from apps.knowledge.models import (
    KnowledgeConcept,
    QuestionConceptEdge,
    UserConceptActivity,
    UserKnowledgeGraphLayout,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticGroup,
    UserKnowledgeGraphState,
)
from apps.knowledge.services.graph_state_service import UserKnowledgeGraphRebuildSummary, get_user_graph_state
from apps.qa.models import Question

ZERO_WEIGHT = Decimal('0.0000')
RELATED_QUESTION_PREVIEW_LIMIT = 5
LAYOUT_SCHEMA_VERSION = 1
MAX_LAYOUT_POSITIONS = 500
MAX_LAYOUT_CONCEPT_ID_LENGTH = 20
MAX_LAYOUT_COORDINATE_ABS = 100000


def _safe_decimal(value: Decimal | None) -> Decimal:
    return value if value is not None else ZERO_WEIGHT


def _state_payload(state: UserKnowledgeGraphState, *, include_private_diagnostics: bool = True) -> dict[str, Any]:
    return {
        'status': state.status,
        'stale_reason': state.stale_reason,
        'last_error_message': state.last_error_message if include_private_diagnostics else '',
        'last_failed_phase': state.last_failed_phase if include_private_diagnostics else '',
        'last_rebuild_started_at': state.last_rebuild_started_at if include_private_diagnostics else None,
        'last_rebuild_finished_at': state.last_rebuild_finished_at if include_private_diagnostics else None,
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


def _shared_question_edges_payload(
    *,
    node_concept_ids: set[int],
    related_question_ids: set[Any],
) -> list[dict[str, Any]]:
    if len(node_concept_ids) < 2 or not related_question_ids:
        return []

    question_edges = (
        QuestionConceptEdge.objects.filter(
            question_id__in=related_question_ids,
            concept_id__in=node_concept_ids,
        )
        .select_related('question', 'concept')
        .order_by('question__question_title', 'question_id', 'concept_id')
    )

    concept_ids_by_question: dict[Any, set[int]] = defaultdict(set)
    question_summaries: dict[Any, dict[str, Any]] = {}
    for edge in question_edges:
        concept_ids_by_question[edge.question_id].add(edge.concept_id)
        question_summaries[edge.question_id] = {
            'question_id': edge.question_id,
            'title': edge.question.question_title,
            'status': edge.question.question_status,
        }

    questions_by_pair: dict[tuple[int, int], dict[Any, dict[str, Any]]] = defaultdict(dict)
    for question_id, concept_ids in concept_ids_by_question.items():
        for source_concept_id, target_concept_id in combinations(sorted(concept_ids), 2):
            questions_by_pair[(source_concept_id, target_concept_id)][question_id] = question_summaries[question_id]

    edge_payloads = []
    for (source_concept_id, target_concept_id), shared_questions_by_id in sorted(questions_by_pair.items()):
        related_questions = sorted(
            shared_questions_by_id.values(),
            key=lambda summary: (summary['title'], str(summary['question_id'])),
        )
        shared_question_count = len(shared_questions_by_id)
        edge_payloads.append(
            {
                'id': f'shared-question:{source_concept_id}:{target_concept_id}',
                'source_concept_id': source_concept_id,
                'target_concept_id': target_concept_id,
                'weight': Decimal(shared_question_count),
                'shared_question_count': shared_question_count,
                'reason': 'shared_question',
                'related_questions': related_questions[:RELATED_QUESTION_PREVIEW_LIMIT],
            }
        )

    return edge_payloads


def _semantic_candidate_edges_payload(
    *,
    user,
    node_concept_ids: set[int],
    concept_ids_by_question_id: dict[str, set[int]],
) -> list[dict[str, Any]]:
    """Build owner-only aggregate semantic edge DTOs from persisted candidate rows.

    Candidate snapshots carry private source ids and vector metadata. This payload
    only uses source ids as an internal join key to already-visible graph concepts
    and emits aggregate counts/ranks, never source ids, hashes, vectors, or raw text.
    """

    if len(node_concept_ids) < 2 or not concept_ids_by_question_id:
        return []

    pair_summaries: dict[tuple[int, int], dict[str, Any]] = {}
    candidates = (
        UserKnowledgeGraphSemanticCandidate.objects.filter(
            user=user,
            source_snapshot__source_type='question',
            target_snapshot__source_type='question',
        )
        .select_related('source_snapshot', 'target_snapshot')
        .order_by('-similarity_score', 'rank', 'source_snapshot_id', 'target_snapshot_id', 'id')
    )

    for candidate in candidates:
        source_concept_ids = concept_ids_by_question_id.get(str(candidate.source_snapshot.source_id), set())
        target_concept_ids = concept_ids_by_question_id.get(str(candidate.target_snapshot.source_id), set())
        if not source_concept_ids or not target_concept_ids:
            continue

        for source_concept_id in sorted(source_concept_ids):
            if source_concept_id not in node_concept_ids:
                continue
            for target_concept_id in sorted(target_concept_ids):
                if target_concept_id not in node_concept_ids or source_concept_id == target_concept_id:
                    continue

                pair = tuple(sorted((source_concept_id, target_concept_id)))
                summary = pair_summaries.get(pair)
                if summary is None:
                    pair_summaries[pair] = {
                        'similarity_score': candidate.similarity_score,
                        'rank': candidate.rank,
                        'candidate_count': 1,
                    }
                    continue

                summary['candidate_count'] += 1
                if (candidate.similarity_score, -candidate.rank) > (summary['similarity_score'], -summary['rank']):
                    summary['similarity_score'] = candidate.similarity_score
                    summary['rank'] = candidate.rank

    semantic_edges = []
    for (source_concept_id, target_concept_id), summary in pair_summaries.items():
        similarity_score = summary['similarity_score']
        rank = summary['rank']
        semantic_edges.append(
            {
                'id': f'semantic-neighbour:{source_concept_id}:{target_concept_id}',
                'source_concept_id': source_concept_id,
                'target_concept_id': target_concept_id,
                'weight': similarity_score,
                'similarity_score': similarity_score,
                'confidence': similarity_score,
                'rank': rank,
                'reason': 'semantic_neighbour',
                'evidence': {
                    'candidate_count': summary['candidate_count'],
                    'best_rank': rank,
                },
            }
        )

    return sorted(
        semantic_edges,
        key=lambda edge: (-edge['similarity_score'], edge['rank'], edge['source_concept_id'], edge['target_concept_id']),
    )


def _semantic_groups_payload(*, user, node_concept_ids: set[int]) -> list[dict[str, Any]]:
    """Build owner-only semantic group DTOs from persisted rows.

    Group rows include provider/model internals and may point at concepts outside
    the currently visible owner graph. The API emits only whitelisted group text,
    aggregate evidence, and memberships for concepts already present in nodes.
    """

    if not node_concept_ids:
        return []

    groups = (
        UserKnowledgeGraphSemanticGroup.objects.filter(user=user)
        .prefetch_related('memberships__concept')
        .order_by('-generated_at', 'group_key', 'id')
    )

    payloads = []
    for group in groups:
        members = []
        memberships = sorted(
            group.memberships.all(),
            key=lambda membership: (membership.rank, membership.concept.slug, membership.concept_id),
        )
        for membership in memberships:
            concept = membership.concept
            if concept.id not in node_concept_ids:
                continue
            members.append(
                {
                    'concept_id': concept.id,
                    'slug': concept.slug,
                    'name': concept.name,
                    'rank': membership.rank,
                    'confidence': membership.confidence,
                    'evidence': membership.evidence,
                }
            )

        if not members:
            continue

        payloads.append(
            {
                'group_key': group.group_key,
                'label': group.label,
                'description': group.description,
                'rationale': group.rationale,
                'confidence': group.confidence,
                'generated_at': group.generated_at,
                'evidence': group.evidence,
                'members': members,
            }
        )

    return payloads


def _get_layout_for_user(user) -> UserKnowledgeGraphLayout | None:
    try:
        return user.knowledge_graph_layout
    except UserKnowledgeGraphLayout.DoesNotExist:
        return None


def _layout_payload(layout: UserKnowledgeGraphLayout | None, *, allowed_concept_ids: set[int]) -> dict[str, Any]:
    if layout is None:
        return {
            'schema_version': LAYOUT_SCHEMA_VERSION,
            'positions': {},
            'updated_at': None,
        }

    allowed_keys = {str(concept_id) for concept_id in allowed_concept_ids}
    positions = {}
    for concept_id, position in layout.positions.items():
        if concept_id not in allowed_keys or not isinstance(position, dict):
            continue

        try:
            x = float(position['x'])
            y = float(position['y'])
        except (KeyError, TypeError, ValueError):
            continue

        if not isfinite(x) or not isfinite(y) or abs(x) > MAX_LAYOUT_COORDINATE_ABS or abs(y) > MAX_LAYOUT_COORDINATE_ABS:
            continue

        positions[concept_id] = {'x': x, 'y': y}

    return {
        'schema_version': layout.schema_version,
        'positions': positions,
        'updated_at': layout.updated_at,
    }


def _user_graph_concept_ids(user) -> set[int]:
    return set(UserConceptActivity.objects.filter(user=user).values_list('concept_id', flat=True).distinct())


def get_user_graph_layout_payload(user) -> dict[str, Any]:
    return _layout_payload(_get_layout_for_user(user), allowed_concept_ids=_user_graph_concept_ids(user))


def save_user_graph_layout(user, *, schema_version: int, positions: dict[str, dict[str, float]]) -> dict[str, Any]:
    if schema_version != LAYOUT_SCHEMA_VERSION:
        raise serializers.ValidationError({'schema_version': 'Unsupported layout schema version.'})

    if len(positions) > MAX_LAYOUT_POSITIONS:
        raise serializers.ValidationError({'positions': 'Too many layout positions.'})

    allowed_concept_ids = _user_graph_concept_ids(user)
    normalized_positions: dict[str, dict[str, float]] = {}
    unknown_concept_ids: list[str] = []

    for concept_id, position in positions.items():
        if len(str(concept_id)) > MAX_LAYOUT_CONCEPT_ID_LENGTH or not str(concept_id).isdigit():
            raise serializers.ValidationError({'positions': 'Invalid concept id.'})

        try:
            normalized_concept_id = int(concept_id)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'positions': 'Invalid concept id.'})

        if normalized_concept_id not in allowed_concept_ids:
            unknown_concept_ids.append(str(concept_id))
            continue

        x = float(position['x'])
        y = float(position['y'])
        if (
            not isfinite(x)
            or not isfinite(y)
            or abs(x) > MAX_LAYOUT_COORDINATE_ABS
            or abs(y) > MAX_LAYOUT_COORDINATE_ABS
        ):
            raise serializers.ValidationError({'positions': 'Invalid coordinates.'})

        normalized_positions[str(normalized_concept_id)] = {
            'x': x,
            'y': y,
        }

    if unknown_concept_ids:
        preview = ', '.join(sorted(unknown_concept_ids)[:5])
        suffix = '…' if len(unknown_concept_ids) > 5 else ''
        raise serializers.ValidationError({'positions': f'Unknown concept ids: {preview}{suffix}.'})

    with transaction.atomic():
        layout, _ = UserKnowledgeGraphLayout.objects.select_for_update().get_or_create(
            user=user,
            defaults={'schema_version': LAYOUT_SCHEMA_VERSION, 'positions': {}},
        )
        layout.schema_version = LAYOUT_SCHEMA_VERSION
        layout.positions = normalized_positions
        layout.save(update_fields=['schema_version', 'positions', 'updated_at'])

    return _layout_payload(layout, allowed_concept_ids=allowed_concept_ids)


def reset_user_graph_layout(user) -> dict[str, Any]:
    UserKnowledgeGraphLayout.objects.filter(user=user).delete()
    return {
        'schema_version': LAYOUT_SCHEMA_VERSION,
        'positions': {},
        'updated_at': None,
    }


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
    concept_ids_by_question_id: dict[str, set[int]] = defaultdict(set)
    seen_related_questions: set[tuple[int, Any]] = set()
    for row in related_question_rows:
        concept_id = row['concept_id']
        related_question_id = row['related_question_id']
        concept_ids_by_question_id[str(related_question_id)].add(concept_id)
        key = (concept_id, related_question_id)
        if key in seen_related_questions:
            continue
        seen_related_questions.add(key)
        questions_by_concept[concept_id].append(
            {
                'question_id': related_question_id,
                'title': row['related_question__question_title'],
                'status': row['related_question__question_status'],
            }
        )

    concepts = []
    node_concept_ids: set[int] = set()
    for row in concept_total_rows:
        concept_id = row['concept_id']
        node_concept_ids.add(concept_id)
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
    related_question_ids = {row['related_question_id'] for row in related_question_rows}
    edges = _shared_question_edges_payload(
        node_concept_ids=node_concept_ids,
        related_question_ids=related_question_ids,
    )

    payload = {
        'user_id': user.pk,
        'viewer': {'is_owner': is_owner},
        'state': _state_payload(state, include_private_diagnostics=is_owner),
        'total_weight': total_weight,
        'activity_breakdown': _activity_breakdown_payload(overall_breakdown_rows),
        'concepts': concepts,
        'nodes': concepts,
        'edges': edges,
    }

    if is_owner:
        payload['layout'] = _layout_payload(_get_layout_for_user(user), allowed_concept_ids=node_concept_ids)
        payload['semantic_edges'] = _semantic_candidate_edges_payload(
            user=user,
            node_concept_ids=node_concept_ids,
            concept_ids_by_question_id=concept_ids_by_question_id,
        )
        payload['semantic_groups'] = _semantic_groups_payload(user=user, node_concept_ids=node_concept_ids)

    return payload


def get_rebuild_summary_payload(summary: UserKnowledgeGraphRebuildSummary) -> dict[str, Any]:
    """Build a redacted aggregate owner rebuild response DTO."""

    payload = {
        'user_id': summary.user_id,
        'processed_questions': summary.processed_questions,
        'processed_activity_sources': summary.processed_activity_sources,
        'structural_summary': summary.structural_summary.as_stdout_fields(),
        'activity_summary': summary.activity_summary.as_stdout_fields(),
        'state': _state_payload(summary.state),
    }
    if summary.semantic is not None:
        payload['semantic'] = summary.semantic
    return payload


def get_rebuild_error_payload(user, *, code: str = 'knowledge_graph_rebuild_failed') -> dict[str, Any]:
    """Build a redacted rebuild failure DTO from persisted graph state only."""

    state = get_user_graph_state(user)
    return {
        'error': {
            'code': code,
            'message': 'Knowledge graph rebuild failed.',
        },
        'state': _state_payload(state),
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
