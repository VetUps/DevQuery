<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed } from 'vue'

import type { DraftAssistantFindingSeverity, DraftAssistantResponse } from '@/features/questions/api/questionDraftAssistant'
import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  result: DraftAssistantResponse | null
  isPending: boolean
  error?: unknown
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  error: null,
  disabled: false,
})

const emit = defineEmits<{
  request: []
  'apply-title': [title: string]
  'apply-body': [body: string]
  'apply-tags': [tags: string[]]
}>()

const controlsDisabled = computed(() => props.disabled || props.isPending)
const hasResult = computed(() => props.result !== null)
const hasError = computed(() => Boolean(props.error))
const isUnavailable = computed(() => props.result?.status === 'assistant_unavailable')
const visibleFindings = computed(() => props.result?.findings.slice(0, 6) ?? [])
const visibleWarnings = computed(() => props.result?.warnings ?? [])
const suggestedTitle = computed(() => props.result?.suggested_title?.trim() ? props.result.suggested_title : null)
const suggestedBody = computed(() => props.result?.suggested_body?.trim() ? props.result.suggested_body : null)
const suggestedTags = computed(() => props.result?.suggested_tags.slice(0, 5) ?? [])
const hasSuggestedTags = computed(() => suggestedTags.value.length > 0)

function requestAssistant() {
  if (controlsDisabled.value) {
    return
  }

  emit('request')
}

function applyTitle() {
  if (controlsDisabled.value || !suggestedTitle.value) {
    return
  }

  emit('apply-title', suggestedTitle.value)
}

function applyBody() {
  if (controlsDisabled.value || !suggestedBody.value) {
    return
  }

  emit('apply-body', suggestedBody.value)
}

function applyTags() {
  if (controlsDisabled.value || !hasSuggestedTags.value) {
    return
  }

  emit('apply-tags', [...suggestedTags.value])
}

function severityLabel(severity: DraftAssistantFindingSeverity) {
  const labels: Record<DraftAssistantFindingSeverity, string> = {
    info: 'Совет',
    warning: 'Предупреждение',
    error: 'Нужно исправить',
  }

  return labels[severity]
}
</script>

<template>
  <section class="draft-assistant-panel" aria-labelledby="draft-assistant-title">
    <div class="draft-assistant-panel__header">
      <div>
        <p class="draft-assistant-panel__eyebrow">AI-помощник</p>
        <h2 id="draft-assistant-title" class="draft-assistant-panel__title">Проверить черновик вопроса</h2>
        <p class="draft-assistant-panel__description">
          Получите подсказки по заголовку, тексту и тегам перед сохранением. Применение каждой подсказки остаётся под вашим контролем.
        </p>
      </div>

      <AppButton type="button" variant="secondary" :disabled="controlsDisabled" @click="requestAssistant">
        {{ isPending ? 'Проверяем…' : hasResult ? 'Проверить ещё раз' : 'Проверить черновик' }}
      </AppButton>
    </div>

    <p v-if="isPending" class="draft-assistant-panel__status" role="status" aria-live="polite">
      Помощник анализирует черновик. Поля вопроса пока не изменяются.
    </p>

    <p v-else-if="hasError" class="draft-assistant-panel__alert" role="alert">
      Не удалось получить рекомендации. Попробуйте ещё раз позже; черновик не был изменён.
    </p>

    <div v-else-if="result" class="draft-assistant-panel__result">
      <div
        v-if="isUnavailable || visibleWarnings.length"
        class="draft-assistant-panel__warning"
        role="status"
        aria-live="polite"
      >
        <p class="draft-assistant-panel__warning-title">Помощник временно ограничен</p>
        <ul v-if="visibleWarnings.length" class="draft-assistant-panel__list">
          <li v-for="warning in visibleWarnings" :key="warning.code">{{ warning.message }}</li>
        </ul>
        <p v-else>Можно продолжать редактирование вручную — сохранение вопроса не заблокировано.</p>
      </div>

      <section class="draft-assistant-panel__summary" aria-labelledby="draft-assistant-summary-title">
        <h3 id="draft-assistant-summary-title" class="draft-assistant-panel__section-title">Итог проверки</h3>
        <p>{{ result.summary }}</p>
      </section>

      <section v-if="visibleFindings.length" class="draft-assistant-panel__findings" aria-labelledby="draft-assistant-findings-title">
        <h3 id="draft-assistant-findings-title" class="draft-assistant-panel__section-title">Найденные замечания</h3>
        <ul class="draft-assistant-panel__list">
          <li v-for="finding in visibleFindings" :key="finding.code" class="draft-assistant-panel__finding">
            <span class="draft-assistant-panel__severity">{{ severityLabel(finding.severity) }}</span>
            <span v-if="finding.field" class="draft-assistant-panel__field">{{ finding.field }}</span>
            <span>{{ finding.message }}</span>
          </li>
        </ul>
      </section>

      <div class="draft-assistant-panel__suggestions" aria-label="Предложения помощника">
        <article v-if="suggestedTitle" class="draft-assistant-panel__card">
          <h3 class="draft-assistant-panel__section-title">Заголовок</h3>
          <p>{{ suggestedTitle }}</p>
          <AppButton type="button" size="compact" :disabled="controlsDisabled" @click="applyTitle">
            Применить заголовок
          </AppButton>
        </article>

        <article v-if="suggestedBody" class="draft-assistant-panel__card">
          <h3 class="draft-assistant-panel__section-title">Текст вопроса</h3>
          <p>{{ suggestedBody }}</p>
          <AppButton type="button" size="compact" :disabled="controlsDisabled" @click="applyBody">
            Применить текст
          </AppButton>
        </article>

        <article v-if="hasSuggestedTags" class="draft-assistant-panel__card">
          <h3 class="draft-assistant-panel__section-title">Теги</h3>
          <ul class="draft-assistant-panel__tags" aria-label="Предложенные теги">
            <li v-for="tag in suggestedTags" :key="tag" class="draft-assistant-panel__tag">#{{ tag }}</li>
          </ul>
          <AppButton type="button" size="compact" :disabled="controlsDisabled" @click="applyTags">
            Применить теги
          </AppButton>
        </article>
      </div>
    </div>

    <p v-else class="draft-assistant-panel__empty">
      Запустите проверку, чтобы увидеть рекомендации. Помощник ничего не сохраняет и не публикует.
    </p>
  </section>
