from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable

from django.db import DatabaseError, IntegrityError, transaction

from apps.knowledge.models import ConceptTagMapping, KnowledgeConcept, QuestionConceptEdge
from apps.knowledge.providers import (
    ConceptCandidate,
    ConceptExtractionError,
    ConceptExtractionProvider,
    TagBasedConceptExtractionProvider,
)
from apps.qa.models import Question, Tag


class KnowledgeGraphBuildError(RuntimeError):
    """Safe graph build failure suitable for logs and caller-visible diagnostics."""


@dataclass(frozen=True)
class KnowledgeGraphSummary:
    question_id: str
    created_concept_ids: list[int] = field(default_factory=list)
    updated_concept_ids: list[int] = field(default_factory=list)
    created_mapping_ids: list[int] = field(default_factory=list)
    updated_mapping_ids: list[int] = field(default_factory=list)
    created_edge_ids: list[int] = field(default_factory=list)
    updated_edge_ids: list[int] = field(default_factory=list)
    removed_edge_ids: list[int] = field(default_factory=list)

    @property
    def created_concepts(self) -> int:
        return len(self.created_concept_ids)

    @property
    def updated_concepts(self) -> int:
        return len(self.updated_concept_ids)

    @property
    def created_mappings(self) -> int:
        return len(self.created_mapping_ids)

    @property
    def updated_mappings(self) -> int:
        return len(self.updated_mapping_ids)

    @property
    def created_edges(self) -> int:
        return len(self.created_edge_ids)

    @property
    def updated_edges(self) -> int:
        return len(self.updated_edge_ids)

    @property
    def removed_edges(self) -> int:
        return len(self.removed_edge_ids)


