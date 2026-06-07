// Кратко: отвечает за часть интерфейса.
import type {
  KnowledgeGraphInsightRecommendation,
  KnowledgeGraphInsightRecommendationV2,
  KnowledgeGraphRecommendationActionType,
} from '@/features/knowledge/api/knowledgeGraph'

export type KnowledgeGraphRecommendationPriority = 'high' | 'medium' | 'low' | 'unknown'

export interface KnowledgeGraphRecommendationPresentation {
  actionType: KnowledgeGraphRecommendationActionType | 'unknown'
  actionLabel: string
  actionDescription: string
  priority: KnowledgeGraphRecommendationPriority
  priorityLabel: string
  reasonCode: string
  reasonDescription: string
}

const ACTION_PRESENTATION: Record<
  KnowledgeGraphRecommendationActionType,
  Pick<KnowledgeGraphRecommendationPresentation, 'actionLabel' | 'actionDescription'>
> = {
  review_related_questions: {
    actionLabel: 'Разобрать связанные вопросы',
    actionDescription: 'Откройте похожие вопросы, чтобы закрепить тему через практические примеры.',
  },
  answer_question: {
    actionLabel: 'Ответить на вопрос',
    actionDescription: 'Поддержите текущий прогресс: выберите вопрос по теме и попробуйте дать ответ.',
  },
  practice_foundation: {
    actionLabel: 'Поддержать базу знаний',
    actionDescription: 'Тема уже сильная — периодически возвращайтесь к ней, чтобы не терять уверенность.',
  },
  refresh_stale: {
    actionLabel: 'Освежить знания',
    actionDescription: 'Давно не было активности по теме: проверьте актуальные вопросы и обновите понимание.',
  },
  connect_concept: {
    actionLabel: 'Связать тему с графом',
    actionDescription: 'Найдите соседние темы и вопросы, чтобы сделать эту область менее изолированной.',
  },
}

const PRIORITY_LABELS: Record<KnowledgeGraphRecommendationPriority, string> = {
  high: 'Высокий приоритет',
  medium: 'Средний приоритет',
  low: 'Низкий приоритет',
  unknown: 'Приоритет не указан',
}

const REASON_DESCRIPTIONS: Record<string, string> = {
  weak_concept_needs_practice: 'Тема выглядит слабой и требует дополнительной практики.',
  stale_concept_needs_refresh: 'Знания по теме могли устареть из-за давнего отсутствия активности.',
  isolated_concept_needs_connections: 'Тема почти не связана с другими областями вашего графа.',
  growing_concept_has_momentum: 'По теме есть положительная динамика — её стоит развить.',
  strong_concept_maintenance: 'Тема уже сильная, рекомендация помогает сохранить уровень.',
  semantic_neighbour_suggests_bridge: 'Семантические связи показывают безопасный мост к соседним темам.',
}

function normalizePriority(value: string): KnowledgeGraphRecommendationPriority {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }

  return 'unknown'
}

export function resolveKnowledgeGraphRecommendationPresentation(
  recommendation: Pick<KnowledgeGraphInsightRecommendation | KnowledgeGraphInsightRecommendationV2, 'action' | 'priority' | 'reason_code'>,
): KnowledgeGraphRecommendationPresentation {
  const actionPresentation = ACTION_PRESENTATION[recommendation.action.type] ?? {
    actionLabel: 'Рекомендация по развитию',
    actionDescription: 'Безопасное описание рекомендации временно недоступно.',
  }
  const priority = normalizePriority(recommendation.priority)

  return {
    actionType: recommendation.action.type ?? 'unknown',
    ...actionPresentation,
    priority,
    priorityLabel: PRIORITY_LABELS[priority],
    reasonCode: recommendation.reason_code,
    reasonDescription:
      REASON_DESCRIPTIONS[recommendation.reason_code] ?? 'Причина рекомендации будет уточнена после обновления графа.',
  }
}
