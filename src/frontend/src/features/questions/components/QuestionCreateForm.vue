<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { DraftAssistantResponse } from '@/features/questions/api/questionDraftAssistant'
import { useCreateQuestionMutation } from '@/features/questions/mutations/useCreateQuestionMutation'
import { useQuestionDraftAssistantMutation } from '@/features/questions/mutations/useQuestionDraftAssistantMutation'
import {
  extractQuestionFieldErrors,
  normalizeQuestionSubmitError,
} from '@/features/questions/libs/question-form-errors'
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'

import MarkdownComposer from './MarkdownComposer.vue'
import QuestionDraftAssistantPanel from './QuestionDraftAssistantPanel.vue'
import QuestionTagInput from './QuestionTagInput.vue'

const router = useRouter()
const createQuestionMutation = useCreateQuestionMutation()
const draftAssistantMutation = useQuestionDraftAssistantMutation()
const latestDraftAssistantResult = ref<DraftAssistantResponse | null>(null)
const latestDraftAssistantError = ref<unknown>(null)

const form = reactive({
  question_title: '',
  question_body: '',
  tags: [] as string[],
})

const fieldErrors = reactive({
  question_title: '',
  question_body: '',
  tags: '',
})

const formError = ref('')

async function requestDraftAssistantFeedback() {
  latestDraftAssistantError.value = null

  try {
    latestDraftAssistantResult.value = await draftAssistantMutation.mutateAsync({
      question_title: form.question_title,
      question_body: form.question_body,
      tags: [...form.tags],
      mode: 'create',
    })
  } catch (error) {
    latestDraftAssistantError.value = error
    // The panel renders a redacted, non-blocking error state.
  }
}

function applySuggestedTitle(title: string) {
  form.question_title = title
}

function applySuggestedBody(body: string) {
  form.question_body = body
}

function applySuggestedTags(tags: string[]) {
  form.tags = [...tags]
}

function validate() {
  fieldErrors.question_title = form.question_title.trim() ? '' : 'Добавьте короткий заголовок вопроса.'
  fieldErrors.question_body = form.question_body.trim() ? '' : 'Опишите вопрос и приведите технический контекст.'
  fieldErrors.tags = form.tags.length ? '' : 'Добавьте хотя бы один тег к вопросу.'

  return !fieldErrors.question_title && !fieldErrors.question_body && !fieldErrors.tags
}

async function handleSubmit() {
  formError.value = ''

  if (!validate()) {
    formError.value = 'Проверьте форму и исправьте ошибки перед отправкой.'
    return
  }

  try {
    const createdQuestion = await createQuestionMutation.mutateAsync({
      question_title: form.question_title.trim(),
      question_body: form.question_body.trim(),
      tags: form.tags,
    })

    await router.push({
      name: 'question-detail',
      params: { questionId: createdQuestion.question_id },
      query: { message: 'question-created' },
    })
  } catch (error) {
    const nextFieldErrors = extractQuestionFieldErrors(error)
    fieldErrors.question_title = nextFieldErrors.question_title
    fieldErrors.question_body = nextFieldErrors.question_body
    fieldErrors.tags = nextFieldErrors.tags

    formError.value = normalizeQuestionSubmitError(error)

    if (!formError.value || fieldErrors.question_title || fieldErrors.question_body || fieldErrors.tags) {
      formError.value = 'Проверьте форму и исправьте ошибки перед отправкой.'
    }
  }
}
</script>

<template>
  <form class="question-create-form" @submit.prevent="handleSubmit">
    <p v-if="formError" class="question-create-form__summary">{{ formError }}</p>

    <AppInput
      id="question-title"
      v-model="form.question_title"
      label="Заголовок"
      placeholder="Коротко опишите проблему"
      :error="fieldErrors.question_title"
    />

    <MarkdownComposer
      id="question-body"
      v-model="form.question_body"
      label="Текст вопроса"
      placeholder="Опишите проблему, приложите контекст, код и ожидаемое поведение."
      :error="fieldErrors.question_body"
    />

    <QuestionTagInput id="question-tags" v-model="form.tags" label="Теги" :error="fieldErrors.tags" />

    <QuestionDraftAssistantPanel
      :result="latestDraftAssistantResult"
      :is-pending="draftAssistantMutation.isPending.value"
      :error="latestDraftAssistantError"
      @request="requestDraftAssistantFeedback"
      @apply-title="applySuggestedTitle"
      @apply-body="applySuggestedBody"
      @apply-tags="applySuggestedTags"
    />

    <div class="question-create-form__footer">
      <p class="question-create-form__hint">
        После публикации вы перейдёте на страницу вопроса и сможете следить за решениями.
      </p>

      <AppButton type="submit" :disabled="createQuestionMutation.isPending.value">
        {{ createQuestionMutation.isPending.value ? 'Публикуем вопрос…' : 'Опубликовать вопрос' }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.question-create-form {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
}

.question-create-form > * {
  min-width: 0;
}

.question-create-form__summary,
.question-create-form__hint {
  margin: 0;
}

.question-create-form__summary {
  padding: var(--space-md);
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
}

.question-create-form__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.question-create-form__hint {
  max-width: 44ch;
  color: var(--color-muted);
  line-height: 1.6;
}
</style>
