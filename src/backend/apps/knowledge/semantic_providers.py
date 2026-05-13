from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, Sequence

from django.conf import settings
from jsonschema import Draft202012Validator, ValidationError as JsonSchemaValidationError


GROUPING_RESPONSE_MAX_BYTES = 64 * 1024
DEFAULT_FAKE_EMBEDDING_PROVIDER = 'fake-knowledge-graph-embedding'
DEFAULT_FAKE_GROUPING_PROVIDER = 'fake-knowledge-graph-grouping'


class KnowledgeGraphProviderError(Exception):
    """Base safe semantic provider failure; messages are public-safe by construction."""

    code = 'provider_error'
    phase = 'semantic_provider'

    def __init__(
        self,
        message: str,
        *,
        provider: str | None = None,
        model: str | None = None,
        phase: str | None = None,
    ):
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.phase = phase or self.phase

    @property
    def diagnostics(self) -> dict[str, str | None]:
        return {
            'status': 'error',
            'code': self.code,
            'phase': self.phase,
            'provider': self.provider,
            'model': self.model,
        }


class KnowledgeGraphProviderConfigurationError(KnowledgeGraphProviderError):
    code = 'configuration_error'
    phase = 'configuration'


class KnowledgeGraphProviderTimeout(KnowledgeGraphProviderError):
    code = 'timeout'


class KnowledgeGraphProviderMalformedResponse(KnowledgeGraphProviderError):
    code = 'malformed_response'


class KnowledgeGraphProviderBudgetExceeded(KnowledgeGraphProviderError):
    code = 'budget_exceeded'
    phase = 'budget'


@dataclass(frozen=True)
class KnowledgeGraphProviderMetadata:
    provider: str
    model: str
    dimensions: int | None = None
    timeout_seconds: float | None = None
    price_per_1k_tokens: float | None = None

    def as_diagnostics(self) -> dict[str, str | int | float | None]:
        return {
            'provider': self.provider,
            'model': self.model,
            'dimensions': self.dimensions,
            'timeout_seconds': self.timeout_seconds,
            'price_per_1k_tokens': self.price_per_1k_tokens,
        }


@dataclass(frozen=True)
class KnowledgeGraphSemanticConfig:
    enabled: bool
    dry_run: bool
    rebuild_budget_cap: float

    @classmethod
    def from_django_settings(cls) -> 'KnowledgeGraphSemanticConfig':
        return cls(
            enabled=bool(getattr(settings, 'KNOWLEDGE_GRAPH_AI_ENABLED', False)),
            dry_run=bool(getattr(settings, 'KNOWLEDGE_GRAPH_AI_DRY_RUN', True)),
            rebuild_budget_cap=float(getattr(settings, 'KNOWLEDGE_GRAPH_REBUILD_BUDGET_CAP', 0.0)),
        )

    def validate_budget(self, estimated_cost: float) -> None:
        if estimated_cost < 0:
            raise KnowledgeGraphProviderBudgetExceeded('Knowledge graph estimated cost is invalid.')
        if self.rebuild_budget_cap > 0 and estimated_cost > self.rebuild_budget_cap:
            raise KnowledgeGraphProviderBudgetExceeded('Knowledge graph rebuild budget cap would be exceeded.')


