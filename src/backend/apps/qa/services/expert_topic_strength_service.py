# Кратко: работает с подбором экспертов.
from __future__ import annotations

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Cast, Coalesce

from apps.knowledge.models import QuestionConceptEdge
from apps.qa.models import Question


class ExpertTopicStrengthService:
    """Готовит данные для ранжирования экспертов по силе темы."""

    @classmethod
    def build_candidate_annotations(cls, question: Question) -> dict:
        """Собирает данные кандидата annotations в нужный формат."""
        topic_ids = list(QuestionConceptEdge.objects.filter(question=question).values_list('concept_id', flat=True))

        if topic_ids:
            return {
                'topic_score': Coalesce(
                    Sum('concept_activities__weight_delta', filter=Q(concept_activities__concept_id__in=topic_ids)),
                    Value(0, output_field=DecimalField()),
                ),
                'topic_match_count': Count(
                    'concept_activities',
                    filter=Q(concept_activities__concept_id__in=topic_ids),
                    distinct=True,
                ),
            }

        tag_ids = list(question.tags.values_list('id', flat=True))
        if tag_ids:
            return {
                'topic_score': Cast(
                    Count('solution', filter=Q(solution__question__tags__id__in=tag_ids), distinct=True),
                    output_field=DecimalField(),
                ),
                'topic_match_count': Cast(
                    Count('solution__question__tags', filter=Q(solution__question__tags__id__in=tag_ids), distinct=True),
                    output_field=DecimalField(),
                ),
            }

        return {
            'topic_score': Value(0, output_field=DecimalField()),
            'topic_match_count': Value(0, output_field=DecimalField()),
        }
