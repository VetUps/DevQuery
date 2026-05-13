from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import math
import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.knowledge.models import (
    UserConceptActivity,
    UserKnowledgeGraphEmbeddingSnapshot,
    UserKnowledgeGraphSemanticCandidate,
    UserKnowledgeGraphSemanticState,
)
from apps.knowledge.semantic_providers import (
    FakeKnowledgeGraphEmbeddingProvider,
    FakeKnowledgeGraphGroupingProvider,
    KnowledgeGraphEmbeddingConfig,
    KnowledgeGraphEmbeddingProvider,
    KnowledgeGraphEmbeddingRequest,
    KnowledgeGraphGroupingConfig,
    KnowledgeGraphGroupingProvider,
    KnowledgeGraphGroupingRequest,
    KnowledgeGraphProviderBudgetExceeded,
    KnowledgeGraphProviderConfigurationError,
    KnowledgeGraphProviderError,
    KnowledgeGraphProviderMalformedResponse,
    KnowledgeGraphProviderMetadata,
    KnowledgeGraphProviderTimeout,
    KnowledgeGraphSemanticConfig,
    estimate_text_tokens,
)

SEMANTIC_SOURCE_LIMIT = 500
SAFE_ERROR_MESSAGES = {
    'configuration_error': 'Knowledge graph semantic provider configuration is incomplete.',
    'budget_exceeded': 'Knowledge graph semantic rebuild budget cap would be exceeded.',
    'timeout': 'Knowledge graph semantic provider timed out.',
    'malformed_response': 'Knowledge graph semantic provider returned malformed output.',
    'provider_error': 'Knowledge graph semantic provider request failed.',
}


@dataclass(frozen=True)
class OwnerSemanticRebuildEstimate:
    source_item_count: int
    estimated_token_count: int
    estimated_cost: Decimal
    budget_cap: Decimal
    source_provider: str
    source_model: str
    grouping_provider: str
    grouping_model: str
    source_summaries: list[dict[str, Any]]
    source_texts: list[str]
    source_hashes: list[str]


def create_source_provider(config: KnowledgeGraphEmbeddingConfig) -> KnowledgeGraphEmbeddingProvider:
    """Factory seam for future live embedding providers; currently safe-local for S01."""

    return FakeKnowledgeGraphEmbeddingProvider(dimensions=config.dimensions, model=config.model or 'fake-embedding-v1')


def create_grouping_provider(config: KnowledgeGraphGroupingConfig) -> KnowledgeGraphGroupingProvider:
    """Factory seam for future live grouping providers; currently safe-local for S01."""

    return FakeKnowledgeGraphGroupingProvider(model=config.model or 'fake-grouping-v1')


def _decimal_cost(value: float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)


def _state_payload(state: UserKnowledgeGraphSemanticState) -> dict[str, Any]:
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
        'total_source_count': state.source_item_count,
        'changed_source_count': state.changed_source_item_count,
        'provider_called_source_count': state.changed_source_item_count,
        'reused_snapshot_count': state.reused_snapshot_count,
        'persisted_snapshot_count': state.snapshot_item_count,
        'neighbour_candidate_count': state.neighbor_candidate_count,
        'semantic_group_count': state.semantic_group_count,
        'semantic_group_membership_count': state.semantic_group_membership_count,
        'estimated_token_count': state.estimated_token_count,
        'estimated_cost': state.estimated_cost,
        'budget_cap': state.budget_cap,
        'last_error_message': state.last_error_message,
        'started_at': state.started_at,
        'finished_at': state.finished_at,
    }


def get_owner_semantic_state_payload(user) -> dict[str, Any]:
    state, _ = UserKnowledgeGraphSemanticState.objects.get_or_create(user=user)
    return _state_payload(state)


