// Кратко: отвечает за часть интерфейса.
import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router'

import type {
  KnowledgeGraphConceptEntry,
  KnowledgeGraphInsightAction,
  KnowledgeGraphInsightConceptEntry,
  KnowledgeGraphSafeActionPayload,
} from '@/features/knowledge/api/knowledgeGraph'
import type { QuestionOrdering } from '@/features/questions/api/questions'

const DISCOVERY_ROUTE_NAME = 'home'
const DEFAULT_QUESTION_ORDERING: QuestionOrdering = '-question_created_at'
const ASCENDING_QUESTION_ORDERING: QuestionOrdering = 'question_created_at'
const DISCOVERY_QUERY_KEYS = ['tag', 'search', 'ordering', 'page'] as const

export type QuestionDiscoveryQueryKey = (typeof DISCOVERY_QUERY_KEYS)[number]
export type KnowledgeGraphQuestionDiscoveryRoute = RouteLocationRaw & {
  name: typeof DISCOVERY_ROUTE_NAME
  query: Partial<Record<QuestionDiscoveryQueryKey, string | string[]>>
}

export type KnowledgeGraphDiscoveryConcept = Pick<
  KnowledgeGraphConceptEntry | KnowledgeGraphInsightConceptEntry,
  'slug' | 'name'
>

type SafeDiscoveryQuery = {
  tags: string[]
  search: string
  ordering: QuestionOrdering
  page: number
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTag(value: unknown): string {
  return normalizeString(value).toLowerCase()
}

function normalizeTags(value: unknown): string[] {
  const rawTags = Array.isArray(value) ? value : [value]
  const normalizedTags = rawTags
    .map((tag) => normalizeTag(tag))
    .filter((tag) => tag.length > 0)

  return [...new Set(normalizedTags)]
}

function normalizeOrdering(value: unknown): QuestionOrdering {
  return value === ASCENDING_QUESTION_ORDERING ? ASCENDING_QUESTION_ORDERING : DEFAULT_QUESTION_ORDERING
}

function normalizePage(value: unknown): number {
  if (typeof value !== 'string') {
    return 1
  }

  const parsedPage = Number.parseInt(value.trim(), 10)

  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage
}

function buildRouteFromSafeQuery(query: SafeDiscoveryQuery): KnowledgeGraphQuestionDiscoveryRoute | null {
  const routeQuery: LocationQueryRaw = {}

  if (query.tags.length > 0) {
    routeQuery.tag = query.tags
  }

  if (query.search) {
    routeQuery.search = query.search
  }

  if (query.ordering === ASCENDING_QUESTION_ORDERING) {
    routeQuery.ordering = query.ordering
  }

  if (query.page > 1) {
    routeQuery.page = String(query.page)
  }

  if (Object.keys(routeQuery).length === 0) {
    return null
  }

  return {
    name: DISCOVERY_ROUTE_NAME,
    query: routeQuery,
  } as KnowledgeGraphQuestionDiscoveryRoute
}

function conceptToSafeQuery(concept: KnowledgeGraphDiscoveryConcept): SafeDiscoveryQuery | null {
  const tags = normalizeTags(concept.slug)
  const search = tags.length === 0 ? normalizeString(concept.name) : ''

  if (tags.length === 0 && !search) {
    return null
  }

  return {
    tags,
    search,
    ordering: DEFAULT_QUESTION_ORDERING,
    page: 1,
  }
}

export function buildConceptQuestionDiscoveryRoute(
  concept: KnowledgeGraphDiscoveryConcept,
): KnowledgeGraphQuestionDiscoveryRoute | null {
  const query = conceptToSafeQuery(concept)

  return query ? buildRouteFromSafeQuery(query) : null
}

function actionPayloadToSafeQuery(payload: KnowledgeGraphSafeActionPayload): SafeDiscoveryQuery {
  const search = normalizeString(payload.search) || normalizeString(payload.query)

  return {
    tags: normalizeTags(payload.tag),
    search,
    ordering: normalizeOrdering(payload.order),
    page: normalizePage(payload.page),
  }
}

export function buildSafeQuestionDiscoveryRoute(
  payload: KnowledgeGraphSafeActionPayload | null | undefined,
): KnowledgeGraphQuestionDiscoveryRoute | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  return buildRouteFromSafeQuery(actionPayloadToSafeQuery(payload))
}

export function buildRecommendationQuestionDiscoveryRoute(
  action: KnowledgeGraphInsightAction | null | undefined,
  concept?: KnowledgeGraphDiscoveryConcept | null,
): KnowledgeGraphQuestionDiscoveryRoute | null {
  if (!action || !action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
    return concept ? buildConceptQuestionDiscoveryRoute(concept) : null
  }

  const actionRoute = buildRouteFromSafeQuery(actionPayloadToSafeQuery(action.payload))

  if (actionRoute) {
    return actionRoute
  }

  return concept ? buildConceptQuestionDiscoveryRoute(concept) : null
}

export function getQuestionDiscoveryQueryKeys(): readonly QuestionDiscoveryQueryKey[] {
  return DISCOVERY_QUERY_KEYS
}
