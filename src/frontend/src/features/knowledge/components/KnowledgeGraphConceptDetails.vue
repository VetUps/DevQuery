<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphRelatedQuestion,
} from '@/features/knowledge/api/knowledgeGraph'
import { buildConceptQuestionDiscoveryRoute } from './knowledgeGraphQuestionDiscovery'

const props = defineProps<{
  selectedNode: KnowledgeGraphNode | null
  neighbourNodes: KnowledgeGraphNode[]
  neighbourEdges: KnowledgeGraphEdge[]
}>()

const isQuestionsModalOpen = shallowRef(false)
const activeQuestionIndex = shallowRef(0)
const selectedNeighbourId = shallowRef<number | null>(null)

const selectedRelatedQuestions = computed(() => props.selectedNode?.related_questions ?? [])
const selectedActivityBreakdown = computed(() => props.selectedNode?.activity_breakdown ?? [])
const selectedDiscoveryRoute = computed(() => (
  props.selectedNode ? buildConceptQuestionDiscoveryRoute(props.selectedNode) : null
))
const selectedNeighbourEdge = computed(() => {
  if (!props.selectedNode || selectedNeighbourId.value === null) {
    return null
  }

  const selectedId = props.selectedNode.concept_id
  const neighbourId = selectedNeighbourId.value

  return props.neighbourEdges.find((edge) => (
    (edge.source_concept_id === selectedId && edge.target_concept_id === neighbourId)
    || (edge.target_concept_id === selectedId && edge.source_concept_id === neighbourId)
  )) ?? null
})
const selectedNeighbourNode = computed(() => {
  if (selectedNeighbourId.value === null) {
    return null
  }

  return props.neighbourNodes.find((node) => node.concept_id === selectedNeighbourId.value) ?? null
})
const selectedEdgeQuestions = computed(() => selectedNeighbourEdge.value?.related_questions ?? [])
const activeRelatedQuestion = computed(() => selectedRelatedQuestions.value[activeQuestionIndex.value] ?? null)
const canNavigateRelatedQuestions = computed(() => selectedRelatedQuestions.value.length > 1)

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

function conceptDisplayName(node: KnowledgeGraphNode): string {
  return node.name || node.slug || `Концепт ${node.concept_id}`
}

function isNeighbourSelected(conceptId: number): boolean {
  return selectedNeighbourId.value === conceptId
}

function selectNeighbour(conceptId: number): void {
  selectedNeighbourId.value = isNeighbourSelected(conceptId) ? null : conceptId
}

function openRelatedQuestionsModal(): void {
  if (selectedRelatedQuestions.value.length === 0) {
    return
  }

  activeQuestionIndex.value = 0
  isQuestionsModalOpen.value = true
}

function closeRelatedQuestionsModal(): void {
  isQuestionsModalOpen.value = false
}

function showPreviousQuestion(): void {
  if (selectedRelatedQuestions.value.length === 0) {
    return
  }

  activeQuestionIndex.value = activeQuestionIndex.value === 0
    ? selectedRelatedQuestions.value.length - 1
    : activeQuestionIndex.value - 1
}

function showNextQuestion(): void {
  if (selectedRelatedQuestions.value.length === 0) {
    return
  }

  activeQuestionIndex.value = activeQuestionIndex.value === selectedRelatedQuestions.value.length - 1
    ? 0
    : activeQuestionIndex.value + 1
}

watch(
  () => props.selectedNode?.concept_id ?? null,
  () => {
    selectedNeighbourId.value = null
    closeRelatedQuestionsModal()
  },
)

