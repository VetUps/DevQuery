<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { useRebuildKnowledgeGraphMutation } from '@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation'
import { useOwnKnowledgeGraphInsightsQuery } from '@/features/knowledge/queries/useKnowledgeGraphInsightsQuery'
import { useOwnKnowledgeGraphQuery, usePublicUserKnowledgeGraphQuery } from '@/features/knowledge/queries/useKnowledgeGraphQuery'
import type {
  KnowledgeGraphActivityBreakdownEntry,
  KnowledgeGraphConceptEntry,
  KnowledgeGraphInsightConceptEntry,
  KnowledgeGraphInsightRecommendation,
  KnowledgeGraphInsightRecommendationV2,
  KnowledgeGraphLayoutPosition,
  KnowledgeGraphRelatedQuestion,
  KnowledgeGraphSemanticDiagnostics,
  KnowledgeGraphSemanticEdge,
  KnowledgeGraphSemanticGraphMetadata,
  KnowledgeGraphSemanticGroup,
  UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import { useSaveKnowledgeGraphLayoutMutation, useResetKnowledgeGraphLayoutMutation } from '@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'
import KnowledgeGraphRenderer from './KnowledgeGraphRenderer.vue'
import KnowledgeGraphSemanticGroupsPanel from './KnowledgeGraphSemanticGroupsPanel.vue'
import KnowledgeGraphConceptDetails from './KnowledgeGraphConceptDetails.vue'
import {
  buildConceptQuestionDiscoveryRoute,
  buildRecommendationQuestionDiscoveryRoute,
  buildSafeQuestionDiscoveryRoute,
  type KnowledgeGraphQuestionDiscoveryRoute,
} from './knowledgeGraphQuestionDiscovery'
import type { KnowledgeGraphSemanticState, KnowledgeGraphConceptStateById } from './knowledgeGraphStatePresentation'
import { getKnowledgeGraphConceptState, resolveKnowledgeGraphStatePresentation, type KnowledgeGraphStatePresentation } from './knowledgeGraphStatePresentation'
import { resolveKnowledgeGraphRecommendationPresentation, type KnowledgeGraphRecommendationPresentation } from './knowledgeGraphRecommendationPresentation'
import type { KnowledgeGraphProjectionMode } from './knowledgeGraphSemanticProjection'

const STALE_COPY = 'Мы обнаружили расхождение между графом и вашей активностью. Перестройте граф.'
const SAFE_API_ERROR_COPY = 'Не удалось загрузить граф знаний. Попробуйте обновить вкладку.'
const SAFE_REBUILD_ERROR_COPY = 'Не удалось запустить перестроение графа. Попробуйте ещё раз позже.'
const SAFE_LAYOUT_ERROR_COPY = 'Не удалось сохранить расположение графа. Попробуйте ещё раз позже.'
const SAFE_INSIGHTS_ERROR_COPY = 'Состояния концептов временно недоступны. Показываем нейтральные статусы без технических деталей.'

type GraphStatus = 'fresh' | 'stale' | 'rebuilding' | 'failed'
type KnowledgeGraphViewMode = 'graph' | 'list'
type InsightFilterState = KnowledgeGraphSemanticState

interface KnowledgeRecommendationCard {
  id: string
  conceptId: number
  conceptName: string
  state: KnowledgeGraphStatePresentation
  recommendation: KnowledgeGraphInsightRecommendation | KnowledgeGraphInsightRecommendationV2
  presentation: KnowledgeGraphRecommendationPresentation
  discoveryRoute: KnowledgeGraphQuestionDiscoveryRoute | null
  rankLabel: string
  scoreLabel: string
  confidenceLabel: string
  targetSummary: string
  evidenceSummaries: string[]
}

const props = withDefaults(defineProps<{
  userId?: string
}>(), {
  userId: '',
})

const normalizedUserId = computed(() => props.userId.trim())
const isSelfProfile = computed(() => normalizedUserId.value.length === 0)
const graphQuery = normalizedUserId.value
  ? usePublicUserKnowledgeGraphQuery(normalizedUserId)
  : useOwnKnowledgeGraphQuery()
const rebuildMutation = useRebuildKnowledgeGraphMutation()
const saveLayoutMutation = useSaveKnowledgeGraphLayoutMutation()
const resetLayoutMutation = useResetKnowledgeGraphLayoutMutation()
const rebuildActionError = shallowRef('')
const layoutActionError = shallowRef('')
const draftLayoutPositions = shallowRef<Record<string, KnowledgeGraphLayoutPosition>>({})
const isLayoutDirty = shallowRef(false)
const selectedConceptId = shallowRef<number | null>(null)
const viewMode = shallowRef<KnowledgeGraphViewMode>('graph')
const insightSearchText = shallowRef('')
const activeStateFilters = shallowRef<InsightFilterState[]>([])
const showSemanticEdges = shallowRef(true)
const graphProjectionMode = shallowRef<KnowledgeGraphProjectionMode>('structural')

const graph = computed<UserKnowledgeGraphResponse | undefined>(() => graphQuery.data.value)
const hasGraph = computed(() => Boolean(graph.value))
const hasConcepts = computed(() => (graph.value?.concepts.length ?? 0) > 0)
const hasTopologyNodes = computed(() => (graph.value?.nodes.length ?? 0) > 0)
const isInitialLoading = computed(() => graphQuery.isPending.value && !hasGraph.value)
const isInitialError = computed(() => graphQuery.isError.value && !hasGraph.value)
const isStaleQueryError = computed(() => graphQuery.isError.value && hasGraph.value)
const isOwner = computed(() => Boolean(graph.value?.viewer.is_owner))
const insightsQuery = useOwnKnowledgeGraphInsightsQuery(computed(() => isSelfProfile.value && isOwner.value))
const canShowInsights = computed(() => isSelfProfile.value && isOwner.value)

const sortedConcepts = computed(() => {
  return [...(graph.value?.concepts ?? [])].sort((left, right) => {
    const byWeight = toNumber(right.total_weight) - toNumber(left.total_weight)

    if (byWeight !== 0) {
      return byWeight
    }

    return left.name.localeCompare(right.name, 'ru')
  })
})

const selectedConcept = computed(() => {
  if (selectedConceptId.value === null) {
    return null
  }

  return filteredNodes.value.find((node) => node.concept_id === selectedConceptId.value) ?? null
})

const neighbourEdges = computed(() => {
  if (!selectedConcept.value) {
    return []
  }

  return filteredEdges.value.filter((edge) => (
    edge.source_concept_id === selectedConcept.value?.concept_id
    || edge.target_concept_id === selectedConcept.value?.concept_id
  )) ?? []
})

const neighbourConceptIds = computed(() => {
  if (!selectedConcept.value) {
    return []
  }

  const selectedId = selectedConcept.value.concept_id
  const ids = new Set<number>()

  for (const edge of neighbourEdges.value) {
    ids.add(edge.source_concept_id === selectedId ? edge.target_concept_id : edge.source_concept_id)
  }

  return [...ids]
})

const neighbourEdgeIds = computed(() => neighbourEdges.value.map((edge) => edge.id))

const neighbourConcepts = computed(() => {
  const ids = new Set(neighbourConceptIds.value)

  return filteredNodes.value.filter((node) => ids.has(node.concept_id))
})

const normalizedStatus = computed<GraphStatus | 'unknown'>(() => {
  const status = graph.value?.state.status

  if (status === 'fresh' || status === 'stale' || status === 'rebuilding' || status === 'failed') {
    return status
  }

  return 'unknown'
})

const stateBanner = computed(() => {
  if (!graph.value) {
    return null
  }

  const state = graph.value.state

  if (isStaleQueryError.value) {
    return {
      tone: 'danger' as const,
      label: 'Ошибка обновления',
      title: 'Показываем последнюю сохранённую версию графа',
      description: SAFE_API_ERROR_COPY,
    }
  }

  if (normalizedStatus.value === 'stale') {
    return {
      tone: 'danger' as const,
      label: 'Граф устарел',
      title: 'Нужна синхронизация активности',
      description: `${STALE_COPY} Причина: ${state.stale_reason || 'не указана'}.`,
    }
  }

  if (normalizedStatus.value === 'rebuilding') {
    return {
      tone: 'default' as const,
      label: 'Перестроение',
      title: 'Граф знаний обновляется',
      description: state.last_rebuild_started_at
        ? `Мы уже пересчитываем веса и связи. Старт: ${formatDateTime(state.last_rebuild_started_at)}.`
        : 'Мы уже пересчитываем веса и связи. Обновите вкладку через минуту.',
    }
  }

  if (normalizedStatus.value === 'failed') {
    return {
      tone: 'danger' as const,
      label: 'Сбой перестроения',
      title: 'Последнее перестроение не завершилось',
      description: `Фаза: ${state.last_failed_phase || 'не указана'}. Технические детали скрыты для безопасности.`,
    }
  }

  if (normalizedStatus.value === 'unknown') {
    return {
      tone: 'default' as const,
      label: 'Статус графа',
      title: 'Статус графа пока не распознан',
      description: 'Показываем доступные агрегированные данные без технических деталей.',
    }
  }

  return {
    tone: 'default' as const,
    label: 'Граф актуален',
    title: 'Граф знаний синхронизирован',
    description: state.last_rebuild_finished_at
      ? `Последнее обновление: ${formatDateTime(state.last_rebuild_finished_at)}.`
      : 'Связи и веса готовы к просмотру.',
  }
})

const totalActivitySources = computed(() => {
  return graph.value?.activity_breakdown.reduce((sum, entry) => sum + entry.source_count, 0) ?? 0
})

const rebuildButtonLabel = computed(() => (
  rebuildMutation.isPending.value ? 'Перестраиваем…' : 'Перестроить граф'
))
const modeHelpCopy = computed(() => (
  viewMode.value === 'graph'
    ? 'Граф показывает связи между концептами. Список остаётся доступен как подробная fallback-панель.'
    : 'Список показывает активность, концепты и связанные вопросы без интерактивного графа.'
))
const isGraphMode = computed(() => viewMode.value === 'graph')
const isListMode = computed(() => viewMode.value === 'list')
const isStructuralProjectionMode = computed(() => effectiveGraphProjectionMode.value === 'structural')
const isSemanticProjectionMode = computed(() => effectiveGraphProjectionMode.value === 'semantic')
const hasListContent = computed(() => (graph.value?.activity_breakdown.length ?? 0) > 0 || hasConcepts.value)
const graphLayoutPositions = computed(() => (isLayoutDirty.value ? draftLayoutPositions.value : graph.value?.layout?.positions ?? {}))
const isLayoutSaving = computed(() => saveLayoutMutation.isPending.value)
const isLayoutResetting = computed(() => resetLayoutMutation.isPending.value)

const insightLegendStates: KnowledgeGraphSemanticState[] = ['strong', 'growing', 'weak', 'stale', 'isolated', 'unknown']
const stateFilterOptions = computed(() => insightLegendStates.map((state) => resolveKnowledgeGraphStatePresentation({ semantic_state: state, tone_token: state })))
const hasActiveFilters = computed(() => normalizedInsightSearch.value.length > 0 || activeStateFilters.value.length > 0)

const insightsByConceptId = computed<KnowledgeGraphConceptStateById>(() => {
  if (!canShowInsights.value || insightsQuery.isError.value) {
    return {}
  }

  const entries = insightsQuery.data.value?.concepts ?? []
  const map: KnowledgeGraphConceptStateById = {}

  for (const entry of entries) {
    map[entry.concept_id] = {
      semantic_state: entry.semantic_state,
      tone_token: entry.tone_token,
    }
  }

  return map
})

const normalizedInsightSearch = computed(() => normalizeFilterText(insightSearchText.value))
const filteredConcepts = computed(() => sortedConcepts.value.filter((concept) => isConceptVisible(concept)))
const filteredNodes = computed(() => {
  const nodes = graph.value?.nodes ?? []

  if (!hasActiveFilters.value) {
    return nodes
  }

  return nodes.filter((node) => isConceptVisible(node))
})
const visibleNodeIds = computed(() => new Set(filteredNodes.value.map((node) => node.concept_id)))
const filteredEdges = computed(() => {
  const edges = graph.value?.edges ?? []

  if (!hasActiveFilters.value) {
    return edges
  }

  return edges.filter((edge) => (
    visibleNodeIds.value.has(edge.source_concept_id) && visibleNodeIds.value.has(edge.target_concept_id)
  ))
})
const ownerSemanticEdges = computed<KnowledgeGraphSemanticEdge[]>(() => (
  canShowInsights.value ? graph.value?.semantic_edges ?? [] : []
))
const ownerSemanticGroups = computed<KnowledgeGraphSemanticGroup[]>(() => (
  canShowInsights.value ? graph.value?.semantic_groups ?? [] : []
))
const ownerSemanticGraph = computed<KnowledgeGraphSemanticGraphMetadata | undefined>(() => (
  canShowInsights.value ? graph.value?.semantic_graph : undefined
))
const ownerSemanticDiagnostics = computed<KnowledgeGraphSemanticDiagnostics | undefined>(() => (
  canShowInsights.value ? graph.value?.semantic : undefined
))
const visibleSemanticGroups = computed<KnowledgeGraphSemanticGroup[]>(() => ownerSemanticGroups.value.filter((group) => (
  group.members.some((member) => visibleNodeIds.value.has(member.concept_id))
)))
const visibleSemanticEdges = computed(() => ownerSemanticEdges.value.filter((edge) => (
  visibleNodeIds.value.has(edge.source_concept_id) && visibleNodeIds.value.has(edge.target_concept_id)
)))
const canShowSemanticEdges = computed(() => isOwner.value && visibleSemanticEdges.value.length > 0)
const effectiveShowSemanticEdges = computed(() => canShowSemanticEdges.value && showSemanticEdges.value)
const canShowSemanticProjection = computed(() => (
  canShowInsights.value
  && hasConcepts.value
  && Boolean(ownerSemanticGraph.value)
  && (visibleSemanticGroups.value.length > 0 || hasMeaningfulSemanticState(ownerSemanticGraph.value, ownerSemanticDiagnostics.value))
))
const effectiveGraphProjectionMode = computed<KnowledgeGraphProjectionMode>(() => (
  canShowSemanticProjection.value ? graphProjectionMode.value : 'structural'
))
const semanticProjectionHelpCopy = computed(() => {
  if (!canShowSemanticProjection.value) {
    return ''
  }

  const metadata = ownerSemanticGraph.value

  if (!metadata?.available) {
    return 'Семантическая проекция временно недоступна. Структурный граф остаётся основным режимом.'
  }

  if (metadata.status === 'degraded' || metadata.status === 'stale' || metadata.lifecycle_counts.stale > 0) {
    return 'Семантическая проекция доступна частично: показываем только безопасные агрегированные группы.'
  }

  return `Семантическая проекция доступна: ${visibleSemanticGroups.value.length} групп, ${metadata.visible_member_count} участников.`
})
const hasVisibleTopologyNodes = computed(() => filteredNodes.value.length > 0)
const hasVisibleConcepts = computed(() => filteredConcepts.value.length > 0)
const filterCountCopy = computed(() => filteredConcepts.value.length + ' из ' + (graph.value?.concepts.length ?? 0) + ' концептов')
const knowledgeRecommendations = computed<KnowledgeRecommendationCard[]>(() => {
  if (!canShowInsights.value || insightsQuery.isPending.value || insightsQuery.isError.value) {
    return []
  }

  const insights = insightsQuery.data.value

  if (!insights) {
    return []
  }

  if ((insights.recommendations?.length ?? 0) > 0) {
    return insights.recommendations.map((recommendation) => buildRecommendationV2Card(recommendation))
  }

  return insights.concepts.flatMap((concept) => {
    return concept.recommendations.map((recommendation) => buildRecommendationCard(concept, recommendation))
  })
})
const hasKnowledgeRecommendations = computed(() => knowledgeRecommendations.value.length > 0)
const recommendationCountCopy = computed(() => {
  const count = knowledgeRecommendations.value.length

  if (count === 1) {
    return '1 рекомендация'
  }

  if (count > 1 && count < 5) {
    return `${count} рекомендации`
  }

  return `${count} рекомендаций`
})
const recommendationsStatusCopy = computed(() => {
  if (insightsQuery.isError.value) {
    return 'Рекомендации временно недоступны. Граф и список остаются на экране.'
  }

  if (insightsQuery.isPending.value && !insightsQuery.data.value) {
    return 'Загружаем приватные рекомендации…'
  }

  if (!hasKnowledgeRecommendations.value) {
    return 'Новых рекомендаций по развитию пока нет.'
  }

  return `Доступно: ${recommendationCountCopy.value}.`
})
const insightsStatusCopy = computed(() => {
  if (!canShowInsights.value) {
    return ''
  }

  if (insightsQuery.isError.value) {
    return SAFE_INSIGHTS_ERROR_COPY
  }

  if (insightsQuery.isPending.value && !insightsQuery.data.value) {
    return 'Загружаем приватные состояния концептов…'
  }

  if (!hasKnowledgeRecommendations.value) {
    return 'Состояния концептов загружены. Новых рекомендаций пока нет.'
  }

  return `Состояния концептов загружены. ${recommendationCountCopy.value} готовы к просмотру.`
})

function buildRecommendationCard(
  concept: KnowledgeGraphInsightConceptEntry,
  recommendation: KnowledgeGraphInsightRecommendation,
): KnowledgeRecommendationCard {
  return {
    id: recommendation.id,
    conceptId: concept.concept_id,
    conceptName: concept.name,
    state: resolveKnowledgeGraphStatePresentation(concept),
    recommendation,
    presentation: resolveKnowledgeGraphRecommendationPresentation(recommendation),
    discoveryRoute: buildRecommendationQuestionDiscoveryRoute(recommendation.action, concept),
    rankLabel: 'Совместимая рекомендация',
    scoreLabel: 'Оценка недоступна',
    confidenceLabel: 'Уверенность недоступна',
    targetSummary: `Цель: ${concept.name}`,
    evidenceSummaries: [],
  }
}

function buildRecommendationV2Card(recommendation: KnowledgeGraphInsightRecommendationV2): KnowledgeRecommendationCard {
  const conceptState = insightsByConceptId.value[recommendation.target.concept.concept_id]
  const actionRoute = buildSafeQuestionDiscoveryRoute(recommendation.action.payload)
  const targetRoute = buildSafeQuestionDiscoveryRoute(recommendation.target.discovery)

  return {
    id: recommendation.id,
    conceptId: recommendation.target.concept.concept_id,
    conceptName: recommendation.target.concept.name,
    state: resolveKnowledgeGraphStatePresentation(conceptState ?? { semantic_state: 'unknown', tone_token: 'unknown' }),
    recommendation,
    presentation: resolveKnowledgeGraphRecommendationPresentation(recommendation),
    discoveryRoute: actionRoute ?? targetRoute,
    rankLabel: `Ранг ${recommendation.rank}`,
    scoreLabel: `Оценка ${formatRatio(recommendation.score)}`,
    confidenceLabel: `Уверенность ${formatRatio(recommendation.confidence)}`,
    targetSummary: recommendationTargetSummary(recommendation),
    evidenceSummaries: recommendation.evidence.slice(0, 4).map(formatRecommendationEvidence),
  }
}

function recommendationTargetSummary(recommendation: KnowledgeGraphInsightRecommendationV2): string {
  const parts = [`Цель: ${recommendation.target.concept.name}`]

  if (recommendation.target.group) {
    parts.push(`группа «${recommendation.target.group.label}»`)
  }

  if (recommendation.target.neighbours.length > 0) {
    parts.push(`соседи: ${recommendation.target.neighbours.map((neighbour) => neighbour.name).slice(0, 3).join(', ')}`)
  }

  return parts.join(' · ')
}

function formatRecommendationEvidence(entry: KnowledgeGraphInsightRecommendationV2['evidence'][number]): string {
  const value = entry.value === null ? 'нет данных' : String(entry.value)
  return `${entry.label}: ${value} · вес ${formatRatio(entry.weight)}`
}

function formatRatio(value: number): string {
  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

function conceptDiscoveryRoute(concept: KnowledgeGraphConceptEntry): KnowledgeGraphQuestionDiscoveryRoute | null {
  return buildConceptQuestionDiscoveryRoute(concept)
}

function normalizeFilterText(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU')
}

function conceptMatchesSearch(concept: KnowledgeGraphConceptEntry): boolean {
  if (!normalizedInsightSearch.value) {
    return true
  }

  const haystack = `${concept.name} ${concept.slug}`.toLocaleLowerCase('ru-RU')

  return haystack.includes(normalizedInsightSearch.value)
}

function conceptMatchesState(concept: KnowledgeGraphConceptEntry): boolean {
  if (activeStateFilters.value.length === 0) {
    return true
  }

  return activeStateFilters.value.includes(getKnowledgeGraphConceptState(insightsByConceptId.value, concept.concept_id).state)
}

function isConceptVisible(concept: KnowledgeGraphConceptEntry): boolean {
  return conceptMatchesSearch(concept) && conceptMatchesState(concept)
}

function toggleStateFilter(state: InsightFilterState): void {
  activeStateFilters.value = activeStateFilters.value.includes(state)
    ? activeStateFilters.value.filter((entry) => entry !== state)
    : [...activeStateFilters.value, state]
}

function isStateFilterActive(state: InsightFilterState): boolean {
  return activeStateFilters.value.includes(state)
}

function clearInsightFilters(): void {
  insightSearchText.value = ''
  activeStateFilters.value = []
}

function conceptStateLabel(conceptId: number): string {
  return getKnowledgeGraphConceptState(insightsByConceptId.value, conceptId).label
}

function conceptStateDescription(conceptId: number): string {
  return getKnowledgeGraphConceptState(insightsByConceptId.value, conceptId).description
}

function conceptStateSymbol(conceptId: number): string {
  return getKnowledgeGraphConceptState(insightsByConceptId.value, conceptId).symbol
}

function conceptStateClass(conceptId: number): string {
  return `knowledge-concept__state--${getKnowledgeGraphConceptState(insightsByConceptId.value, conceptId).classSuffix}`
}

function setViewMode(mode: KnowledgeGraphViewMode) {
  viewMode.value = mode
}

function setGraphProjectionMode(mode: KnowledgeGraphProjectionMode): void {
  graphProjectionMode.value = canShowSemanticProjection.value ? mode : 'structural'
}

function hasMeaningfulSemanticState(
  metadata: KnowledgeGraphSemanticGraphMetadata | undefined,
  diagnostics: KnowledgeGraphSemanticDiagnostics | undefined,
): boolean {
  if (!metadata) {
    return false
  }

  const safeMetadataSignal = metadata.available
    || metadata.enabled
    || metadata.status === 'degraded'
    || metadata.status === 'stale'
    || metadata.status === 'unavailable'
    || metadata.status === 'failed'
    || metadata.reason_code.trim().length > 0
    || metadata.phase.trim().length > 0

  const safeDiagnosticsSignal = Boolean(diagnostics) && (
    diagnostics.enabled
    || diagnostics.status !== 'pending'
    || diagnostics.reason_code.trim().length > 0
    || diagnostics.phase.trim().length > 0
  )

  return safeMetadataSignal || safeDiagnosticsSignal
}

function handleSemanticVisibilityChanged(visible: boolean) {
  showSemanticEdges.value = visible
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function formatWeight(value: string): string {
  return toNumber(value).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

function activityLabel(activityType: string): string {
  const labels: Record<string, string> = {
    authored_answer: 'Ответы',
    authored_question: 'Вопросы',
    accepted_answer: 'Принятые ответы',
    question_upvote: 'Оценки вопросов',
    answer_upvote: 'Оценки ответов',
    comment: 'Комментарии',
  }

  return labels[activityType] ?? activityType.replaceAll('_', ' ')
}

function sourceLabel(concept: KnowledgeGraphConceptEntry): string {
  if (concept.source === 'tag') {
    return 'Агрегированный тег'
  }

  if (concept.source === 'aggregate') {
    return 'Агрегированная активность'
  }

  return 'Агрегированный сигнал'
}

function relatedQuestionHref(question: KnowledgeGraphRelatedQuestion): string {
  return `/questions/${encodeURIComponent(question.question_id)}`
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function retryGraphLoad() {
  await graphQuery.refetch()
}

async function rebuildGraph() {
  rebuildActionError.value = ''

  try {
    await rebuildMutation.mutateAsync()
  } catch {
    rebuildActionError.value = SAFE_REBUILD_ERROR_COPY
  }
}

function handleLayoutChanged(positions: Record<string, KnowledgeGraphLayoutPosition>) {
  if (!isOwner.value) {
    return
  }

  layoutActionError.value = ''
  draftLayoutPositions.value = positions
  isLayoutDirty.value = true
}

async function saveGraphLayout() {
  if (!isOwner.value || !isLayoutDirty.value) {
    return
  }

  layoutActionError.value = ''

  try {
    await saveLayoutMutation.mutateAsync({
      schema_version: 1,
      positions: draftLayoutPositions.value,
    })
    isLayoutDirty.value = false
  } catch {
    layoutActionError.value = SAFE_LAYOUT_ERROR_COPY
  }
}

async function resetGraphLayout() {
  if (!isOwner.value || !isLayoutDirty.value) {
    return
  }

  layoutActionError.value = ''

  try {
    await resetLayoutMutation.mutateAsync()
    draftLayoutPositions.value = {}
    isLayoutDirty.value = false
  } catch {
    layoutActionError.value = SAFE_LAYOUT_ERROR_COPY
  }
}

function handleNodeSelected(conceptId: number) {
  const existsInTopology = filteredNodes.value.some((node) => node.concept_id === conceptId)

  selectedConceptId.value = existsInTopology ? conceptId : null
}

watch(
  () => `${graph.value?.user_id ?? ''}:${graph.value?.layout?.updated_at ?? ''}:${Object.keys(graph.value?.layout?.positions ?? {}).join('|')}`,
  () => {
    draftLayoutPositions.value = graph.value?.layout?.positions ?? {}
    isLayoutDirty.value = false
    layoutActionError.value = ''
  },
)

watch(
  () => `${graph.value?.user_id ?? ''}:${ownerSemanticEdges.value.length}`,
  () => {
    showSemanticEdges.value = ownerSemanticEdges.value.length > 0
  },
  { immediate: true },
)

watch(
  canShowSemanticProjection,
  (canShow) => {
    if (!canShow) {
      graphProjectionMode.value = 'structural'
    }
  },
  { immediate: true },
)

watch(
  () => filteredNodes.value.map((node) => node.concept_id).join('|'),
  () => {
    if (selectedConceptId.value === null) {
      return
    }

    const existsInTopology = filteredNodes.value.some((node) => node.concept_id === selectedConceptId.value)

    if (!existsInTopology) {
      selectedConceptId.value = null
    }
  },
)
</script>

<template>
  <section class="knowledge-tab" data-testid="knowledge-graph-tab">
    <InlineFeedbackPanel
      v-if="isInitialLoading"
      data-testid="knowledge-graph-loading"
      eyebrow="Граф знаний"
      title="Загружаем граф знаний"
      description="Собираем агрегированные веса концептов и связи с вопросами."
    />

    <InlineFeedbackPanel
      v-else-if="isInitialError"
      data-testid="knowledge-graph-error"
      tone="danger"
      eyebrow="Граф знаний"
      title="Не удалось загрузить граф знаний"
      :description="SAFE_API_ERROR_COPY"
      show-action
      action-label="Повторить загрузку"
      @action="retryGraphLoad"
    />

    <div v-else-if="graph" class="knowledge-tab__content">
      <SurfacePanel variant="accent" padding="xl">
        <div class="knowledge-tab__hero">
          <div>
            <p class="knowledge-tab__eyebrow">Граф знаний</p>
            <h2 class="knowledge-tab__title">Карта ваших сильных тем</h2>
            <p class="knowledge-tab__lead">
              Показываем только агрегированные концепты, веса активности и безопасные связи с вопросами.
            </p>
          </div>

          <div class="knowledge-tab__stats" aria-label="Сводка графа знаний">
            <span class="knowledge-tab__stat-value" data-testid="knowledge-total-weight">
              {{ formatWeight(graph.total_weight) }}
            </span>
            <span class="knowledge-tab__stat-label">общий вес</span>
            <span class="knowledge-tab__stat-note">
              {{ graph.concepts.length }} концептов · {{ totalActivitySources }} сигналов
            </span>
          </div>
        </div>

        <div class="knowledge-tab__actions">
          <AppButton
            v-if="isOwner"
            data-testid="knowledge-rebuild-button"
            variant="secondary"
            :disabled="rebuildMutation.isPending.value"
            @click="rebuildGraph"
          >
            {{ rebuildButtonLabel }}
          </AppButton>
          <p v-else class="knowledge-tab__readonly" data-testid="knowledge-public-readonly">
            Публичный просмотр: перестроение доступно только владельцу профиля.
          </p>
        </div>

        <p
          v-if="rebuildMutation.isPending.value"
          class="knowledge-tab__pending"
          data-testid="knowledge-rebuild-pending"
        >
          Перестроение запущено. Данные останутся на экране, пока сервер обновляет граф.
        </p>
        <p
          v-if="rebuildActionError"
          class="knowledge-tab__action-error"
          data-testid="knowledge-rebuild-error"
        >
          {{ rebuildActionError }}
        </p>

        <p
          v-if="layoutActionError"
          class="knowledge-tab__action-error"
          data-testid="knowledge-layout-error"
        >
          {{ layoutActionError }}
        </p>

        <div
          class="knowledge-tab__mode-switch"
          data-testid="knowledge-view-mode-switch"
          role="group"
          aria-label="Режим просмотра графа знаний"
        >
          <button
            type="button"
            class="knowledge-tab__mode-button"
            :class="{ 'knowledge-tab__mode-button--active': isGraphMode }"
            data-testid="knowledge-view-mode-graph"
            :aria-pressed="isGraphMode"
            @click="setViewMode('graph')"
          >
            Граф
          </button>
          <button
            type="button"
            class="knowledge-tab__mode-button"
            :class="{ 'knowledge-tab__mode-button--active': isListMode }"
            data-testid="knowledge-view-mode-list"
            :aria-pressed="isListMode"
            @click="setViewMode('list')"
          >
            Список
          </button>
        </div>
        <p class="knowledge-tab__mode-help" data-testid="knowledge-view-mode-help">
          {{ modeHelpCopy }}
        </p>

        <div
          v-if="canShowSemanticProjection"
          class="knowledge-tab__mode-switch knowledge-tab__mode-switch--projection"
          data-testid="profile-graph-projection-switch"
          role="group"
          aria-label="Проекция графа знаний"
        >
          <button
            type="button"
            class="knowledge-tab__mode-button"
            :class="{ 'knowledge-tab__mode-button--active': isStructuralProjectionMode }"
            data-testid="profile-graph-projection-structural"
            :aria-pressed="isStructuralProjectionMode"
            @click="setGraphProjectionMode('structural')"
          >
            Структурный
          </button>
          <button
            type="button"
            class="knowledge-tab__mode-button"
            :class="{ 'knowledge-tab__mode-button--active': isSemanticProjectionMode }"
            data-testid="profile-graph-projection-semantic"
            :aria-pressed="isSemanticProjectionMode"
            @click="setGraphProjectionMode('semantic')"
          >
            Семантический
          </button>
        </div>
        <p
          v-if="canShowSemanticProjection"
          class="knowledge-tab__mode-help"
          data-testid="profile-graph-projection-help"
          :data-status="ownerSemanticGraph?.status ?? ''"
          :data-reason="ownerSemanticGraph?.reason_code ?? ''"
          :data-phase="ownerSemanticGraph?.phase ?? ''"
        >
          {{ semanticProjectionHelpCopy }}
        </p>
      </SurfacePanel>

      <InlineFeedbackPanel
        v-if="stateBanner"
        data-testid="knowledge-state-banner"
        :tone="stateBanner.tone"
        :eyebrow="stateBanner.label"
        :title="stateBanner.title"
        :description="stateBanner.description"
      />

      <SurfacePanel v-if="canShowInsights && hasConcepts" class="knowledge-tab__insights" padding="lg">
        <div class="knowledge-tab__section-heading">
          <p class="knowledge-tab__eyebrow">Состояния концептов</p>
          <h3>Фильтры и легенда</h3>
        </div>
        <p class="knowledge-tab__insights-status" data-testid="knowledge-insights-status">
          {{ insightsStatusCopy }}
        </p>
        <div class="knowledge-tab__filters">
          <label class="knowledge-tab__search-label" for="knowledge-insights-search-input">
            Поиск по концептам
          </label>
          <input
            id="knowledge-insights-search-input"
            v-model="insightSearchText"
            class="knowledge-tab__search"
            data-testid="knowledge-insights-search"
            type="search"
            placeholder="Например, Django или vue"
            aria-describedby="knowledge-insights-filter-count"
          >
          <div class="knowledge-tab__state-filters" role="group" aria-label="Фильтр по состоянию концепта">
            <button
              v-for="state in stateFilterOptions"
              :key="state.state"
              type="button"
              class="knowledge-tab__state-filter"
              :class="{ 'knowledge-tab__state-filter--active': isStateFilterActive(state.state) }"
              :data-testid="`knowledge-insights-state-filter-${state.state}`"
              :aria-pressed="isStateFilterActive(state.state)"
              @click="toggleStateFilter(state.state)"
            >
              <span aria-hidden="true">{{ state.symbol }}</span>
              <span>{{ state.label }}</span>
            </button>
          </div>
          <div class="knowledge-tab__filter-summary">
            <p id="knowledge-insights-filter-count" data-testid="knowledge-insights-filter-count">
              Видно {{ filterCountCopy }}
            </p>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="knowledge-tab__clear-filters"
              data-testid="knowledge-insights-clear-filters"
              @click="clearInsightFilters"
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
        <ul class="knowledge-tab__legend" data-testid="knowledge-insights-legend" aria-label="Легенда состояний концептов">
          <li v-for="state in stateFilterOptions" :key="state.state" class="knowledge-tab__legend-item">
            <span class="knowledge-tab__legend-symbol" aria-hidden="true">{{ state.symbol }}</span>
            <span><strong>{{ state.label }}</strong> — {{ state.description }}</span>
          </li>
        </ul>
      </SurfacePanel>

      <SurfacePanel
        v-if="canShowInsights && hasConcepts"
        class="knowledge-tab__semantic-groups"
        padding="lg"
      >
        <KnowledgeGraphSemanticGroupsPanel
          :groups="visibleSemanticGroups"
          :concepts="graph.concepts"
          :visible-concept-ids="visibleNodeIds"
          :graph-status="normalizedStatus"
          :has-query-error="isStaleQueryError"
        />
      </SurfacePanel>

      <SurfacePanel
        v-if="canShowInsights && hasConcepts"
        class="knowledge-tab__recommendations"
        padding="lg"
        data-testid="knowledge-recommendations"
      >
        <div class="knowledge-tab__section-heading knowledge-tab__section-heading--dual">
          <div>
            <p class="knowledge-tab__eyebrow">Рекомендации развития</p>
            <h3>Следующие безопасные шаги</h3>
          </div>
          <span class="knowledge-tab__recommendation-count" data-testid="knowledge-recommendations-count">
            {{ recommendationCountCopy }}
          </span>
        </div>
        <p class="knowledge-tab__recommendations-status" data-testid="knowledge-recommendations-status">
          {{ recommendationsStatusCopy }}
        </p>

        <p
          v-if="!hasKnowledgeRecommendations"
          class="knowledge-concept__muted"
          data-testid="knowledge-recommendations-empty"
        >
          {{ recommendationsStatusCopy }}
        </p>

        <ul v-else class="knowledge-tab__recommendation-list" aria-label="Приватные рекомендации по развитию графа знаний">
          <li
            v-for="card in knowledgeRecommendations"
            :key="card.id"
            class="knowledge-tab__recommendation-card"
            :data-testid="`knowledge-recommendation-card-${card.id}`"
            :aria-label="`${card.rankLabel}: ${card.conceptName}. ${card.presentation.priorityLabel}`"
          >
            <header class="knowledge-tab__recommendation-header">
              <div>
                <p class="knowledge-tab__recommendation-rank" :data-testid="`knowledge-recommendation-rank-${card.id}`">
                  {{ card.rankLabel }} · {{ card.scoreLabel }} · {{ card.confidenceLabel }}
                </p>
                <p class="knowledge-tab__recommendation-concept">{{ card.conceptName }}</p>
                <p
                  class="knowledge-concept__state"
                  :class="`knowledge-concept__state--${card.state.classSuffix}`"
                >
                  <span aria-hidden="true">{{ card.state.symbol }}</span>
                  <strong>{{ card.state.label }}</strong>
                  <span>{{ card.state.description }}</span>
                </p>
              </div>
              <span class="knowledge-tab__recommendation-priority">{{ card.presentation.priorityLabel }}</span>
            </header>

            <div class="knowledge-tab__recommendation-body">
              <p class="knowledge-tab__recommendation-action">{{ card.presentation.actionLabel }}</p>
              <p>{{ card.recommendation.label }}</p>
              <p>{{ card.presentation.reasonDescription }}</p>
              <p class="knowledge-tab__recommendation-help">{{ card.presentation.actionDescription }}</p>
              <p class="knowledge-tab__recommendation-target" :data-testid="`knowledge-recommendation-target-${card.id}`">
                {{ card.targetSummary }}
              </p>
              <ul
                v-if="card.evidenceSummaries.length > 0"
                class="knowledge-tab__recommendation-evidence"
                :data-testid="`knowledge-recommendation-evidence-${card.id}`"
                aria-label="Агрегированные доказательства рекомендации"
              >
                <li v-for="summary in card.evidenceSummaries" :key="summary">{{ summary }}</li>
              </ul>
              <p
                v-else
                class="knowledge-tab__recommendation-help"
                :data-testid="`knowledge-recommendation-evidence-empty-${card.id}`"
              >
                Агрегированные доказательства недоступны для этой рекомендации.
              </p>
              <RouterLink
                v-if="card.discoveryRoute"
                class="knowledge-tab__discovery-link"
                :to="card.discoveryRoute"
                :data-testid="`knowledge-recommendation-action-${card.id}`"
              >
                Открыть вопросы
              </RouterLink>
              <p
                v-else
                class="knowledge-tab__recommendation-help"
                :data-testid="`knowledge-recommendation-action-unavailable-${card.id}`"
              >
                Безопасная ссылка на вопросы для этой рекомендации недоступна.
              </p>
            </div>
          </li>
        </ul>
      </SurfacePanel>

      <InlineFeedbackPanel
        v-if="!hasConcepts"
        data-testid="knowledge-graph-empty"
        eyebrow="Пустой граф"
        title="Концепты пока не найдены"
        description="Задавайте вопросы, отвечайте и получайте оценки — после активности граф покажет веса тем."
      />

      <div v-if="isGraphMode && hasTopologyNodes" class="knowledge-tab__mode-panel" data-testid="knowledge-graph-panel">
        <SurfacePanel data-testid="knowledge-graph-mode" padding="lg">
          <KnowledgeGraphRenderer
            :projection-mode="effectiveGraphProjectionMode"
            :nodes="filteredNodes"
            :edges="filteredEdges"
            :semantic-edges="visibleSemanticEdges"
            :semantic-groups="visibleSemanticGroups"
            :semantic-graph="ownerSemanticGraph"
            :semantic-diagnostics="ownerSemanticDiagnostics"
            :show-semantic-edges="effectiveShowSemanticEdges"
            :selected-concept-id="selectedConceptId"
            :neighbour-concept-ids="neighbourConceptIds"
            :neighbour-edge-ids="neighbourEdgeIds"
            :layout-positions="graphLayoutPositions"
            :concept-states="insightsByConceptId"
            :is-owner="isOwner"
            :is-layout-dirty="isLayoutDirty"
            :is-layout-saving="isLayoutSaving"
            :is-layout-resetting="isLayoutResetting"
            @node-selected="handleNodeSelected"
            @layout-changed="handleLayoutChanged"
            @layout-save-requested="saveGraphLayout"
            @layout-reset-requested="resetGraphLayout"
            @semantic-visibility-changed="handleSemanticVisibilityChanged"
          />
        </SurfacePanel>

        <SurfacePanel padding="lg">
          <KnowledgeGraphConceptDetails
            :selected-node="selectedConcept"
            :neighbour-nodes="neighbourConcepts"
            :neighbour-edges="neighbourEdges"
          />
        </SurfacePanel>
      </div>

      <div v-if="isListMode && hasListContent" class="knowledge-tab__mode-panel" data-testid="knowledge-list-panel">
        <SurfacePanel v-if="graph.activity_breakdown.length > 0" variant="muted" padding="lg">
          <div class="knowledge-tab__section-heading">
            <p class="knowledge-tab__eyebrow">Активность</p>
            <h3>Из чего складывается общий вес</h3>
          </div>
          <ul class="knowledge-tab__breakdown" data-testid="knowledge-activity-breakdown">
            <li v-for="entry in graph.activity_breakdown" :key="entry.activity_type" class="knowledge-tab__breakdown-row">
              <span>{{ activityLabel(entry.activity_type) }}</span>
              <strong>{{ formatWeight(entry.total_weight) }}</strong>
              <small>{{ entry.source_count }} сигналов</small>
            </li>
          </ul>
        </SurfacePanel>

        <p v-if="hasConcepts && !hasVisibleConcepts" class="knowledge-concept__muted" data-testid="knowledge-insights-empty-filter">По выбранным фильтрам концепты не найдены.</p>
        <div v-if="hasVisibleConcepts" class="knowledge-tab__concept-grid" data-testid="knowledge-concepts">
          <SurfacePanel
            v-for="concept in filteredConcepts"
            :key="concept.concept_id"
            class="knowledge-concept"
            padding="lg"
          >
            <header class="knowledge-concept__header">
              <div>
                <p class="knowledge-tab__eyebrow">{{ sourceLabel(concept) }}</p>
                <h3>{{ concept.name }}</h3>
              </div>
              <div class="knowledge-concept__weight">
                <span>{{ formatWeight(concept.total_weight) }}</span>
                <small>вес</small>
              </div>
            </header>

            <p
              v-if="canShowInsights"
              class="knowledge-concept__state"
              :class="conceptStateClass(concept.concept_id)"
              :data-testid="`knowledge-insights-concept-state-${concept.concept_id}`"
            >
              <span aria-hidden="true">{{ conceptStateSymbol(concept.concept_id) }}</span>
              <strong>{{ conceptStateLabel(concept.concept_id) }}</strong>
              <span>{{ conceptStateDescription(concept.concept_id) }}</span>
            </p>

            <p class="knowledge-concept__explanation">
              Уверенность {{ formatWeight(concept.confidence) }} · {{ concept.source_count }} агрегированных сигналов.
            </p>

            <RouterLink
              v-if="conceptDiscoveryRoute(concept)"
              class="knowledge-tab__discovery-link"
              :to="conceptDiscoveryRoute(concept)"
              :data-testid="`knowledge-concept-discovery-${concept.concept_id}`"
            >
              Открыть вопросы по концепту
            </RouterLink>

            <ul v-if="concept.activity_breakdown.length > 0" class="knowledge-tab__breakdown">
              <li
                v-for="entry in concept.activity_breakdown"
                :key="`${concept.concept_id}-${entry.activity_type}`"
                class="knowledge-tab__breakdown-row"
              >
                <span>{{ activityLabel(entry.activity_type) }}</span>
                <strong>{{ formatWeight(entry.total_weight) }}</strong>
                <small>{{ entry.source_count }} сигналов</small>
              </li>
            </ul>
            <p v-else class="knowledge-concept__muted">Разбивка активности для концепта пока пустая.</p>

            <div class="knowledge-concept__questions">
              <h4>Связанные вопросы</h4>
              <ul v-if="concept.related_questions.length > 0">
                <li v-for="question in concept.related_questions" :key="question.question_id">
                  <a :href="relatedQuestionHref(question)">{{ question.title || 'Вопрос без названия' }}</a>
                  <span>{{ question.status || 'status_unknown' }}</span>
                </li>
              </ul>
              <p v-else class="knowledge-concept__muted">Связанных вопросов пока нет.</p>
            </div>
          </SurfacePanel>
        </div>
      </div>
    </div>

    <InlineFeedbackPanel
      v-else
      data-testid="knowledge-graph-missing"
      eyebrow="Граф знаний"
      title="Данные графа недоступны"
      description="Сервер не вернул граф знаний. Попробуйте обновить вкладку позже."
      tone="danger"
    />
  </section>
</template>

<style scoped>
.knowledge-tab,
.knowledge-tab__content,
.knowledge-tab__mode-panel {
  display: grid;
  gap: var(--space-xl);
}


.knowledge-tab__section-heading--dual,
.knowledge-tab__recommendation-header {
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
}

.knowledge-tab__recommendations {
  border: 1px solid rgb(14 116 144 / 0.14);
}

.knowledge-tab__recommendations-status,
.knowledge-tab__recommendation-rank,
.knowledge-tab__recommendation-concept,
.knowledge-tab__recommendation-action,
.knowledge-tab__recommendation-target,
.knowledge-tab__recommendation-help {
  margin: 0;
}

.knowledge-tab__recommendation-count,
.knowledge-tab__recommendation-priority {
  display: inline-flex;
  align-items: center;
  width: max-content;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
}

.knowledge-tab__recommendation-count {
  padding: var(--space-xs) var(--space-sm);
}

.knowledge-tab__recommendation-priority {
  padding: 4px var(--space-sm);
}

.knowledge-tab__recommendation-list {
  display: grid;
  gap: var(--space-md);
  margin: var(--space-md) 0 0;
  padding: 0;
  list-style: none;
}

.knowledge-tab__recommendation-card {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid rgb(15 23 42 / 0.08);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.72);
}

.knowledge-tab__recommendation-concept {
  color: var(--color-text);
  font-weight: 800;
}

.knowledge-tab__recommendation-rank,
.knowledge-tab__recommendation-target {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 700;
}

.knowledge-tab__recommendation-evidence {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: var(--space-lg);
  color: var(--color-muted);
  font-size: 14px;
}

.knowledge-tab__recommendation-body {
  display: grid;
  gap: var(--space-xs);
  color: var(--color-muted);
  line-height: 1.6;
}

.knowledge-tab__recommendation-action {
  color: var(--color-text);
  font-weight: 800;
}

.knowledge-tab__discovery-link {
  display: inline-flex;
  width: max-content;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.2);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.76);
  color: var(--color-accent);
  font-weight: 800;
  text-decoration: none;
}

.knowledge-tab__discovery-link:hover,
.knowledge-tab__discovery-link:focus-visible {
  border-color: rgb(14 116 144 / 0.55);
  outline: 2px solid rgb(14 116 144 / 0.22);
  outline-offset: 2px;
}

.knowledge-tab__recommendation-help {
  color: var(--color-muted);
  font-size: 14px;
}

.knowledge-tab__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-xl);
  align-items: start;
}