def estimate_owner_semantic_rebuild(
    user,
    *,
    semantic_config: KnowledgeGraphSemanticConfig | None = None,
    embedding_config: KnowledgeGraphEmbeddingConfig | None = None,
    grouping_config: KnowledgeGraphGroupingConfig | None = None,
) -> OwnerSemanticRebuildEstimate:
    semantic_config = semantic_config or KnowledgeGraphSemanticConfig.from_django_settings()
    embedding_config = embedding_config or KnowledgeGraphEmbeddingConfig.from_django_settings()
    grouping_config = grouping_config or KnowledgeGraphGroupingConfig.from_django_settings()

    activities = (
        UserConceptActivity.objects.filter(user=user, related_question__isnull=False)
        .select_related('related_question')
        .prefetch_related('related_question__tags')
        .order_by('id')[:SEMANTIC_SOURCE_LIMIT]
    )
    questions_by_id = {}
    for activity in activities:
        if activity.related_question_id and activity.related_question_id not in questions_by_id:
            questions_by_id[activity.related_question_id] = activity.related_question

    source_summaries: list[dict[str, Any]] = []
    source_texts: list[str] = []
    source_hashes: list[str] = []
    for question in questions_by_id.values():
        tag_names = sorted(tag.name for tag in question.tags.all())
        canonical_text = _canonical_question_source_text(question, tag_names)
        source_summaries.append(
            {
                'source_type': 'question',
                'source_id': str(question.pk),
                'title': question.question_title,
                'tag_count': len(tag_names),
            }
        )
        source_texts.append(canonical_text)
        source_hashes.append(hashlib.sha256(canonical_text.encode('utf-8')).hexdigest())
    embedding_tokens = estimate_text_tokens(source_texts) if source_texts else 0
    grouping_tokens = estimate_text_tokens([summary['title'] for summary in source_summaries]) if source_summaries else 0
    estimated_tokens = embedding_tokens + grouping_tokens
    estimated_cost = _decimal_cost(
        (Decimal(embedding_tokens) * Decimal(str(embedding_config.price_per_1k_tokens)) / Decimal('1000'))
        + (Decimal(grouping_tokens) * Decimal(str(grouping_config.price_per_1k_tokens)) / Decimal('1000'))
    )

    return OwnerSemanticRebuildEstimate(
        source_item_count=len(source_summaries),
        estimated_token_count=estimated_tokens,
        estimated_cost=estimated_cost,
        budget_cap=_decimal_cost(semantic_config.rebuild_budget_cap),
        source_provider=embedding_config.metadata.provider,
        source_model=embedding_config.metadata.model,
        grouping_provider=grouping_config.metadata.provider,
        grouping_model=grouping_config.metadata.model,
        source_summaries=source_summaries,
        source_texts=source_texts,
        source_hashes=source_hashes,
    )


_SECRET_TOKEN_RE = re.compile(r'\bsk_[A-Za-z0-9_\-]+\b')
_EMAIL_RE = re.compile(r'\b[^\s@]+@[^\s@]+\.[^\s@]+\b')


def _redact_source_text(value: str) -> str:
    value = _SECRET_TOKEN_RE.sub('[redacted-token]', value or '')
    value = _EMAIL_RE.sub('[redacted-email]', value)
    return ' '.join(value.split())


def _canonical_question_source_text(question, tag_names: list[str]) -> str:
    return '\n'.join(
        [
            'source_type:question',
            f'title:{_redact_source_text(question.question_title)}',
            f'tags:{", ".join(tag_names)}',
            f'body:{_redact_source_text(question.question_body)}',
        ]
    )


def _safe_error_payload(error: Exception) -> tuple[str, str, str, str, str, str]:
    if isinstance(error, KnowledgeGraphProviderError):
        code = error.code
        phase = error.phase
        provider = error.provider or ''
        model = error.model or ''
    else:
        code = 'provider_error'
        phase = 'semantic_provider'
        provider = ''
        model = ''
    status = code if code in UserKnowledgeGraphSemanticState.Status.values else 'provider_error'
    return status, code, phase, provider, model, SAFE_ERROR_MESSAGES.get(code, SAFE_ERROR_MESSAGES['provider_error'])


