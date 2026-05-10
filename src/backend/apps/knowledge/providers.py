from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Protocol, runtime_checkable

from django.utils.text import slugify

from apps.qa.models import Tag


TAG_SOURCE = 'tag'
TAG_BASED_PROVIDER = 'tag_based'
DEFAULT_TAG_CONFIDENCE = Decimal('1.0')


class ConceptExtractionError(ValueError):
    """Safe validation error for malformed extraction inputs or candidates."""


@dataclass(frozen=True)
class ConceptCandidate:
    name: str
    slug: str
    source: str
    provider: str
    confidence: Decimal
    originating_tag_id: int | None = None
    originating_tag_name: str | None = None

    def __post_init__(self) -> None:
        normalized_name = self._require_text(self.name, 'name')
        normalized_slug = self._require_text(self.slug, 'slug')
        normalized_source = self._require_text(self.source, 'source')
        normalized_provider = self._require_text(self.provider, 'provider')
        confidence = self._normalize_confidence(self.confidence)

        object.__setattr__(self, 'name', normalized_name)
        object.__setattr__(self, 'slug', normalized_slug)
        object.__setattr__(self, 'source', normalized_source)
        object.__setattr__(self, 'provider', normalized_provider)
        object.__setattr__(self, 'confidence', confidence)

        if self.originating_tag_name is not None:
            object.__setattr__(
                self,
                'originating_tag_name',
                self._require_text(self.originating_tag_name, 'originating_tag_name'),
            )

    @staticmethod
    def _require_text(value: str, field_name: str) -> str:
        if not isinstance(value, str):
            raise ConceptExtractionError(f'{field_name} must be text')
        normalized = value.strip()
        if not normalized:
            raise ConceptExtractionError(f'{field_name} must not be blank')
        return normalized

    @staticmethod
    def _normalize_confidence(value: Decimal | float | int | str) -> Decimal:
        try:
            confidence = Decimal(str(value))
        except Exception as exc:  # noqa: BLE001 - normalize arbitrary malformed caller data safely.
            raise ConceptExtractionError('confidence must be numeric') from exc

        if confidence < Decimal('0') or confidence > Decimal('1'):
            raise ConceptExtractionError('confidence must be between 0 and 1')
        return confidence


@runtime_checkable
class ConceptExtractionProvider(Protocol):
    """Boundary implemented by deterministic, ML, or external AI concept extractors."""

    provider_name: str

    def extract(self, tags: Iterable[Tag]) -> list[ConceptCandidate]:
        """Return validated concept candidates for existing tags without mutating storage."""


class TagBasedConceptExtractionProvider:
    """Deterministically maps existing question tags into concept candidates."""

    provider_name = TAG_BASED_PROVIDER

    def extract(self, tags: Iterable[Tag]) -> list[ConceptCandidate]:
        candidates_by_slug: dict[str, ConceptCandidate] = {}

        for tag in tags:
            candidate = self._candidate_from_tag(tag)
            candidates_by_slug.setdefault(candidate.slug, candidate)

        return [candidates_by_slug[slug] for slug in sorted(candidates_by_slug)]

    def _candidate_from_tag(self, tag: Tag) -> ConceptCandidate:
        if not isinstance(tag, Tag):
            raise ConceptExtractionError('tag extractor accepts only Tag instances')

        tag_name = ConceptCandidate._require_text(tag.name, 'tag.name')
        slug = slugify(tag_name, allow_unicode=True).lower()
        if not slug:
            raise ConceptExtractionError('tag.name must produce a non-blank slug')

        return ConceptCandidate(
            name=tag_name,
            slug=slug,
            source=TAG_SOURCE,
            provider=self.provider_name,
            confidence=DEFAULT_TAG_CONFIDENCE,
            originating_tag_id=tag.pk,
            originating_tag_name=tag_name,
        )