@dataclass(frozen=True)
class KnowledgeGraphEmbeddingConfig:
    api_key: str | None
    base_url: str | None
    model: str | None
    dimensions: int
    timeout_seconds: float
    price_per_1k_tokens: float
    provider: str = 'knowledge_graph_embedding'

    @classmethod
    def from_django_settings(cls) -> 'KnowledgeGraphEmbeddingConfig':
        return cls(
            api_key=getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_API_KEY', None),
            base_url=getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL', None),
            model=getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_MODEL', None),
            dimensions=int(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS', 1536)),
            timeout_seconds=float(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_TIMEOUT_SECONDS', 10.0)),
            price_per_1k_tokens=float(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS', 0.0)),
        )

    @property
    def metadata(self) -> KnowledgeGraphProviderMetadata:
        return KnowledgeGraphProviderMetadata(
            provider=self.provider,
            model=self.model or 'unconfigured',
            dimensions=self.dimensions,
            timeout_seconds=self.timeout_seconds,
            price_per_1k_tokens=self.price_per_1k_tokens,
        )

    def validate(self, *, enabled: bool) -> None:
        if self.dimensions <= 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding dimensions must be positive.')
        if self.timeout_seconds <= 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding timeout must be positive.')
        if self.price_per_1k_tokens < 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding price must not be negative.')
        if not enabled:
            return
        if not self.api_key or not self.api_key.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding API key is not configured.')
        if not self.base_url or not self.base_url.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding base URL is not configured.')
        if not self.model or not self.model.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding model is not configured.')


@dataclass(frozen=True)
class KnowledgeGraphGroupingConfig:
    api_key: str | None
    base_url: str | None
    model: str | None
    timeout_seconds: float
    price_per_1k_tokens: float
    provider: str = 'knowledge_graph_grouping'

    @classmethod
    def from_django_settings(cls) -> 'KnowledgeGraphGroupingConfig':
        return cls(
            api_key=getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_API_KEY', None),
            base_url=getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_BASE_URL', None),
            model=getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_MODEL', None),
            timeout_seconds=float(getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_TIMEOUT_SECONDS', 20.0)),
            price_per_1k_tokens=float(getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS', 0.0)),
        )

    @property
    def metadata(self) -> KnowledgeGraphProviderMetadata:
        return KnowledgeGraphProviderMetadata(
            provider=self.provider,
            model=self.model or 'unconfigured',
            timeout_seconds=self.timeout_seconds,
            price_per_1k_tokens=self.price_per_1k_tokens,
        )

    def validate(self, *, enabled: bool) -> None:
        if self.timeout_seconds <= 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping timeout must be positive.')
        if self.price_per_1k_tokens < 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping price must not be negative.')
        if not enabled:
            return
        if not self.api_key or not self.api_key.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping API key is not configured.')
        if not self.base_url or not self.base_url.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping base URL is not configured.')
        if not self.model or not self.model.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping model is not configured.')


@dataclass(frozen=True)
class KnowledgeGraphEmbeddingRequest:
    texts: Sequence[str]


@dataclass(frozen=True)
class KnowledgeGraphEmbeddingResult:
    vectors: list[list[float]]
    metadata: KnowledgeGraphProviderMetadata
    estimated_tokens: int


@dataclass(frozen=True)
class KnowledgeGraphGroupingRequest:
    concepts: Sequence[Mapping[str, Any]]


@dataclass(frozen=True)
class KnowledgeGraphGroup:
    group_key: str
    label: str
    concept_slugs: list[str]
    rationale: str
    confidence: float


@dataclass(frozen=True)
class KnowledgeGraphGroupingResult:
    groups: list[KnowledgeGraphGroup]
    metadata: KnowledgeGraphProviderMetadata
    estimated_tokens: int


class KnowledgeGraphEmbeddingProvider(Protocol):
    metadata: KnowledgeGraphProviderMetadata

    def embed(self, request: KnowledgeGraphEmbeddingRequest) -> KnowledgeGraphEmbeddingResult:
        """Return bounded embedding vectors without mutating storage."""


class KnowledgeGraphGroupingProvider(Protocol):
    metadata: KnowledgeGraphProviderMetadata

    def group(self, request: KnowledgeGraphGroupingRequest) -> KnowledgeGraphGroupingResult:
        """Return validated concept groups without mutating storage."""


GROUPING_RESPONSE_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['groups'],
    'properties': {
        'groups': {
            'type': 'array',
            'maxItems': 200,
            'items': {
                'type': 'object',
                'additionalProperties': False,
                'required': ['group_key', 'label', 'concept_slugs', 'rationale', 'confidence'],
                'properties': {
                    'group_key': {'type': 'string', 'minLength': 1, 'maxLength': 120},
                    'label': {'type': 'string', 'minLength': 1, 'maxLength': 200},
                    'concept_slugs': {
                        'type': 'array',
                        'minItems': 1,
                        'maxItems': 200,
                        'uniqueItems': True,
                        'items': {'type': 'string', 'minLength': 1, 'maxLength': 200},
                    },
                    'rationale': {'type': 'string', 'minLength': 1, 'maxLength': 1000},
                    'confidence': {'type': 'number', 'minimum': 0, 'maximum': 1},
                },
            },
        },
    },
}

_GROUPING_RESPONSE_VALIDATOR = Draft202012Validator(GROUPING_RESPONSE_SCHEMA)


def validate_embedding_vectors(vectors: Any, *, expected_count: int, expected_dimensions: int) -> list[list[float]]:
    if not isinstance(vectors, list) or len(vectors) != expected_count:
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding provider returned an invalid vector count.')

    normalized_vectors: list[list[float]] = []
    for vector in vectors:
        if not isinstance(vector, list) or len(vector) != expected_dimensions:
            raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding provider returned invalid vector dimensions.')
        normalized_vector: list[float] = []
        for value in vector:
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding provider returned non-numeric vector values.')
            normalized_vector.append(float(value))
        normalized_vectors.append(normalized_vector)
    return normalized_vectors


def parse_grouping_response(raw_response: str | bytes | Mapping[str, Any]) -> list[KnowledgeGraphGroup]:
    if isinstance(raw_response, bytes):
        raw_size = len(raw_response)
        raw_text = raw_response.decode('utf-8', errors='replace')
    elif isinstance(raw_response, str):
        raw_size = len(raw_response.encode('utf-8'))
        raw_text = raw_response
    elif isinstance(raw_response, Mapping):
        raw_size = len(json.dumps(raw_response, ensure_ascii=False).encode('utf-8'))
        raw_text = None
    else:
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping provider returned an unsupported payload type.')

    if raw_size > GROUPING_RESPONSE_MAX_BYTES:
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping provider returned an oversized payload.')

    if raw_text is not None:
        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping provider returned non-JSON output.') from exc
    else:
        payload = dict(raw_response)

    try:
        _GROUPING_RESPONSE_VALIDATOR.validate(payload)
    except JsonSchemaValidationError as exc:
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping provider returned malformed group output.') from exc

    return [
        KnowledgeGraphGroup(
            group_key=group['group_key'].strip(),
            label=group['label'].strip(),
            concept_slugs=[slug.strip() for slug in group['concept_slugs']],
            rationale=group['rationale'].strip(),
            confidence=float(group['confidence']),
        )
        for group in payload['groups']
    ]


def estimate_text_tokens(texts: Sequence[str]) -> int:
    # Conservative deterministic approximation for dry-run/budget decisions; no provider calls.
    return sum(max(1, (len(text) + 3) // 4) for text in texts)


class FakeKnowledgeGraphEmbeddingProvider:
    """Deterministic local provider for tests and dry-run estimation surfaces."""

    def __init__(self, *, dimensions: int = 8, model: str = 'fake-embedding-v1'):
        if dimensions <= 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph fake embedding dimensions must be positive.')
        self.metadata = KnowledgeGraphProviderMetadata(
            provider=DEFAULT_FAKE_EMBEDDING_PROVIDER,
            model=model,
            dimensions=dimensions,
            timeout_seconds=0.0,
            price_per_1k_tokens=0.0,
        )

    def embed(self, request: KnowledgeGraphEmbeddingRequest) -> KnowledgeGraphEmbeddingResult:
        texts = list(request.texts)
        for text in texts:
            if not isinstance(text, str) or not text.strip():
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding input text must be non-blank.')
        vectors = [self._vector_for_text(text) for text in texts]
        return KnowledgeGraphEmbeddingResult(
            vectors=validate_embedding_vectors(
                vectors,
                expected_count=len(texts),
                expected_dimensions=self.metadata.dimensions or 0,
            ),
            metadata=self.metadata,
            estimated_tokens=estimate_text_tokens(texts),
        )

    def _vector_for_text(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode('utf-8')).digest()
        dimensions = self.metadata.dimensions or 0
        return [round(digest[index % len(digest)] / 255.0, 8) for index in range(dimensions)]


class FakeKnowledgeGraphGroupingProvider:
    """Deterministic grouping provider that emits strict schema-compatible groups."""

    def __init__(self, *, model: str = 'fake-grouping-v1'):
        self.metadata = KnowledgeGraphProviderMetadata(
            provider=DEFAULT_FAKE_GROUPING_PROVIDER,
            model=model,
            timeout_seconds=0.0,
            price_per_1k_tokens=0.0,
        )

    def group(self, request: KnowledgeGraphGroupingRequest) -> KnowledgeGraphGroupingResult:
        concepts = list(request.concepts)
        slugs: list[str] = []
        for concept in concepts:
            slug = concept.get('slug') if isinstance(concept, Mapping) else None
            if not isinstance(slug, str) or not slug.strip():
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping input concept slug must be non-blank.')
            slugs.append(slug.strip())

        unique_slugs = sorted(set(slugs))
        groups_payload = {
            'groups': [
                {
                    'group_key': 'fake-local-group',
                    'label': 'Связанные темы',
                    'concept_slugs': unique_slugs,
                    'rationale': 'Детерминированная группировка по агрегированным семантическим сигналам.',
                    'confidence': 1.0,
                }
            ] if unique_slugs else []
        }
        groups = parse_grouping_response(groups_payload)
        return KnowledgeGraphGroupingResult(
            groups=groups,
            metadata=self.metadata,
            estimated_tokens=estimate_text_tokens(unique_slugs),
        )