def _persist_state(
    user,
    *,
    estimate: OwnerSemanticRebuildEstimate,
    semantic_config: KnowledgeGraphSemanticConfig,
    status: str,
    reason_code: str = '',
    phase: str = '',
    last_error_message: str = '',
    started_at=None,
    changed_source_item_count: int = 0,
    reused_snapshot_count: int = 0,
    snapshot_item_count: int = 0,
    neighbor_candidate_count: int = 0,
) -> UserKnowledgeGraphSemanticState:
    now = timezone.now()
    with transaction.atomic():
        state, _ = UserKnowledgeGraphSemanticState.objects.select_for_update().get_or_create(user=user)
        state.status = status
        state.reason_code = reason_code
        state.phase = phase
        state.enabled = semantic_config.enabled
        state.dry_run = semantic_config.dry_run
        state.source_provider = estimate.source_provider
        state.source_model = estimate.source_model
        state.grouping_provider = estimate.grouping_provider
        state.grouping_model = estimate.grouping_model
        state.source_item_count = estimate.source_item_count
        state.changed_source_item_count = changed_source_item_count
        state.reused_snapshot_count = reused_snapshot_count
        state.snapshot_item_count = snapshot_item_count
        state.neighbor_candidate_count = neighbor_candidate_count
        state.estimated_token_count = estimate.estimated_token_count
        state.estimated_cost = estimate.estimated_cost
        state.budget_cap = estimate.budget_cap
        state.last_error_message = last_error_message[:255]
        state.started_at = started_at or now
        state.finished_at = now
        state.save()
    return state


def _find_reusable_snapshots(user, estimate: OwnerSemanticRebuildEstimate, embedding_config: KnowledgeGraphEmbeddingConfig):
    reusable = {}
    missing_indexes = []
    for index, summary in enumerate(estimate.source_summaries):
        snapshot = (
            UserKnowledgeGraphEmbeddingSnapshot.objects.filter(
                user=user,
                source_type=summary['source_type'],
                source_id=summary['source_id'],
                model=embedding_config.metadata.model,
                dimensions=embedding_config.dimensions,
                content_hash=estimate.source_hashes[index],
            )
            .order_by('-generated_at', '-id')
            .first()
        )
        if snapshot is None:
            missing_indexes.append(index)
        else:
            reusable[index] = snapshot
    return reusable, missing_indexes


def _estimate_changed_rebuild_cost(
    estimate: OwnerSemanticRebuildEstimate,
    *,
    missing_indexes: list[int],
    semantic_config: KnowledgeGraphSemanticConfig,
    embedding_config: KnowledgeGraphEmbeddingConfig,
    grouping_config: KnowledgeGraphGroupingConfig,
) -> OwnerSemanticRebuildEstimate:
    """Return diagnostics with provider-budget cost scoped to sources that need fresh embeddings."""

    changed_texts = [estimate.source_texts[index] for index in missing_indexes]
    embedding_tokens = estimate_text_tokens(changed_texts) if changed_texts else 0
    grouping_tokens = estimate_text_tokens([summary['title'] for summary in estimate.source_summaries]) if changed_texts else 0
    estimated_cost = _decimal_cost(
        (Decimal(embedding_tokens) * Decimal(str(embedding_config.price_per_1k_tokens)) / Decimal('1000'))
        + (Decimal(grouping_tokens) * Decimal(str(grouping_config.price_per_1k_tokens)) / Decimal('1000'))
    )
    return replace(
        estimate,
        estimated_token_count=embedding_tokens + grouping_tokens,
        estimated_cost=estimated_cost,
        budget_cap=_decimal_cost(semantic_config.rebuild_budget_cap),
    )


def _validate_embedding_vectors(vectors: list[list[float]], expected_count: int, dimensions: int) -> list[list[float]]:
    if len(vectors) != expected_count:
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding vector count did not match source count.', phase='embedding')
    normalized = []
    seen = set()
    for vector in vectors:
        if len(vector) != dimensions:
            raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding vector dimensions did not match configuration.', phase='embedding')
        normalized_vector = []
        for value in vector:
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding vector contained a non-numeric value.', phase='embedding')
            normalized_vector.append(float(value))
        key = tuple(normalized_vector)
        if key in seen:
            raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding response contained duplicate vectors.', phase='embedding')
        seen.add(key)
        normalized.append(normalized_vector)
    return normalized