watch(
  () => props.neighbourNodes.map((node) => node.concept_id).join('|'),
  () => {
    if (selectedNeighbourId.value === null) {
      return
    }

    const stillVisible = props.neighbourNodes.some((node) => node.concept_id === selectedNeighbourId.value)

    if (!stillVisible) {
      selectedNeighbourId.value = null
    }
  },
)
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

      <section class="knowledge-details__block knowledge-details__questions-card" aria-labelledby="knowledge-selected-questions-title">
        <div>
          <h4 id="knowledge-selected-questions-title">Связанные вопросы</h4>
          <p class="knowledge-details__muted">{{ selectedRelatedQuestions.length }} вопросов доступны</p>
        </div>
        <div class="knowledge-details__actions">
          <RouterLink
            v-if="selectedDiscoveryRoute"
            class="knowledge-details__action knowledge-details__discovery-link"
            :to="selectedDiscoveryRoute"
            data-testid="knowledge-selected-concept-discovery"
          >
            Открыть вопросы по концепту
          </RouterLink>
          <button
            class="knowledge-details__action"
            type="button"
            data-testid="knowledge-related-questions-open"
            :disabled="selectedRelatedQuestions.length === 0"
            @click="openRelatedQuestionsModal"
          >
            Связанные вопросы
          </button>
        </div>
      </section>
    </div>

    <section
      class="knowledge-details__block"
      data-testid="knowledge-graph-selected-neighbours"
      aria-labelledby="knowledge-selected-neighbours-title"
    >
      <div class="knowledge-details__section-heading">
        <h4 id="knowledge-selected-neighbours-title">Соседние концепты</h4>
        <p class="knowledge-details__muted">Выберите соседний концепт, чтобы увидеть вопросы, объясняющие связь.</p>
      </div>
      <ul v-if="neighbourNodes.length > 0" class="knowledge-details__neighbour-list">
        <li v-for="node in neighbourNodes" :key="node.concept_id">
          <button
            class="knowledge-details__neighbour-option"
            :class="{ 'knowledge-details__neighbour-option--selected': isNeighbourSelected(node.concept_id) }"
            type="button"
            :data-testid="`knowledge-neighbour-option-${node.concept_id}`"
            :aria-pressed="isNeighbourSelected(node.concept_id)"
            @click="selectNeighbour(node.concept_id)"
          >
            <span>{{ conceptDisplayName(node) }}</span>
            <small>вес {{ formatWeight(node.total_weight) }}</small>
          </button>
        </li>
      </ul>
      <p v-else class="knowledge-details__muted">У выбранного концепта пока нет соседей в топологии графа.</p>
    </section>

    <section class="knowledge-details__block" data-testid="knowledge-selected-edge-explanation" aria-labelledby="knowledge-shared-questions-title">
      <h4 id="knowledge-shared-questions-title">Почему эти концепты рядом</h4>
      <div v-if="selectedNeighbourEdge && selectedNeighbourNode" class="knowledge-details__edge-card">
        <strong>{{ conceptDisplayName(selectedNode) }} ↔ {{ conceptDisplayName(selectedNeighbourNode) }}</strong>
        <span>
          {{ selectedNeighbourEdge.shared_question_count }} общих вопросов · вес {{ formatWeight(selectedNeighbourEdge.weight) }}
        </span>
        <ul v-if="selectedEdgeQuestions.length > 0" class="knowledge-details__list">
          <li v-for="question in selectedEdgeQuestions" :key="`${selectedNeighbourEdge.id}-${question.question_id}`" class="knowledge-details__question">
            <a :href="relatedQuestionHref(question)">{{ relatedQuestionTitle(question) }}</a>
            <span>{{ question.status || 'status_unknown' }}</span>
          </li>
        </ul>
        <p v-else class="knowledge-details__muted">Для этой связи пока нет вопросов, которые можно безопасно показать.</p>
      </div>
      <p v-else-if="neighbourNodes.length > 0" class="knowledge-details__muted">
        Нажмите соседний концепт выше — здесь появятся только вопросы выбранной связи.
      </p>
      <p v-else class="knowledge-details__muted">Общие вопросы для соседей пока не найдены.</p>
    </section>

    <div
      v-if="isQuestionsModalOpen"
      class="knowledge-details__modal-backdrop"
      data-testid="knowledge-related-questions-modal"
      role="presentation"
      @click.self="closeRelatedQuestionsModal"
    >
      <section
        class="knowledge-details__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-related-questions-modal-title"
      >
        <header class="knowledge-details__modal-header">
          <div>
            <p class="knowledge-details__eyebrow">Связанные вопросы</p>
            <h3 id="knowledge-related-questions-modal-title">{{ conceptDisplayName(selectedNode) }}</h3>
            <p class="knowledge-details__muted">
              {{ activeQuestionIndex + 1 }} из {{ selectedRelatedQuestions.length }}
            </p>
          </div>
          <button
            class="knowledge-details__modal-close"
            type="button"
            data-testid="knowledge-related-questions-close"
            aria-label="Закрыть связанные вопросы"
            @click="closeRelatedQuestionsModal"
          >
            ×
          </button>
        </header>

        <article v-if="activeRelatedQuestion" class="knowledge-details__modal-question">
          <a :href="relatedQuestionHref(activeRelatedQuestion)">
            {{ relatedQuestionTitle(activeRelatedQuestion) }}
          </a>
          <span>{{ activeRelatedQuestion.status || 'status_unknown' }}</span>
        </article>

        <div v-if="canNavigateRelatedQuestions" class="knowledge-details__modal-nav" aria-label="Навигация по связанным вопросам">
          <button type="button" data-testid="knowledge-related-questions-prev" @click="showPreviousQuestion">
            Назад
          </button>
          <button type="button" data-testid="knowledge-related-questions-next" @click="showNextQuestion">
            Вперёд
          </button>
        </div>

        <ul class="knowledge-details__modal-list" aria-label="Все связанные вопросы концепта">
          <li v-for="(question, index) in selectedRelatedQuestions" :key="question.question_id">
            <button
              type="button"
              :class="{ 'knowledge-details__modal-list-button--active': index === activeQuestionIndex }"
              @click="activeQuestionIndex = index"
            >
              {{ relatedQuestionTitle(question) }}
            </button>
          </li>
        </ul>
      </section>
    </div>
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
  text-wrap: balance;
}