.knowledge-tab__eyebrow,
.knowledge-tab__title,
.knowledge-tab__lead,
.knowledge-tab__readonly,
.knowledge-tab__pending,
.knowledge-tab__action-error,
.knowledge-concept__explanation,
.knowledge-concept__muted {
  margin: 0;
}

.knowledge-tab__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.knowledge-tab__title {
  margin-top: var(--space-xs);
  font-size: clamp(30px, 4vw, 48px);
  line-height: 1;
}

.knowledge-tab__lead {
  max-width: 66ch;
  margin-top: var(--space-md);
  color: var(--color-muted);
  line-height: 1.7;
}

.knowledge-tab__stats {
  display: grid;
  min-width: 170px;
  justify-items: end;
  padding: var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.52);
}

.knowledge-tab__stat-value {
  color: var(--color-accent);
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
}

.knowledge-tab__stat-label {
  font-weight: 700;
}

.knowledge-tab__stat-note,
.knowledge-tab__readonly,
.knowledge-tab__pending,
.knowledge-concept__muted {
  color: var(--color-muted);
}

.knowledge-tab__actions,
.knowledge-tab__mode-switch {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: center;
}

.knowledge-tab__mode-switch {
  gap: var(--space-sm);
}

.knowledge-tab__mode-button {
  min-height: 40px;
  padding: 0 var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.24);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.68);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.knowledge-tab__mode-button:hover,