def _persist_snapshots(user, estimate: OwnerSemanticRebuildEstimate, provider_metadata, indexes: list[int], vectors: list[list[float]], generated_at):
    snapshots = {}
    for index, vector in zip(indexes, vectors):
        summary = estimate.source_summaries[index]
        snapshot, _ = UserKnowledgeGraphEmbeddingSnapshot.objects.update_or_create(
            user=user,
            source_type=summary['source_type'],
            source_id=summary['source_id'],
            provider=provider_metadata.provider,
            model=provider_metadata.model,
            dimensions=provider_metadata.dimensions,
            content_hash=estimate.source_hashes[index],
            defaults={'vector_payload': vector, 'generated_at': generated_at},
        )
        snapshots[index] = snapshot
    return snapshots


def _cosine_similarity(left: list[float], right: list[float]) -> Decimal:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = _vector_norm(left)
    right_norm = _vector_norm(right)
    if left_norm == 0 or right_norm == 0:
        return Decimal('0.00000')
    value = max(0.0, min(1.0, dot / (left_norm * right_norm)))
    return Decimal(str(value)).quantize(Decimal('0.00001'), rounding=ROUND_HALF_UP)


def _vector_norm(vector: list[float]) -> float:
    return math.sqrt(sum(value * value for value in vector))


def _replace_semantic_candidates(user, snapshots_by_index: dict[int, UserKnowledgeGraphEmbeddingSnapshot], generated_at, limit: int = 10) -> int:
    snapshots = [snapshots_by_index[index] for index in sorted(snapshots_by_index)]
    if snapshots:
        snapshot_ids = [snapshot.pk for snapshot in snapshots]
        UserKnowledgeGraphSemanticCandidate.objects.filter(
            Q(user=user)
            | Q(source_snapshot__user=user)
            | Q(target_snapshot__user=user)
            | Q(source_snapshot_id__in=snapshot_ids)
            | Q(target_snapshot_id__in=snapshot_ids),
        ).delete()
    pairs = []
    for source in snapshots:
        if _vector_norm(source.vector_payload) == 0:
            continue
        for target in snapshots:
            if source.pk == target.pk or _vector_norm(target.vector_payload) == 0:
                continue
            similarity = _cosine_similarity(source.vector_payload, target.vector_payload)
            pairs.append((similarity, source.pk, target.pk, source, target))
    pairs.sort(key=lambda item: (-item[0], str(item[1]), str(item[2])))
    for rank, (similarity, _source_pk, _target_pk, source, target) in enumerate(pairs[:limit], start=1):
        UserKnowledgeGraphSemanticCandidate.objects.create(
            user=user,
            source_snapshot=source,
            target_snapshot=target,
            provider=source.provider,
            model=source.model,
            dimensions=source.dimensions,
            similarity_score=similarity,
            rank=rank,
            generated_at=generated_at,
        )
    return min(len(pairs), limit)


