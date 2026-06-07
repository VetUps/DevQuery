<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, reactive, ref, watch } from 'vue'

import type { QuestionDetail } from '@/features/questions/api/questions'
import type { QuestionEditRecord } from '@/features/questions/api/questionEdits'
import {
  extractQuestionEditFieldErrors,
  normalizeQuestionEditError,
} from '@/features/questions/libs/question-edit-errors'
import { useCreateQuestionEditMutation } from '@/features/questions/mutations/useCreateQuestionEditMutation'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import AppInput from '@/shared/ui/AppInput.vue'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

import MarkdownComposer from './MarkdownComposer.vue'
import QuestionTagInput from './QuestionTagInput.vue'

interface Props {
  open: boolean
  question: QuestionDetail
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  submitted: [payload: QuestionEditRecord]
}>()

const createQuestionEditMutation = useCreateQuestionEditMutation()

const activeTab = ref<'editor' | 'preview' | 'changes'>('editor')
const form = reactive({
  question_title: '',
  question_body: '',
  tags: [] as string[],
})
const fieldErrors = reactive({
  question_edit_title_after: '',
  question_edit_body_after: '',
  tags: '',
})
const summary = ref('')

const originalTags = computed(() => normalizeTags(props.question.tags.map((tag) => tag.name)))
const draftTags = computed(() => normalizeTags(form.tags))
const hasTitleChange = computed(() => form.question_title.trim() !== props.question.question_title.trim())
const hasBodyChange = computed(() => form.question_body.trim() !== props.question.question_body.trim())
const hasTagChange = computed(() => !areTagListsEqual(originalTags.value, draftTags.value))
const hasAnyChange = computed(() => hasTitleChange.value || hasBodyChange.value || hasTagChange.value)
const submitLabel = computed(() =>
  createQuestionEditMutation.isPending.value ? 'Отправляем предложение…' : 'Отправить предложение',
)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      hydrateFromQuestion()
    }
  },
  { immediate: true },
)

watch(
  () => props.question.question_id,
  () => {
    hydrateFromQuestion()
  },
)

function normalizeTags(tags: readonly string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

function areTagListsEqual(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) {
    return false
  }

  return first.every((tag, index) => tag === second[index])
}

function hydrateFromQuestion() {
  activeTab.value = 'editor'
  form.question_title = props.question.question_title
  form.question_body = props.question.question_body
  form.tags = props.question.tags.map((tag) => tag.name)
  clearErrors()
}

function clearErrors() {
  fieldErrors.question_edit_title_after = ''
  fieldErrors.question_edit_body_after = ''
  fieldErrors.tags = ''
  summary.value = ''
}

function validate() {
  fieldErrors.question_edit_title_after = form.question_title.trim() ? '' : 'Добавьте короткий заголовок вопроса.'
  fieldErrors.question_edit_body_after = form.question_body.trim() ? '' : 'Опишите вопрос и технический контекст.'
  fieldErrors.tags = draftTags.value.length ? '' : 'Добавьте хотя бы один тег к предложению.'

  if (fieldErrors.question_edit_title_after || fieldErrors.question_edit_body_after || fieldErrors.tags) {
    summary.value = 'Проверьте форму и исправьте ошибки перед отправкой предложения.'
    return false
  }

  if (!hasAnyChange.value) {
    summary.value = 'Измените заголовок, текст или теги перед отправкой предложения.'
    return false
  }

  return true
}