.knowledge-tab__mode-button:focus-visible {
  border-color: var(--color-accent);
  outline: 2px solid rgb(14 116 144 / 0.22);
  outline-offset: 2px;
}

.knowledge-tab__mode-button--active {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: white;
}

.knowledge-tab__mode-help {
  max-width: 68ch;
  margin: 0;
  color: var(--color-muted);
}

.knowledge-tab__pending {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(14 116 144 / 0.08);
}

.knowledge-tab__action-error {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(255 247 244 / 0.82);
  color: #9a3412;
}

.knowledge-tab__section-heading h3,
.knowledge-concept h3,
.knowledge-concept h4 {
  margin: var(--space-xs) 0 0;
}

.knowledge-tab__breakdown,
.knowledge-concept__questions ul {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: 0;
  list-style: none;
}

.knowledge-tab__breakdown-row,
.knowledge-concept__questions li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-md);
  align-items: center;
  padding: var(--space-sm) 0;
  border-top: 1px solid rgb(207 198 180 / 0.58);
}

.knowledge-tab__breakdown-row small,
.knowledge-concept__questions span {
  color: var(--color-muted);
}

.knowledge-tab__concept-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.knowledge-concept__header {
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
}

.knowledge-concept__weight {
  display: grid;
  justify-items: end;
  color: var(--color-accent);
}