class KnowledgeGraphService:
    """Builds durable question-to-concept graph rows from extracted concept candidates."""

    def __init__(self, provider: ConceptExtractionProvider | None = None) -> None:
        self.provider = provider or TagBasedConceptExtractionProvider()

    def build_question_graph(self, question: Question) -> KnowledgeGraphSummary:
        if not isinstance(question, Question):
            raise KnowledgeGraphBuildError('question graph build requires a Question instance')
        if question.pk is None:
            raise KnowledgeGraphBuildError('question graph build requires a persisted Question')

        try:
            tags = list(question.tags.order_by('pk'))
            candidates = self._validated_unique_candidates(self.provider.extract(tags))
        except ConceptExtractionError as exc:
            raise KnowledgeGraphBuildError('concept extraction returned invalid candidates') from exc
        except Exception as exc:  # noqa: BLE001 - provider failures must be surfaced safely.
            raise KnowledgeGraphBuildError('concept extraction failed') from exc

        summary = KnowledgeGraphSummary(question_id=str(question.pk))

        try:
            with transaction.atomic():
                concept_ids_to_keep: set[int] = set()

                for candidate in candidates:
                    tag = self._tag_for_candidate(candidate, tags)
                    concept, concept_created = self._upsert_concept(candidate)
                    concept_ids_to_keep.add(concept.pk)
                    if concept_created:
                        summary.created_concept_ids.append(concept.pk)
                    elif self._sync_model_fields(
                        concept,
                        {
                            'name': candidate.name,
                            'source': candidate.source,
                            'provider': candidate.provider,
                            'confidence': candidate.confidence,
                        },
                    ):
                        summary.updated_concept_ids.append(concept.pk)

                    mapping = None
                    if tag is not None:
                        mapping, mapping_created = self._upsert_mapping(tag, concept, candidate)
                        if mapping_created:
                            summary.created_mapping_ids.append(mapping.pk)
                        elif self._sync_model_fields(
                            mapping,
                            {
                                'source': candidate.source,
                                'provider': candidate.provider,
                                'confidence': candidate.confidence,
                            },
                        ):
                            summary.updated_mapping_ids.append(mapping.pk)

                    edge, edge_created = self._upsert_edge(question, concept, tag, mapping, candidate)
                    if edge_created:
                        summary.created_edge_ids.append(edge.pk)
                    elif self._sync_model_fields(
                        edge,
                        {
                            'tag': tag,
                            'tag_mapping': mapping,
                            'source': candidate.source,
                            'provider': candidate.provider,
                            'confidence': candidate.confidence,
                        },
                    ):
                        summary.updated_edge_ids.append(edge.pk)

                stale_edges = QuestionConceptEdge.objects.filter(question=question)
                if concept_ids_to_keep:
                    stale_edges = stale_edges.exclude(concept_id__in=concept_ids_to_keep)
                stale_edge_ids = list(stale_edges.values_list('pk', flat=True))
                if stale_edge_ids:
                    stale_edges.delete()
                    summary.removed_edge_ids.extend(stale_edge_ids)

        except (DatabaseError, IntegrityError, ConceptExtractionError) as exc:
            raise KnowledgeGraphBuildError('question graph build failed and was rolled back') from exc

        return summary

    def _validated_unique_candidates(self, candidates: Iterable[ConceptCandidate]) -> list[ConceptCandidate]:
        candidates_by_slug: dict[str, ConceptCandidate] = {}
        for candidate in candidates:
            normalized = self._validate_candidate(candidate)
            candidates_by_slug.setdefault(normalized.slug, normalized)
        return [candidates_by_slug[slug] for slug in sorted(candidates_by_slug)]

    def _validate_candidate(self, candidate: ConceptCandidate) -> ConceptCandidate:
        if not isinstance(candidate, ConceptCandidate):
            raise ConceptExtractionError('provider candidates must be ConceptCandidate instances')
        return ConceptCandidate(
            name=candidate.name,
            slug=candidate.slug,
            source=candidate.source,
            provider=candidate.provider,
            confidence=candidate.confidence,
            originating_tag_id=candidate.originating_tag_id,
            originating_tag_name=candidate.originating_tag_name,
        )

    def _tag_for_candidate(self, candidate: ConceptCandidate, tags: list[Tag]) -> Tag | None:
        if candidate.originating_tag_id is None:
            return None
        for tag in tags:
            if tag.pk == candidate.originating_tag_id:
                return tag
        raise ConceptExtractionError('candidate references a tag outside the question')

    def _upsert_concept(self, candidate: ConceptCandidate) -> tuple[KnowledgeConcept, bool]:
        return KnowledgeConcept.objects.get_or_create(
            slug=candidate.slug,
            defaults={
                'name': candidate.name,
                'source': candidate.source,
                'provider': candidate.provider,
                'confidence': candidate.confidence,
            },
        )

    def _upsert_mapping(
        self,
        tag: Tag,
        concept: KnowledgeConcept,
        candidate: ConceptCandidate,
    ) -> tuple[ConceptTagMapping, bool]:
        return ConceptTagMapping.objects.get_or_create(
            tag=tag,
            concept=concept,
            defaults={
                'source': candidate.source,
                'provider': candidate.provider,
                'confidence': candidate.confidence,
            },
        )

    def _upsert_edge(
        self,
        question: Question,
        concept: KnowledgeConcept,
        tag: Tag | None,
        mapping: ConceptTagMapping | None,
        candidate: ConceptCandidate,
    ) -> tuple[QuestionConceptEdge, bool]:
        return QuestionConceptEdge.objects.get_or_create(
            question=question,
            concept=concept,
            defaults={
                'tag': tag,
                'tag_mapping': mapping,
                'source': candidate.source,
                'provider': candidate.provider,
                'confidence': candidate.confidence,
            },
        )

    def _sync_model_fields(self, instance, desired_values: dict[str, object]) -> bool:
        changed_fields: list[str] = []
        for field_name, desired_value in desired_values.items():
            current_value = getattr(instance, field_name)
            if isinstance(desired_value, Decimal):
                current_value = Decimal(str(current_value))
            if current_value != desired_value:
                setattr(instance, field_name, desired_value)
                changed_fields.append(field_name)

        if not changed_fields:
            return False

        instance.save(update_fields=[*changed_fields, 'updated_at'])
        return True


def build_question_graph(
    question: Question,
    provider: ConceptExtractionProvider | None = None,
) -> KnowledgeGraphSummary:
    return KnowledgeGraphService(provider=provider).build_question_graph(question)
