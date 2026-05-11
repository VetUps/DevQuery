<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import { useRebuildKnowledgeGraphMutation } from '@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation'
import { useOwnKnowledgeGraphQuery, usePublicUserKnowledgeGraphQuery } from '@/features/knowledge/queries/useKnowledgeGraphQuery'
import type {
  KnowledgeGraphActivityBreakdownEntry,
  KnowledgeGraphConceptEntry,
  KnowledgeGraphRelatedQuestion,
  UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'
import KnowledgeGraphRenderer from './KnowledgeGraphRenderer.vue'

const STALE_COPY = 'Мы обнаружили расхождение между графом и вашей активностью. Перестройте граф.'
const SAFE_API_ERROR_COPY = 'Не удалось загрузить граф знаний. Попробуйте обновить вкладку.'
const SAFE_REBUILD_ERROR_COPY = 'Не удалось запустить перестроение графа. Попробуйте ещё раз позже.'

type GraphStatus = 'fresh' | 'stale' | 'rebuilding' | 'failed'

const props = withDefaults(defineProps<{
  userId?: string
}>(), {
  userId: '',
})

const normalizedUserId = computed(() => props.userId.trim())
const graphQuery = normalizedUserId.value
  ? usePublicUserKnowledgeGraphQuery(normalizedUserId)
  : useOwnKnowledgeGraphQuery()
const rebuildMutation = useRebuildKnowledgeGraphMutation()
const rebuildActionError = shallowRef('')

const graph = computed<UserKnowledgeGraphResponse | undefined>(() => graphQuery.data.value)
const hasGraph = computed(() => Boolean(graph.value))
const hasConcepts = computed(() => (graph.value?.concepts.length ?? 0) > 0)
const hasTopologyNodes = computed(() => (graph.value?.nodes.length ?? 0) > 0)
const isInitialLoading = computed(() => graphQuery.isPending.value && !hasGraph.value)
const isInitialError = computed(() => graphQuery.isError.value && !hasGraph.value)
const isStaleQueryError = computed(() => graphQuery.isError.value && hasGraph.value)
const isOwner = computed(() => Boolean(graph.value?.viewer.is_owner))

const sortedConcepts = computed(() => {
  return [...(graph.value?.concepts ?? [])].sort((left, right) => {
    const byWeight = toNumber(right.total_weight) - toNumber(left.total_weight)

    if (byWeight !== 0) {
      return byWeight
    }

    return left.name.localeCompare(right.name, 'ru')
  })
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
      description: `Фаза: ${state.last_failed_phase || 'не указана'}. Сообщение: ${state.last_error_message || 'Безопасные детали недоступны.'}`,
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
  const source = concept.source || 'aggregate'
  const provider = concept.provider || 'unknown'

  return `${source} · ${provider}`
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
      </SurfacePanel>

      <InlineFeedbackPanel
        v-if="stateBanner"
        data-testid="knowledge-state-banner"
        :tone="stateBanner.tone"
        :eyebrow="stateBanner.label"
        :title="stateBanner.title"
        :description="stateBanner.description"
      />

      <InlineFeedbackPanel
        v-if="!hasConcepts"
        data-testid="knowledge-graph-empty"
        eyebrow="Пустой граф"
        title="Концепты пока не найдены"
        description="Задавайте вопросы, отвечайте и получайте оценки — после активности граф покажет веса тем."
      />

      <SurfacePanel v-if="hasTopologyNodes" data-testid="knowledge-graph-mode" padding="lg">
        <KnowledgeGraphRenderer :nodes="graph.nodes" :edges="graph.edges" />
      </SurfacePanel>

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

      <div v-if="hasConcepts" class="knowledge-tab__concept-grid" data-testid="knowledge-concepts">
        <SurfacePanel
          v-for="concept in sortedConcepts"
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

          <p class="knowledge-concept__explanation">
            Уверенность {{ formatWeight(concept.confidence) }} · {{ concept.source_count }} агрегированных сигналов.
          </p>

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
.knowledge-tab__content {
  display: grid;
  gap: var(--space-xl);
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

.knowledge-tab__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: center;
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