.knowledge-details h4 {
  font-size: 16px;
}

.knowledge-details__meta,
.knowledge-details__muted,
.knowledge-details__question span,
.knowledge-details__neighbour-option small,
.knowledge-details__edge-card span,
.knowledge-details__modal-question span {
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
  font-variant-numeric: tabular-nums;
}

.knowledge-details__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.knowledge-details__block,
.knowledge-details__questions-card,
.knowledge-details__section-heading,
.knowledge-details__edge-card,
.knowledge-details__actions {
  display: grid;
  gap: var(--space-sm);
}

.knowledge-details__questions-card,
.knowledge-details__edge-card {
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.14);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.52);
}

.knowledge-details__list,
.knowledge-details__neighbour-list,
.knowledge-details__modal-list {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: 0;
  list-style: none;
}

.knowledge-details__row,
.knowledge-details__question {
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

.knowledge-details__neighbour-list {
  display: flex;
  max-height: 140px;
  flex-wrap: wrap;
  gap: var(--space-xs);
  overflow: auto;
  padding: 2px;
  scrollbar-gutter: stable;
}

.knowledge-details__neighbour-option,
.knowledge-details__action,
.knowledge-details__modal-close,
.knowledge-details__modal-nav button,
.knowledge-details__modal-list button {
  min-height: 40px;
  border: 1px solid rgb(14 116 144 / 0.2);
  background: rgb(255 255 255 / 0.76);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  transition-duration: 160ms;
  transition-property: background-color, border-color, box-shadow, transform;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.knowledge-details__discovery-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  text-decoration: none;
}

.knowledge-details__neighbour-option {
  display: inline-flex;
  max-width: 220px;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: 999px;
  text-align: left;
}

.knowledge-details__neighbour-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-details__neighbour-option:hover,
.knowledge-details__neighbour-option--selected,
.knowledge-details__action:hover,
.knowledge-details__action:focus-visible,
.knowledge-details__modal-nav button:hover,
.knowledge-details__modal-nav button:focus-visible,
.knowledge-details__modal-list button:hover,
.knowledge-details__modal-list button:focus-visible,
.knowledge-details__modal-list-button--active {
  border-color: rgb(14 116 144 / 0.55);
  background: rgb(236 254 255 / 0.92);
  box-shadow: 0 10px 20px rgb(15 23 42 / 0.08);
}

.knowledge-details__neighbour-option:active,
.knowledge-details__action:active,
.knowledge-details__modal-close:active,
.knowledge-details__modal-nav button:active,
.knowledge-details__modal-list button:active {
  transform: scale(0.96);
}

.knowledge-details__action {
  width: fit-content;
  padding: 0 var(--space-md);
  border-radius: 999px;
}

.knowledge-details__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.knowledge-details__modal-backdrop {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-lg);
  background: rgb(15 23 42 / 0.38);
}

.knowledge-details__modal {
  display: grid;
  width: min(620px, 100%);
  max-height: min(680px, 100%);
  gap: var(--space-md);
  overflow: auto;
  padding: var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.26);
}

.knowledge-details__modal-header {
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
}

.knowledge-details__modal-close {
  min-width: 40px;
  padding: 0;
  border-radius: 999px;
  font-size: 24px;
  line-height: 1;
}

.knowledge-details__modal-question {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(236 254 255 / 0.72);
}

.knowledge-details__modal-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.knowledge-details__modal-nav button,
.knowledge-details__modal-list button {
  padding: 0 var(--space-md);
  border-radius: 999px;
}

.knowledge-details__modal-list {
  gap: var(--space-xs);
}

.knowledge-details__modal-list button {
  width: 100%;
  min-height: 36px;
  text-align: left;
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

  .knowledge-details__modal-backdrop {
    align-items: end;
    padding: var(--space-sm);
  }
}
</style>