def run_owner_semantic_boundary(
    user,
    *,
    source_provider_factory: Callable[[KnowledgeGraphEmbeddingConfig], KnowledgeGraphEmbeddingProvider] | None = None,
    grouping_provider_factory: Callable[[KnowledgeGraphGroupingConfig], KnowledgeGraphGroupingProvider] | None = None,
) -> dict[str, Any]:
    """Run the M016 S03 owner semantic boundary and persist portable snapshots/candidates."""

    explicit_grouping_provider_factory = grouping_provider_factory is not None
    source_provider_factory = source_provider_factory or create_source_provider
    grouping_provider_factory = grouping_provider_factory or create_grouping_provider
    started_at = timezone.now()
    semantic_config = KnowledgeGraphSemanticConfig.from_django_settings()
    embedding_config = KnowledgeGraphEmbeddingConfig.from_django_settings()
    grouping_config = KnowledgeGraphGroupingConfig.from_django_settings()
    estimate = estimate_owner_semantic_rebuild(
        user,
        semantic_config=semantic_config,
        embedding_config=embedding_config,
        grouping_config=grouping_config,
    )
    diagnostic_estimate = estimate
    provider_attempted_count = 0

    try:
        embedding_config.validate(enabled=semantic_config.enabled)
        grouping_config.validate(enabled=semantic_config.enabled)

        if not semantic_config.enabled:
            state = _persist_state(
                user,
                estimate=estimate,
                semantic_config=semantic_config,
                status=UserKnowledgeGraphSemanticState.Status.DISABLED,
                reason_code='ai_disabled',
                phase='configuration',
                started_at=started_at,
            )
            return _state_payload(state)

        if estimate.source_item_count == 0:
            state = _persist_state(
                user,
                estimate=estimate,
                semantic_config=semantic_config,
                status=UserKnowledgeGraphSemanticState.Status.EMPTY,
                reason_code='empty_owner_graph',
                phase='estimation',
                started_at=started_at,
            )
            return _state_payload(state)

        reusable_snapshots, missing_indexes = _find_reusable_snapshots(user, estimate, embedding_config)
        changed_estimate = _estimate_changed_rebuild_cost(
            estimate,
            missing_indexes=missing_indexes,
            semantic_config=semantic_config,
            embedding_config=embedding_config,
            grouping_config=grouping_config,
        )
        diagnostic_estimate = changed_estimate
        semantic_config.validate_budget(float(changed_estimate.estimated_cost))

        if semantic_config.dry_run:
            state = _persist_state(
                user,
                estimate=changed_estimate,
                semantic_config=semantic_config,
                status=UserKnowledgeGraphSemanticState.Status.DRY_RUN,
                reason_code='dry_run_only',
                phase='estimation',
                started_at=started_at,
                changed_source_item_count=len(missing_indexes),
                reused_snapshot_count=len(reusable_snapshots),
            )
            return _state_payload(state)

        persisted_snapshots = {}
        provider_metadata = None
        generated_at = timezone.now()
        if missing_indexes:
            provider_attempted_count = len(missing_indexes)
            source_provider = source_provider_factory(embedding_config)
            result = source_provider.embed(
                KnowledgeGraphEmbeddingRequest(texts=[estimate.source_texts[index] for index in missing_indexes])
            )
            provider_metadata = result.metadata
            dimensions = provider_metadata.dimensions or embedding_config.dimensions
            vectors = _validate_embedding_vectors(result.vectors, len(missing_indexes), dimensions)
            if explicit_grouping_provider_factory:
                grouping_provider = grouping_provider_factory(grouping_config)
                grouping_provider.group(KnowledgeGraphGroupingRequest(concepts=estimate.source_summaries))
            provider_metadata = KnowledgeGraphProviderMetadata(
                provider=provider_metadata.provider,
                model=provider_metadata.model,
                dimensions=dimensions,
                timeout_seconds=provider_metadata.timeout_seconds,
                price_per_1k_tokens=provider_metadata.price_per_1k_tokens,
            )
            with transaction.atomic():
                persisted_snapshots = _persist_snapshots(user, estimate, provider_metadata, missing_indexes, vectors, generated_at)
        snapshots_by_index = {**reusable_snapshots, **persisted_snapshots}
        candidate_count = _replace_semantic_candidates(user, snapshots_by_index, generated_at)

        state = _persist_state(
            user,
            estimate=changed_estimate,
            semantic_config=semantic_config,
            status=UserKnowledgeGraphSemanticState.Status.SUCCEEDED,
            reason_code='semantic_snapshots_persisted',
            phase='embedding',
            started_at=started_at,
            changed_source_item_count=len(missing_indexes),
            reused_snapshot_count=len(reusable_snapshots),
            snapshot_item_count=len(persisted_snapshots),
            neighbor_candidate_count=candidate_count,
        )
        return _state_payload(state)
    except (KnowledgeGraphProviderConfigurationError, KnowledgeGraphProviderBudgetExceeded, KnowledgeGraphProviderTimeout, KnowledgeGraphProviderMalformedResponse, KnowledgeGraphProviderError) as exc:
        status, code, phase, provider, model, message = _safe_error_payload(exc)
        state = _persist_state(
            user,
            estimate=diagnostic_estimate,
            semantic_config=semantic_config,
            status=status,
            reason_code=code,
            phase=phase,
            last_error_message=message,
            started_at=started_at,
            changed_source_item_count=provider_attempted_count if code in {'timeout', 'provider_error', 'malformed_response'} else 0,
        )
        return _state_payload(state)
    except Exception as exc:
        status, code, phase, provider, model, message = _safe_error_payload(exc)
        state = _persist_state(
            user,
            estimate=diagnostic_estimate,
            semantic_config=semantic_config,
            status=status,
            reason_code=code,
            phase=phase,
            last_error_message=message,
            started_at=started_at,
        )
        return _state_payload(state)
