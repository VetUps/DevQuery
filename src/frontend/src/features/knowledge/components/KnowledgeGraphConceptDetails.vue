<script setup lang="ts">
import { computed } from 'vue'

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphRelatedQuestion,
  KnowledgeGraphState,
} from '@/features/knowledge/api/knowledgeGraph'

const props = defineProps<{
  selectedNode: KnowledgeGraphNode | null
  neighbourNodes: KnowledgeGraphNode[]
  neighbourEdges: KnowledgeGraphEdge[]
  graphState: KnowledgeGraphState
}>()

const stateLabel = computed(() => {
  const labels: Record<string, string> = {
    fresh: 'Граф актуален',
    stale: 'Граф устарел',
    rebuilding: 'Граф перестраивается',
    failed: 'Последнее перестроение не завершилось',
  }

  return labels[props.graphState.status] ?? 'Статус графа не распознан'
})

const stateDescription = computed(() => {
  if (props.graphState.status === 'stale') {
    return props.graphState.stale_reason
      ? `Причина устаревания: ${props.graphState.stale_reason}.`
      : 'Причина устаревания не указана.'
  }

  if (props.graphState.status === 'rebuilding') {
    return props.graphState.last_rebuild_started_at
      ? `Перестроение началось: ${formatDateTime(props.graphState.last_rebuild_started_at)}.`
      : 'Перестроение уже запущено; обновите вкладку позже.'
  }

  if (props.graphState.status === 'failed') {
    return props.graphState.last_failed_phase
      ? `Фаза сбоя: ${props.graphState.last_failed_phase}. Технические детали скрыты.`
      : 'Технические детали последнего сбоя скрыты.'
  }

  if (props.graphState.status === 'fresh') {
    return props.graphState.last_rebuild_finished_at
      ? `Последнее обновление: ${formatDateTime(props.graphState.last_rebuild_finished_at)}.`
      : 'Связи и веса готовы к просмотру.'
  }

  return 'Показываем доступные агрегированные данные без внутренних диагностик.'
})

const selectedRelatedQuestions = computed(() => props.selectedNode?.related_questions ?? [])
const selectedActivityBreakdown = computed(() => props.selectedNode?.activity_breakdown ?? [])
const safeNeighbourEdges = computed(() => props.neighbourEdges.filter((edge) => edge.shared_question_count > 0 || edge.related_questions.length > 0))

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

function relatedQuestionHref(question: KnowledgeGraphRelatedQuestion): string {
  return `/questions/${encodeURIComponent(question.question_id)}`
}

function relatedQuestionTitle(question: KnowledgeGraphRelatedQuestion): string {
  return question.title || 'Вопрос без названия'
}

function conceptNameById(conceptId: number): string {
  if (props.selectedNode?.concept_id === conceptId) {
    return props.selectedNode.name || props.selectedNode.slug || `Концепт ${conceptId}`
  }

  const neighbour = props.neighbourNodes.find((node) => node.concept_id === conceptId)

  return neighbour?.name || neighbour?.slug || `Концепт ${conceptId}`
}