.knowledge-concept__weight span {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}

.knowledge-concept__questions {
  display: grid;
  gap: var(--space-sm);
}

.knowledge-concept__questions a {
  color: var(--color-accent);
  font-weight: 700;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.2em;
}


.knowledge-tab__insights,
.knowledge-tab__filters,
.knowledge-tab__legend {
  display: grid;
  gap: var(--space-md);
}

.knowledge-tab__insights-status,
.knowledge-tab__search-label,
.knowledge-tab__filter-summary p,
.knowledge-concept__state {
  margin: 0;
}

.knowledge-tab__insights-status,
.knowledge-tab__filter-summary {
  color: var(--color-muted);
}

.knowledge-tab__search {
  width: min(100%, 520px);
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.28);
  border-radius: var(--radius-md);
  background: white;
  color: var(--color-text);
  font: inherit;
}

.knowledge-tab__state-filters,
.knowledge-tab__filter-summary,
.knowledge-tab__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
}

.knowledge-tab__state-filter,
.knowledge-tab__clear-filters {
  min-height: 36px;
  padding: 0 var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.24);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.72);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.knowledge-tab__state-filter--active {
  border-color: var(--color-accent);
  background: rgb(14 116 144 / 0.12);
}

.knowledge-tab__legend {
  padding: 0;
  margin: 0;
  list-style: none;
}

.knowledge-tab__legend-item,
.knowledge-concept__state {
  display: inline-flex;
  gap: var(--space-xs);
  align-items: center;
}

.knowledge-tab__legend-symbol,
.knowledge-concept__state {
  padding: var(--space-xs) var(--space-sm);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.08);
}

.knowledge-concept__state--strong { background: rgb(22 163 74 / 0.12); }
.knowledge-concept__state--growing { background: rgb(14 165 233 / 0.12); }
.knowledge-concept__state--weak { background: rgb(245 158 11 / 0.14); }
.knowledge-concept__state--stale { background: rgb(168 85 247 / 0.12); }
.knowledge-concept__state--isolated { background: rgb(100 116 139 / 0.12); }
.knowledge-concept__state--unknown { background: rgb(148 163 184 / 0.14); }

@media (width <= 720px) {
  .knowledge-tab__hero,
  .knowledge-tab__breakdown-row,
  .knowledge-concept__questions li {
    grid-template-columns: 1fr;
  }

  .knowledge-tab__stats {
    justify-items: start;
  }
}
</style>
