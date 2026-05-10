from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from apps.knowledge.services.graph_service import (
    KnowledgeGraphService,
    KnowledgeGraphSummary,
)
from apps.qa.models import Question


@dataclass(frozen=True)
class StructuralGraphRebuildSummary:
    """Aggregate, redaction-safe summary for structural question graph rebuilds."""

    processed_questions: int = 0
    question_summaries: list[KnowledgeGraphSummary] = field(default_factory=list)
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

    @classmethod
    def from_question_summaries(
        cls,
        question_summaries: Iterable[KnowledgeGraphSummary],
    ) -> StructuralGraphRebuildSummary:
        summaries = list(question_summaries)
        return cls(
            processed_questions=len(summaries),
            question_summaries=summaries,
            created_concept_ids=[pk for summary in summaries for pk in summary.created_concept_ids],
            updated_concept_ids=[pk for summary in summaries for pk in summary.updated_concept_ids],
            created_mapping_ids=[pk for summary in summaries for pk in summary.created_mapping_ids],
            updated_mapping_ids=[pk for summary in summaries for pk in summary.updated_mapping_ids],
            created_edge_ids=[pk for summary in summaries for pk in summary.created_edge_ids],
            updated_edge_ids=[pk for summary in summaries for pk in summary.updated_edge_ids],
            removed_edge_ids=[pk for summary in summaries for pk in summary.removed_edge_ids],
        )

    def as_stdout_fields(self) -> dict[str, int]:
        return {
            'processed': self.processed_questions,
            'created_concepts': self.created_concepts,
            'updated_concepts': self.updated_concepts,
            'created_mappings': self.created_mappings,
            'updated_mappings': self.updated_mappings,
            'created_edges': self.created_edges,
            'updated_edges': self.updated_edges,
            'removed_edges': self.removed_edges,
        }


def sync_question_graph(
    question: Question,
    *,
    graph_service: KnowledgeGraphService | None = None,
) -> KnowledgeGraphSummary:
    """Synchronously rebuild one question's durable concept edges."""

    service = graph_service or KnowledgeGraphService()
    return service.build_question_graph(question)


def rebuild_structural_graph(
    queryset: Iterable[Question] | None = None,
    *,
    graph_service: KnowledgeGraphService | None = None,
) -> StructuralGraphRebuildSummary:
    """Synchronously rebuild durable concept structure for an iterable of questions."""

    questions = queryset if queryset is not None else Question.objects.all().order_by('pk')
    service = graph_service or KnowledgeGraphService()
    question_iterable = questions.iterator() if hasattr(questions, 'iterator') else iter(questions)
    summaries = [sync_question_graph(question, graph_service=service) for question in question_iterable]
    return StructuralGraphRebuildSummary.from_question_summaries(summaries)
