from __future__ import annotations

import hashlib
import json
import logging
import re
import socket
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, Sequence
from urllib.parse import urlparse

from django.conf import settings
from jsonschema import Draft202012Validator, ValidationError as JsonSchemaValidationError


GROUPING_RESPONSE_MAX_BYTES = 64 * 1024
DEFAULT_FAKE_EMBEDDING_PROVIDER = 'fake-knowledge-graph-embedding'
DEFAULT_FAKE_GROUPING_PROVIDER = 'fake-knowledge-graph-grouping'
LIVE_EMBEDDING_PROVIDER_GIGACHAT = 'gigachat'
LIVE_GROUPING_PROVIDER_DEEPSEEK = 'deepseek'
FAKE_PROVIDER_ALIASES = {'fake', 'local', 'test', DEFAULT_FAKE_EMBEDDING_PROVIDER, DEFAULT_FAKE_GROUPING_PROVIDER}
_PROVIDER_ALLOWED_HOSTS = {
    LIVE_EMBEDDING_PROVIDER_GIGACHAT: {'gigachat.devices.sberbank.ru'},
    'gigachat_auth': {'ngw.devices.sberbank.ru'},
    LIVE_GROUPING_PROVIDER_DEEPSEEK: {'api.deepseek.com'},
}
_TEST_PROVIDER_HOST_SUFFIX = '.test'
_PROVIDER_DIAGNOSTIC_MAX_CHARS = 500
_PROVIDER_SECRET_PATTERNS = (
    re.compile(r'\bsk[_-][A-Za-z0-9_\-]{8,}\b'),
    re.compile(r'\bBearer\s+[A-Za-z0-9._~+/=\-]{20,}\b', re.IGNORECASE),
    re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
    re.compile(r'\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b'),
    re.compile(r'\b(?:postgres|postgresql|mysql|redis|mongodb)://[^\s]+', re.IGNORECASE),
    re.compile(r'\b[^\s@]+@[^\s@]+\.[^\s@]+\b'),
)
logger = logging.getLogger(__name__)


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


def _validate_live_provider_url(url: str | None, *, provider: str, field: str) -> None:
    if not url or not url.strip():
        raise KnowledgeGraphProviderConfigurationError(f'Knowledge graph {field} is not configured.')
    parsed = urlparse(url.strip())
    hostname = (parsed.hostname or '').lower()
    if parsed.scheme != 'https' or not hostname:
        raise KnowledgeGraphProviderConfigurationError(f'Knowledge graph {field} must use HTTPS.')
    allowed_hosts = _PROVIDER_ALLOWED_HOSTS.get(provider, set())
    allow_test_hosts = bool(getattr(settings, 'DEBUG', False)) or bool(getattr(settings, 'DJANGO_TEST_SQLITE', False))
    if hostname in allowed_hosts or (allow_test_hosts and hostname.endswith(_TEST_PROVIDER_HOST_SUFFIX)):
        return
    raise KnowledgeGraphProviderConfigurationError(f'Knowledge graph {field} host is not supported.')


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _redact_provider_diagnostic_text(value: Any) -> str:
    text = ' '.join(str(value or '').split())
    for pattern in _PROVIDER_SECRET_PATTERNS:
        text = pattern.sub('[redacted-secret]', text)
    if len(text) > _PROVIDER_DIAGNOSTIC_MAX_CHARS:
        return f'{text[:_PROVIDER_DIAGNOSTIC_MAX_CHARS]}…'
    return text


def _safe_provider_error_hint(error: Exception) -> str:
    status_code = getattr(error, 'status_code', None)
    try:
        status_number = int(status_code) if status_code is not None else None
    except (TypeError, ValueError):
        status_number = None
    if status_number == 401:
        return 'authentication_failed'
    if status_number == 403:
        return 'forbidden_or_wrong_scope'
    if status_number == 404:
        return 'model_or_endpoint_not_found'
    if status_number == 429:
        return 'rate_limited'
    if status_number and status_number >= 500:
        return 'provider_server_error'
    error_text = str(error.__class__.__name__).lower()
    if 'ssl' in error_text or 'certificate' in error_text:
        return 'tls_or_certificate_error'
    if _is_timeout_exception(error):
        return 'timeout'
    return 'provider_dependency_error'