function edgeCounterpartName(edge: KnowledgeGraphEdge): string {
  if (!props.selectedNode) {
    return 'Связанный концепт'
  }

  const counterpartId = edge.source_concept_id === props.selectedNode.concept_id
    ? edge.target_concept_id
    : edge.source_concept_id

  return conceptNameById(counterpartId)
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
</script>

<template>
  <section
    v-if="selectedNode"
    class="knowledge-details"
    data-testid="knowledge-graph-selected-details"
    aria-labelledby="knowledge-selected-concept-title"
  >
    <header class="knowledge-details__header">
      <div>
        <p class="knowledge-details__eyebrow">Выбранный концепт</p>
        <h3 id="knowledge-selected-concept-title">{{ selectedNode.name || selectedNode.slug }}</h3>
        <p class="knowledge-details__meta">
          {{ selectedNode.source || 'aggregate' }} · {{ selectedNode.provider || 'unknown' }} ·
          {{ selectedNode.source_count }} агрегированных сигналов
        </p>
      </div>
      <dl class="knowledge-details__metrics" aria-label="Метрики выбранного концепта">
        <div>
          <dt>Вес</dt>
          <dd>{{ formatWeight(selectedNode.total_weight) }}</dd>
        </div>
        <div>
          <dt>Уверенность</dt>
          <dd>{{ formatWeight(selectedNode.confidence) }}</dd>
        </div>
      </dl>
    </header>

    <div class="knowledge-details__grid">
      <section class="knowledge-details__block" aria-labelledby="knowledge-selected-activity-title">
        <h4 id="knowledge-selected-activity-title">Разбивка активности</h4>
        <ul v-if="selectedActivityBreakdown.length > 0" class="knowledge-details__list">
          <li v-for="entry in selectedActivityBreakdown" :key="entry.activity_type" class="knowledge-details__row">
            <span>{{ activityLabel(entry.activity_type) }}</span>
            <strong>{{ formatWeight(entry.total_weight) }}</strong>
            <small>{{ entry.source_count }} сигналов</small>
          </li>
        </ul>
        <p v-else class="knowledge-details__muted">Разбивка активности для концепта пока пустая.</p>
      </section>

      <section class="knowledge-details__block" aria-labelledby="knowledge-selected-questions-title">
        <h4 id="knowledge-selected-questions-title">Связанные вопросы</h4>
        <ul v-if="selectedRelatedQuestions.length > 0" class="knowledge-details__list">
          <li v-for="question in selectedRelatedQuestions" :key="question.question_id" class="knowledge-details__question">
            <a :href="relatedQuestionHref(question)">{{ relatedQuestionTitle(question) }}</a>
            <span>{{ question.status || 'status_unknown' }}</span>
          </li>
        </ul>
        <p v-else class="knowledge-details__muted">Связанных вопросов пока нет.</p>
      </section>
    </div>

    <section
      class="knowledge-details__block"
      data-testid="knowledge-graph-selected-neighbours"
      aria-labelledby="knowledge-selected-neighbours-title"
    >
      <h4 id="knowledge-selected-neighbours-title">Соседние концепты</h4>
      <ul v-if="neighbourNodes.length > 0" class="knowledge-details__pill-list">
        <li v-for="node in neighbourNodes" :key="node.concept_id">
          <span>{{ node.name || node.slug }}</span>
          <small>вес {{ formatWeight(node.total_weight) }}</small>
        </li>
      </ul>
      <p v-else class="knowledge-details__muted">У выбранного концепта пока нет соседей в топологии графа.</p>
    </section>

    <section class="knowledge-details__block" aria-labelledby="knowledge-shared-questions-title">
      <h4 id="knowledge-shared-questions-title">Почему эти концепты рядом</h4>
      <ul v-if="safeNeighbourEdges.length > 0" class="knowledge-details__list">
        <li v-for="edge in safeNeighbourEdges" :key="edge.id" class="knowledge-details__edge">
          <strong>{{ edgeCounterpartName(edge) }}</strong>
          <span>{{ edge.shared_question_count }} общих вопросов · вес {{ formatWeight(edge.weight) }}</span>
          <ul v-if="edge.related_questions.length > 0" class="knowledge-details__nested-list">
            <li v-for="question in edge.related_questions" :key="`${edge.id}-${question.question_id}`">
              <a :href="relatedQuestionHref(question)">{{ relatedQuestionTitle(question) }}</a>
            </li>
          </ul>
        </li>
      </ul>
      <p v-else class="knowledge-details__muted">Общие вопросы для соседей пока не найдены.</p>
    </section>

    <aside
      class="knowledge-details__state"
      data-testid="knowledge-graph-state-context"
      aria-labelledby="knowledge-graph-state-context-title"
    >
      <h4 id="knowledge-graph-state-context-title">Контекст состояния графа</h4>
      <p><strong>{{ stateLabel }}</strong></p>
      <p>{{ stateDescription }}</p>
    </aside>
  </section>

  <section
    v-else
    class="knowledge-details knowledge-details--empty"
    data-testid="knowledge-graph-selection-empty"
    aria-labelledby="knowledge-selection-empty-title"
  >
    <h3 id="knowledge-selection-empty-title">Выберите концепт на графе</h3>
    <p>
      Нажмите узел интерактивного графа, чтобы увидеть вес, активность, соседние концепты и безопасные связи с вопросами.
    </p>
    <aside
      class="knowledge-details__state"
      data-testid="knowledge-graph-state-context"
      aria-labelledby="knowledge-graph-state-context-title-empty"
    >
      <h4 id="knowledge-graph-state-context-title-empty">Контекст состояния графа</h4>
      <p><strong>{{ stateLabel }}</strong></p>
      <p>{{ stateDescription }}</p>
    </aside>
  </section>
</template>

<style scoped>
.knowledge-details {
  display: grid;
  gap: var(--space-lg);
}

.knowledge-details__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
  justify-content: space-between;
}

.knowledge-details__eyebrow,
.knowledge-details__meta,
.knowledge-details__muted,
.knowledge-details__state p,
.knowledge-details--empty p,
.knowledge-details h3,
.knowledge-details h4 {
  margin: 0;
}

.knowledge-details__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.knowledge-details h3 {
  margin-top: var(--space-xs);
  font-size: 24px;
}

.knowledge-details h4 {
  font-size: 16px;
}

.knowledge-details__meta,
.knowledge-details__muted,
.knowledge-details__question span,
.knowledge-details__pill-list small,
.knowledge-details__edge span,
.knowledge-details__state {
  color: var(--color-muted);
}

.knowledge-details__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  margin: 0;
}

.knowledge-details__metrics div {
  min-width: 110px;
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.56);
}

.knowledge-details__metrics dt {
  color: var(--color-muted);
  font-size: 13px;
}

.knowledge-details__metrics dd {
  margin: var(--space-xs) 0 0;
  color: var(--color-accent);
  font-size: 28px;
  font-weight: 800;
}

.knowledge-details__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.knowledge-details__block,
.knowledge-details__state {
  display: grid;
  gap: var(--space-sm);
}

.knowledge-details__list,
.knowledge-details__pill-list,
.knowledge-details__nested-list {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: 0;
  list-style: none;
}

.knowledge-details__row,
.knowledge-details__question,
.knowledge-details__edge {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-sm) 0;
  border-top: 1px solid rgb(207 198 180 / 0.58);
}

.knowledge-details__row {
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-md);
  align-items: center;
}

.knowledge-details__pill-list {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.knowledge-details__pill-list li,
.knowledge-details__state {
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.66);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.48);
}

.knowledge-details a {
  color: var(--color-accent);
  font-weight: 700;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.2em;
}

@media (width <= 720px) {
  .knowledge-details__row {
    grid-template-columns: 1fr;
  }
}
</style>