async function handleSubmit() {
  clearErrors()

  if (!validate()) {
    return
  }

  try {
    const createdEdit = await createQuestionEditMutation.mutateAsync({
      question: props.question.question_id,
      question_edit_title_after: form.question_title.trim(),
      question_edit_body_after: form.question_body.trim(),
      tags: draftTags.value,
    })

    emit('submitted', createdEdit)
  } catch (error) {
    const nextFieldErrors = extractQuestionEditFieldErrors(error)
    fieldErrors.question_edit_title_after = nextFieldErrors.question_edit_title_after
    fieldErrors.question_edit_body_after = nextFieldErrors.question_edit_body_after
    fieldErrors.tags = nextFieldErrors.tags

    summary.value = normalizeQuestionEditError(error)

    if (fieldErrors.question_edit_title_after || fieldErrors.question_edit_body_after || fieldErrors.tags) {
      summary.value = 'Проверьте форму и исправьте ошибки перед отправкой предложения.'
    }
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    size="wide"
    title="Предложить правку вопроса"
    description="Соберите улучшенную версию вопроса. Автор увидит предложение в очереди проверки — текущий вопрос не изменится сразу."
    @close="emit('close')"
  >
    <form class="question-edit-proposal-modal" @submit.prevent="handleSubmit">
      <p v-if="summary" class="question-edit-proposal-modal__summary" role="alert">
        {{ summary }}
      </p>

      <div class="question-edit-proposal-modal__tabs" role="tablist" aria-label="Режим предложения правки вопроса">
        <button
          type="button"
          class="question-edit-proposal-modal__tab"
          :class="{ 'question-edit-proposal-modal__tab--active': activeTab === 'editor' }"
          role="tab"
          :aria-selected="activeTab === 'editor'"
          aria-controls="question-edit-proposal-editor-panel"
          @click="activeTab = 'editor'"
        >
          Редактор
        </button>
        <button
          type="button"
          class="question-edit-proposal-modal__tab"
          :class="{ 'question-edit-proposal-modal__tab--active': activeTab === 'preview' }"
          role="tab"
          :aria-selected="activeTab === 'preview'"
          aria-controls="question-edit-proposal-preview-panel"
          @click="activeTab = 'preview'"
        >
          Предпросмотр
        </button>
        <button
          type="button"
          class="question-edit-proposal-modal__tab"
          :class="{ 'question-edit-proposal-modal__tab--active': activeTab === 'changes' }"
          role="tab"
          :aria-selected="activeTab === 'changes'"
          aria-controls="question-edit-proposal-changes-panel"
          @click="activeTab = 'changes'"
        >
          Изменения
        </button>
      </div>

      <section
        v-show="activeTab === 'editor'"
        id="question-edit-proposal-editor-panel"
        class="question-edit-proposal-modal__panel"
        role="tabpanel"
      >
        <AppInput
          id="question-edit-proposal-title"
          v-model="form.question_title"
          label="Предлагаемый заголовок"
          placeholder="Коротко уточните проблему"
          :error="fieldErrors.question_edit_title_after"
        />

        <MarkdownComposer
          id="question-edit-proposal-body"
          v-model="form.question_body"
          label="Предлагаемый текст вопроса"
          placeholder="Уточните контекст, код, ошибку и ожидаемое поведение."
          :error="fieldErrors.question_edit_body_after"
          :show-mode-toggle="false"
        />

        <QuestionTagInput
          id="question-edit-proposal-tags"
          v-model="form.tags"
          label="Предлагаемые теги"
          :error="fieldErrors.tags"
        />
      </section>

      <SurfacePanel
        v-show="activeTab === 'preview'"
        id="question-edit-proposal-preview-panel"
        class="question-edit-proposal-modal__panel"
        padding="lg"
        role="tabpanel"
      >
        <p class="question-edit-proposal-modal__eyebrow">Предпросмотр предложения</p>
        <h3 class="question-edit-proposal-modal__preview-title">{{ form.question_title || 'Без заголовка' }}</h3>
        <div class="question-edit-proposal-modal__preview-tags" aria-label="Предлагаемые теги">
          <span v-for="tag in draftTags" :key="tag">#{{ tag }}</span>
        </div>
        <MarkdownContent :source="form.question_body" />
      </SurfacePanel>

      <section
        v-show="activeTab === 'changes'"
        id="question-edit-proposal-changes-panel"
        class="question-edit-proposal-modal__panel question-edit-proposal-modal__changes"
        role="tabpanel"
      >
        <div class="question-edit-proposal-modal__change-card">
          <p class="question-edit-proposal-modal__eyebrow">Сейчас</p>
          <h3>{{ question.question_title }}</h3>
          <p>{{ question.question_body }}</p>
          <div class="question-edit-proposal-modal__tag-row">
            <span v-for="tag in originalTags" :key="tag">#{{ tag }}</span>
          </div>
        </div>

        <div class="question-edit-proposal-modal__change-card question-edit-proposal-modal__change-card--after">
          <p class="question-edit-proposal-modal__eyebrow">Предложение</p>
          <h3>{{ form.question_title || 'Без заголовка' }}</h3>
          <p>{{ form.question_body || 'Без текста' }}</p>
          <div class="question-edit-proposal-modal__tag-row">
            <span v-for="tag in draftTags" :key="tag">#{{ tag }}</span>
          </div>
        </div>
      </section>

      <div class="question-edit-proposal-modal__footer">
        <p class="question-edit-proposal-modal__hint">
          Отправка создаёт pending-предложение. Автор вопроса решит, применять ли правку.
        </p>
        <div class="question-edit-proposal-modal__actions">
          <AppButton type="button" variant="ghost" @click="emit('close')">
            Отменить
          </AppButton>
          <AppButton type="submit" :disabled="createQuestionEditMutation.isPending.value">
            {{ submitLabel }}
          </AppButton>
        </div>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.question-edit-proposal-modal,
.question-edit-proposal-modal__panel {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
}

.question-edit-proposal-modal__summary,
.question-edit-proposal-modal__hint,
.question-edit-proposal-modal__eyebrow,
.question-edit-proposal-modal__preview-title,
.question-edit-proposal-modal__change-card h3,
.question-edit-proposal-modal__change-card p {
  margin: 0;
}

.question-edit-proposal-modal__summary {
  padding: var(--space-md);
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(180 35 24 / 0.08);
  color: #b42318;
}

.question-edit-proposal-modal__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.question-edit-proposal-modal__tab {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  color: var(--color-text);
  font-weight: 700;
}

.question-edit-proposal-modal__tab--active {
  border-color: rgb(14 116 144 / 0.24);
  background: rgb(14 116 144 / 0.09);
  color: var(--color-accent);
}

.question-edit-proposal-modal__eyebrow {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.question-edit-proposal-modal__preview-title,
.question-edit-proposal-modal__change-card h3 {
  overflow-wrap: anywhere;
  font-size: 24px;
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.question-edit-proposal-modal__preview-tags,
.question-edit-proposal-modal__tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.question-edit-proposal-modal__preview-tags span,
.question-edit-proposal-modal__tag-row span {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
}

.question-edit-proposal-modal__changes {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.question-edit-proposal-modal__change-card {
  display: grid;
  align-content: start;
  gap: var(--space-md);
  min-width: 0;
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.72);
}

.question-edit-proposal-modal__change-card--after {
  border-color: rgb(14 116 144 / 0.24);
  background: linear-gradient(180deg, rgb(14 116 144 / 0.08), rgb(255 255 255 / 0.84));
}

.question-edit-proposal-modal__change-card p {
  color: var(--color-text);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.question-edit-proposal-modal__footer,
.question-edit-proposal-modal__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.question-edit-proposal-modal__hint {
  max-width: 54ch;
  color: var(--color-muted);
  line-height: 1.6;
}

.question-edit-proposal-modal :deep(.markdown-composer__textarea),
.question-edit-proposal-modal :deep(.markdown-composer__preview) {
  min-height: 360px;
}

@media (width <= 860px) {
  .question-edit-proposal-modal__changes {
    grid-template-columns: 1fr;
  }
}
</style>
