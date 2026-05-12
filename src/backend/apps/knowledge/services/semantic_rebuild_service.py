from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from apps.knowledge.models import UserConceptActivity, UserKnowledgeGraphSemanticState
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

    rows = list(
        UserConceptActivity.objects.filter(user=user)
        .values('concept_id', 'concept__slug', 'concept__name')
        .annotate(total_weight=Sum('weight_delta'), source_count=Count('id'))
        .order_by('concept__slug', 'concept_id')[:SEMANTIC_SOURCE_LIMIT]
    )

    source_summaries = [
        {
            'slug': row['concept__slug'],
            'name': row['concept__name'],
            'source_count': row['source_count'],
            'total_weight': str(row['total_weight'] or Decimal('0.0000')),
        }
        for row in rows
    ]
    source_texts = [
        f"{summary['slug']} {summary['name']} sources:{summary['source_count']} weight:{summary['total_weight']}"
        for summary in source_summaries
    ]
    embedding_tokens = estimate_text_tokens(source_texts) if source_texts else 0
    grouping_tokens = estimate_text_tokens([summary['slug'] for summary in source_summaries]) if source_summaries else 0
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
        state.estimated_token_count = estimate.estimated_token_count
        state.estimated_cost = estimate.estimated_cost
        state.budget_cap = estimate.budget_cap
        state.last_error_message = last_error_message[:255]
        state.started_at = started_at or now
        state.finished_at = now
        state.save()
    return state


def run_owner_semantic_boundary(
    user,
    *,
    source_provider_factory: Callable[[KnowledgeGraphEmbeddingConfig], KnowledgeGraphEmbeddingProvider] = create_source_provider,
    grouping_provider_factory: Callable[[KnowledgeGraphGroupingConfig], KnowledgeGraphGroupingProvider] = create_grouping_provider,
) -> dict[str, Any]:
    """Run the M016 S01 semantic boundary without persisting embeddings/groups/semantic edges."""

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

    try:
        embedding_config.validate(enabled=semantic_config.enabled)
        grouping_config.validate(enabled=semantic_config.enabled)
        semantic_config.validate_budget(float(estimate.estimated_cost))

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

        if semantic_config.dry_run:
            state = _persist_state(
                user,
                estimate=estimate,
                semantic_config=semantic_config,
                status=UserKnowledgeGraphSemanticState.Status.DRY_RUN,
                reason_code='dry_run_only',
                phase='estimation',
                started_at=started_at,
            )
            return _state_payload(state)

        source_provider = source_provider_factory(embedding_config)
        source_provider.embed(KnowledgeGraphEmbeddingRequest(texts=estimate.source_texts))
        grouping_provider = grouping_provider_factory(grouping_config)
        grouping_provider.group(KnowledgeGraphGroupingRequest(concepts=estimate.source_summaries))

        state = _persist_state(
            user,
            estimate=estimate,
            semantic_config=semantic_config,
            status=UserKnowledgeGraphSemanticState.Status.SUCCEEDED,
            reason_code='boundary_checked',
            phase='semantic_provider',
            started_at=started_at,
        )
        return _state_payload(state)
    except (KnowledgeGraphProviderConfigurationError, KnowledgeGraphProviderBudgetExceeded, KnowledgeGraphProviderTimeout, KnowledgeGraphProviderMalformedResponse, KnowledgeGraphProviderError) as exc:
        status, code, phase, provider, model, message = _safe_error_payload(exc)
        state = _persist_state(
            user,
            estimate=estimate,
            semantic_config=semantic_config,
            status=status,
            reason_code=code,
            phase=phase,
            last_error_message=message,
            started_at=started_at,
        )
        return _state_payload(state)
    except Exception as exc:
        status, code, phase, provider, model, message = _safe_error_payload(exc)
        state = _persist_state(
            user,
            estimate=estimate,
            semantic_config=semantic_config,
            status=status,
            reason_code=code,
            phase=phase,
            last_error_message=message,
            started_at=started_at,
        )
        return _state_payload(state)
