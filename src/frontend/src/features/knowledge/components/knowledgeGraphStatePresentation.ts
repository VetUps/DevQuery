// Кратко: отвечает за часть интерфейса.
import type { KnowledgeGraphInsightConceptEntry } from '@/features/knowledge/api/knowledgeGraph'

export type KnowledgeGraphSemanticState = 'strong' | 'growing' | 'weak' | 'stale' | 'isolated' | 'unknown'

export type KnowledgeGraphConceptStateMetadata = Pick<
  KnowledgeGraphInsightConceptEntry,
  'semantic_state' | 'tone_token'
>

export type KnowledgeGraphConceptStateById = Record<string | number, KnowledgeGraphConceptStateMetadata | undefined>

export interface KnowledgeGraphStatePresentation {
  state: KnowledgeGraphSemanticState
  label: string
  description: string
  symbol: string
  classSuffix: KnowledgeGraphSemanticState
}

const PRESENTATION_BY_STATE: Record<KnowledgeGraphSemanticState, KnowledgeGraphStatePresentation> = {
  strong: {
    state: 'strong',
    label: 'Сильный',
    description: 'Уверенная зона знаний',
    symbol: '✓',
    classSuffix: 'strong',
  },
  growing: {
    state: 'growing',
    label: 'Растёт',
    description: 'Активно развивается',
    symbol: '↗',
    classSuffix: 'growing',
  },
  weak: {
    state: 'weak',
    label: 'Слабый',
    description: 'Нужна практика',
    symbol: '!',
    classSuffix: 'weak',
  },
  stale: {
    state: 'stale',
    label: 'Устаревает',
    description: 'Стоит освежить знания',
    symbol: '⏱',
    classSuffix: 'stale',
  },
  isolated: {
    state: 'isolated',
    label: 'Изолирован',
    description: 'Мало связей с другими темами',
    symbol: '◇',
    classSuffix: 'isolated',
  },
  unknown: {
    state: 'unknown',
    label: 'Без оценки',
    description: 'Состояние пока недоступно',
    symbol: '•',
    classSuffix: 'unknown',
  },
}

function isSemanticState(value: unknown): value is KnowledgeGraphSemanticState {
  return typeof value === 'string' && value in PRESENTATION_BY_STATE
}

export function resolveKnowledgeGraphStatePresentation(
  metadata: KnowledgeGraphConceptStateMetadata | undefined,
): KnowledgeGraphStatePresentation {
  if (!metadata || !isSemanticState(metadata.semantic_state)) {
    return PRESENTATION_BY_STATE.unknown
  }

  return PRESENTATION_BY_STATE[metadata.semantic_state]
}

export function getKnowledgeGraphConceptState(
  conceptStates: KnowledgeGraphConceptStateById,
  conceptId: number,
): KnowledgeGraphStatePresentation {
  return resolveKnowledgeGraphStatePresentation(conceptStates[conceptId] ?? conceptStates[String(conceptId)])
}