</template>

<style scoped>
.draft-assistant-panel {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.72);
}

.draft-assistant-panel__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.draft-assistant-panel__eyebrow,
.draft-assistant-panel__title,
.draft-assistant-panel__description,
.draft-assistant-panel__status,
.draft-assistant-panel__alert,
.draft-assistant-panel__warning-title,
.draft-assistant-panel__empty,
.draft-assistant-panel__summary p,
.draft-assistant-panel__card p {
  margin: 0;
}

.draft-assistant-panel__eyebrow {
  color: var(--color-accent);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.draft-assistant-panel__title {
  margin-top: var(--space-xs);
  font-size: 1.25rem;
}

.draft-assistant-panel__description,
.draft-assistant-panel__empty {
  max-width: 62ch;
  color: var(--color-muted);
  line-height: 1.6;
}

.draft-assistant-panel__status,
.draft-assistant-panel__alert,
.draft-assistant-panel__warning {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  line-height: 1.55;
}

.draft-assistant-panel__status {
  border: 1px solid rgb(12 100 125 / 0.2);
  background: rgb(12 100 125 / 0.08);
  color: #0c647d;
}

.draft-assistant-panel__alert {
  border: 1px solid rgb(180 35 24 / 0.2);
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
}

.draft-assistant-panel__warning {
  display: grid;
  gap: var(--space-sm);
  border: 1px solid rgb(180 83 9 / 0.24);
  background: rgb(180 83 9 / 0.09);
  color: #92400e;
}

.draft-assistant-panel__warning-title,
.draft-assistant-panel__severity {
  font-weight: 700;
}

.draft-assistant-panel__result,
.draft-assistant-panel__summary,
.draft-assistant-panel__findings,
.draft-assistant-panel__card {
  display: grid;
  gap: var(--space-sm);
}

.draft-assistant-panel__section-title {
  margin: 0;
  font-size: 1rem;
}

.draft-assistant-panel__list,
.draft-assistant-panel__tags {
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-assistant-panel__list {
  display: grid;
  gap: var(--space-xs);
}

.draft-assistant-panel__finding {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: baseline;
}

.draft-assistant-panel__field {
  color: var(--color-muted);
  font-size: 0.9rem;
}

.draft-assistant-panel__suggestions {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.draft-assistant-panel__card {
  align-content: start;
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.64);
}

.draft-assistant-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.draft-assistant-panel__tag {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgb(12 100 125 / 0.1);
  color: #0c647d;
  font-weight: 700;
}
</style>