def _safe_provider_exception_log_fields(error: Exception) -> dict[str, Any]:
    fields: dict[str, Any] = {
        'error_type': error.__class__.__name__,
        'provider_error_hint': _safe_provider_error_hint(error),
    }
    for attr_name, field_name in (
        ('status_code', 'provider_status_code'),
        ('code', 'provider_error_code'),
        ('type', 'provider_error_type'),
        ('request_id', 'provider_request_id'),
    ):
        value = getattr(error, attr_name, None)
        if value not in (None, ''):
            fields[field_name] = _redact_provider_diagnostic_text(value)

    body = getattr(error, 'body', None)
    if isinstance(body, Mapping):
        for key in ('code', 'type'):
            value = body.get(key)
            if value not in (None, ''):
                fields[f'provider_body_{key}'] = _redact_provider_diagnostic_text(value)
    return fields


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
    provider: str = LIVE_EMBEDDING_PROVIDER_GIGACHAT
    gigachat_scope: str = 'GIGACHAT_API_PERS'
    gigachat_auth_url: str | None = None
    gigachat_verify_ssl_certs: bool = True
    gigachat_ca_bundle_file: str | None = None
    gigachat_max_retries: int = 0

    @classmethod
    def from_django_settings(cls) -> 'KnowledgeGraphEmbeddingConfig':
        return cls(
            api_key=getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_API_KEY', None),
            base_url=getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_BASE_URL', None),
            model=getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_MODEL', None),
            dimensions=int(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_DIMENSIONS', 1536)),
            timeout_seconds=float(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_TIMEOUT_SECONDS', 10.0)),
            price_per_1k_tokens=float(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_PRICE_PER_1K_TOKENS', 0.0)),
            provider=str(getattr(settings, 'KNOWLEDGE_GRAPH_EMBEDDING_PROVIDER', LIVE_EMBEDDING_PROVIDER_GIGACHAT)).strip().lower(),
            gigachat_scope=str(getattr(settings, 'KNOWLEDGE_GRAPH_GIGACHAT_SCOPE', 'GIGACHAT_API_PERS')).strip() or 'GIGACHAT_API_PERS',
            gigachat_auth_url=_blank_to_none(getattr(settings, 'KNOWLEDGE_GRAPH_GIGACHAT_AUTH_URL', None)),
            gigachat_verify_ssl_certs=bool(getattr(settings, 'KNOWLEDGE_GRAPH_GIGACHAT_VERIFY_SSL_CERTS', True)),
            gigachat_ca_bundle_file=_blank_to_none(getattr(settings, 'KNOWLEDGE_GRAPH_GIGACHAT_CA_BUNDLE_FILE', None)),
            gigachat_max_retries=int(getattr(settings, 'KNOWLEDGE_GRAPH_GIGACHAT_MAX_RETRIES', 0)),
        )

    @property
    def metadata(self) -> KnowledgeGraphProviderMetadata:
        return KnowledgeGraphProviderMetadata(
            provider=self.provider or LIVE_EMBEDDING_PROVIDER_GIGACHAT,
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
        if self.gigachat_max_retries < 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph GigaChat retry count must not be negative.')
        if not enabled or self.provider in FAKE_PROVIDER_ALIASES:
            return
        if not self.api_key or not self.api_key.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding API key is not configured.')
        if not self.model or not self.model.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph embedding model is not configured.')
        _validate_live_provider_url(self.base_url, provider=LIVE_EMBEDDING_PROVIDER_GIGACHAT, field='embedding base URL')
        if self.gigachat_auth_url and self.gigachat_auth_url.strip():
            _validate_live_provider_url(self.gigachat_auth_url, provider='gigachat_auth', field='GigaChat auth URL')
        if not self.gigachat_verify_ssl_certs and not bool(getattr(settings, 'DEBUG', False)):
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph GigaChat TLS verification cannot be disabled outside DEBUG.')


@dataclass(frozen=True)
class KnowledgeGraphGroupingConfig:
    api_key: str | None
    base_url: str | None
    model: str | None
    timeout_seconds: float
    price_per_1k_tokens: float
    provider: str = LIVE_GROUPING_PROVIDER_DEEPSEEK

    @classmethod
    def from_django_settings(cls) -> 'KnowledgeGraphGroupingConfig':
        return cls(
            api_key=getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_API_KEY', None),
            base_url=getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_BASE_URL', None),
            model=getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_MODEL', None),
            timeout_seconds=float(getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_TIMEOUT_SECONDS', 20.0)),
            price_per_1k_tokens=float(getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_PRICE_PER_1K_TOKENS', 0.0)),
            provider=str(getattr(settings, 'KNOWLEDGE_GRAPH_CHAT_PROVIDER', LIVE_GROUPING_PROVIDER_DEEPSEEK)).strip().lower(),
        )

    @property
    def metadata(self) -> KnowledgeGraphProviderMetadata:
        return KnowledgeGraphProviderMetadata(
            provider=self.provider or LIVE_GROUPING_PROVIDER_DEEPSEEK,
            model=self.model or 'unconfigured',
            timeout_seconds=self.timeout_seconds,
            price_per_1k_tokens=self.price_per_1k_tokens,
        )

    def validate(self, *, enabled: bool) -> None:
        if self.timeout_seconds <= 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping timeout must be positive.')
        if self.price_per_1k_tokens < 0:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping price must not be negative.')
        if not enabled or self.provider in FAKE_PROVIDER_ALIASES:
            return
        if not self.api_key or not self.api_key.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping API key is not configured.')
        if not self.model or not self.model.strip():
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph grouping model is not configured.')
        _validate_live_provider_url(self.base_url, provider=LIVE_GROUPING_PROVIDER_DEEPSEEK, field='grouping base URL')


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


def _is_timeout_exception(error: Exception) -> bool:
    name = error.__class__.__name__.lower()
    return isinstance(error, (TimeoutError, socket.timeout)) or 'timeout' in name or 'timedout' in name


def _safe_provider_error(
    error: Exception,
    *,
    provider: str,
    model: str | None,
    phase: str,
) -> KnowledgeGraphProviderError:
    if isinstance(error, KnowledgeGraphProviderError):
        return error
    if _is_timeout_exception(error):
        return KnowledgeGraphProviderTimeout(
            f'Knowledge graph {phase} provider timed out.',
            provider=provider,
            model=model,
            phase=phase,
        )
    return KnowledgeGraphProviderError(
        f'Knowledge graph {phase} provider request failed.',
        provider=provider,
        model=model,
        phase=phase,
    )


def _embedding_from_sdk_item(item: Any) -> list[float]:
    if isinstance(item, Mapping):
        embedding = item.get('embedding')
    else:
        embedding = getattr(item, 'embedding', None)
    if not isinstance(embedding, list):
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding provider returned malformed output.', phase='embedding')
    return embedding


class GigaChatKnowledgeGraphEmbeddingProvider:
    """Live GigaChat embedding adapter for production semantic graph rebuilds."""

    def __init__(self, config: KnowledgeGraphEmbeddingConfig):
        config.validate(enabled=True)
        self.config = config
        self.metadata = config.metadata

    def embed(self, request: KnowledgeGraphEmbeddingRequest) -> KnowledgeGraphEmbeddingResult:
        texts = list(request.texts)
        for text in texts:
            if not isinstance(text, str) or not text.strip():
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding input text must be non-blank.', phase='embedding')
        try:
            from gigachat import GigaChat
        except ImportError as exc:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph GigaChat SDK is not installed.') from exc

        kwargs = {
            'credentials': self.config.api_key,
            'scope': self.config.gigachat_scope,
            'base_url': _blank_to_none(self.config.base_url),
            'auth_url': _blank_to_none(self.config.gigachat_auth_url),
            'verify_ssl_certs': self.config.gigachat_verify_ssl_certs,
            'ca_bundle_file': _blank_to_none(self.config.gigachat_ca_bundle_file),
            'timeout': self.config.timeout_seconds,
            'max_retries': self.config.gigachat_max_retries,
        }
        kwargs = {key: value for key, value in kwargs.items() if value is not None}
        logger.info(
            'knowledge graph embedding provider call started',
            extra={
                'event': 'knowledge_graph_embedding_provider_call_started',
                'provider': self.metadata.provider,
                'model': self.metadata.model,
                'text_count': len(texts),
                'dimensions': self.config.dimensions,
                'timeout_seconds': self.config.timeout_seconds,
            },
        )
        try:
            with GigaChat(**kwargs) as client:
                response = client.embeddings(texts, model=self.config.model)
            data = response.get('data') if isinstance(response, Mapping) else getattr(response, 'data', None)
            if not isinstance(data, list):
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph embedding provider returned malformed output.', phase='embedding')
            vectors = [_embedding_from_sdk_item(item) for item in data]
            normalized_vectors = validate_embedding_vectors(
                vectors,
                expected_count=len(texts),
                expected_dimensions=self.config.dimensions,
            )
            estimated_tokens = estimate_text_tokens(texts)
            logger.info(
                'knowledge graph embedding provider call completed',
                extra={
                    'event': 'knowledge_graph_embedding_provider_call_completed',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'text_count': len(texts),
                    'vector_count': len(normalized_vectors),
                    'dimensions': self.config.dimensions,
                    'estimated_tokens': estimated_tokens,
                },
            )
            return KnowledgeGraphEmbeddingResult(
                vectors=normalized_vectors,
                metadata=self.metadata,
                estimated_tokens=estimated_tokens,
            )
        except KnowledgeGraphProviderError:
            logger.warning(
                'knowledge graph embedding provider call failed safely',
                extra={
                    'event': 'knowledge_graph_embedding_provider_call_failed',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'text_count': len(texts),
                    'phase': 'embedding',
                },
            )
            raise
        except Exception as exc:
            safe_error_fields = _safe_provider_exception_log_fields(exc)
            logger.warning(
                'knowledge graph embedding provider call raised dependency error safely: '
                'hint=%s status_code=%s provider_code=%s provider_type=%s',
                safe_error_fields.get('provider_error_hint'),
                safe_error_fields.get('provider_status_code', ''),
                safe_error_fields.get('provider_error_code', ''),
                safe_error_fields.get('provider_error_type', ''),
                extra={
                    'event': 'knowledge_graph_embedding_provider_dependency_failed',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'text_count': len(texts),
                    'phase': 'embedding',
                    **safe_error_fields,
                },
            )
            raise _safe_provider_error(
                exc,
                provider=self.metadata.provider,
                model=self.metadata.model,
                phase='embedding',
            ) from exc


def _deepseek_grouping_messages(concepts: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    payload = {
        'concepts': [
            {
                'slug': str(concept.get('slug', '')),
                'name': str(concept.get('name', '')),
                'activity_count': concept.get('activity_count', 0),
                'candidate_count': concept.get('candidate_count', 0),
                'max_similarity': str(concept.get('max_similarity', '0')),
            }
            for concept in concepts
        ],
        'required_schema': GROUPING_RESPONSE_SCHEMA,
    }
    return [
        {
            'role': 'system',
            'content': (
                'You group knowledge graph concepts. Return only valid JSON matching the provided schema. '
                'Use only supplied concept slugs. Do not include emails, source ids, hashes, vectors, raw text, HTML, secrets, or stack traces.'
            ),
        },
        {
            'role': 'user',
            'content': json.dumps(payload, ensure_ascii=False, sort_keys=True),
        },
    ]


def _message_content_from_openai_response(response: Any) -> str:
    choices = response.get('choices') if isinstance(response, Mapping) else getattr(response, 'choices', None)
    if not choices:
        raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping provider returned malformed output.', phase='grouping')
    first_choice = choices[0]
    message = first_choice.get('message') if isinstance(first_choice, Mapping) else getattr(first_choice, 'message', None)
    content = message.get('content') if isinstance(message, Mapping) else getattr(message, 'content', None)
    if isinstance(content, str):
        return content
    raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping provider returned malformed output.', phase='grouping')


class DeepSeekKnowledgeGraphGroupingProvider:
    """Live DeepSeek OpenAI-compatible adapter for semantic concept grouping."""

    def __init__(self, config: KnowledgeGraphGroupingConfig):
        config.validate(enabled=True)
        self.config = config
        self.metadata = config.metadata

    def group(self, request: KnowledgeGraphGroupingRequest) -> KnowledgeGraphGroupingResult:
        concepts = list(request.concepts)
        for concept in concepts:
            slug = concept.get('slug') if isinstance(concept, Mapping) else None
            if not isinstance(slug, str) or not slug.strip():
                raise KnowledgeGraphProviderMalformedResponse('Knowledge graph grouping input concept slug must be non-blank.', phase='grouping')
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise KnowledgeGraphProviderConfigurationError('Knowledge graph DeepSeek SDK dependency is not installed.') from exc

        try:
            client = OpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
                timeout=self.config.timeout_seconds,
            )
            logger.info(
                'knowledge graph grouping provider call started',
                extra={
                    'event': 'knowledge_graph_grouping_provider_call_started',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'concept_count': len(concepts),
                    'timeout_seconds': self.config.timeout_seconds,
                },
            )
            response = client.chat.completions.create(
                model=self.config.model,
                messages=_deepseek_grouping_messages(concepts),
                response_format={'type': 'json_object'},
                temperature=0,
                stream=False,
            )
            groups = parse_grouping_response(_message_content_from_openai_response(response))
            estimated_tokens = estimate_text_tokens([str(concept.get('slug', '')) for concept in concepts])
            logger.info(
                'knowledge graph grouping provider call completed',
                extra={
                    'event': 'knowledge_graph_grouping_provider_call_completed',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'concept_count': len(concepts),
                    'group_count': len(groups),
                    'estimated_tokens': estimated_tokens,
                },
            )
            return KnowledgeGraphGroupingResult(
                groups=groups,
                metadata=self.metadata,
                estimated_tokens=estimated_tokens,
            )
        except KnowledgeGraphProviderError:
            logger.warning(
                'knowledge graph grouping provider call failed safely',
                extra={
                    'event': 'knowledge_graph_grouping_provider_call_failed',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'concept_count': len(concepts),
                    'phase': 'grouping',
                },
            )
            raise
        except Exception as exc:
            safe_error_fields = _safe_provider_exception_log_fields(exc)
            logger.warning(
                'knowledge graph grouping provider call raised dependency error safely: '
                'hint=%s status_code=%s provider_code=%s provider_type=%s',
                safe_error_fields.get('provider_error_hint'),
                safe_error_fields.get('provider_status_code', ''),
                safe_error_fields.get('provider_error_code', ''),
                safe_error_fields.get('provider_error_type', ''),
                extra={
                    'event': 'knowledge_graph_grouping_provider_dependency_failed',
                    'provider': self.metadata.provider,
                    'model': self.metadata.model,
                    'concept_count': len(concepts),
                    'phase': 'grouping',
                    **safe_error_fields,
                },
            )
            raise _safe_provider_error(
                exc,
                provider=self.metadata.provider,
                model=self.metadata.model,
                phase='grouping',
            ) from exc


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
