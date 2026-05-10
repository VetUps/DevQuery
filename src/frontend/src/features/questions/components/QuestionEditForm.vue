<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import type { QuestionDetail } from '@/features/questions/api/questions'
import {
  extractQuestionFieldErrors,
  normalizeQuestionSubmitError,
} from '@/features/questions/libs/question-form-errors'
import { useUpdateQuestionMutation } from '@/features/questions/mutations/useUpdateQuestionMutation'
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'

import MarkdownComposer from './MarkdownComposer.vue'
import QuestionTagInput from './QuestionTagInput.vue'

interface Props {
  question: QuestionDetail
}

const props = defineProps<Props>()
const emit = defineEmits<{
  saved: [question: QuestionDetail]
}>()

const updateQuestionMutation = useUpdateQuestionMutation()

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
const successMessage = ref('')

const pendingLabel = computed(() => (updateQuestionMutation.isPending.value ? 'Сохраняем изменения…' : 'Сохранить изменения'))

watch(
  () => props.question.question_id,
  () => {
    hydrateFromQuestion(props.question)
  },
  { immediate: true },
)

function hydrateFromQuestion(question: QuestionDetail) {
  form.question_title = question.question_title
  form.question_body = question.question_body
  form.tags = question.tags.map((tag) => tag.name)
  clearFieldErrors()
  formError.value = ''
  successMessage.value = ''
}

function clearFieldErrors() {
  fieldErrors.question_title = ''
  fieldErrors.question_body = ''
  fieldErrors.tags = ''
}

function validate() {
  fieldErrors.question_title = form.question_title.trim() ? '' : 'Добавьте короткий заголовок вопроса.'
  fieldErrors.question_body = form.question_body.trim() ? '' : 'Опишите вопрос и приведите технический контекст.'
  fieldErrors.tags = form.tags.length ? '' : 'Добавьте хотя бы один тег к вопросу.'

  return !fieldErrors.question_title && !fieldErrors.question_body && !fieldErrors.tags
}

async function handleSubmit() {
  formError.value = ''
  successMessage.value = ''
  clearFieldErrors()

  if (!validate()) {
    formError.value = 'Проверьте форму и исправьте ошибки перед сохранением.'
    return
  }

  try {
    const updatedQuestion = await updateQuestionMutation.mutateAsync({
      questionId: props.question.question_id,
      payload: {
        question_title: form.question_title.trim(),
        question_body: form.question_body.trim(),
        tags: form.tags,
      },
    })

    successMessage.value = 'Изменения сохранены.'
    emit('saved', updatedQuestion)
  } catch (error) {
    const nextFieldErrors = extractQuestionFieldErrors(error)
    fieldErrors.question_title = nextFieldErrors.question_title
    fieldErrors.question_body = nextFieldErrors.question_body
    fieldErrors.tags = nextFieldErrors.tags

    formError.value = normalizeQuestionSubmitError(error, 'Не удалось сохранить изменения. Попробуйте ещё раз.')

    if (!formError.value || fieldErrors.question_title || fieldErrors.question_body || fieldErrors.tags) {
      formError.value = 'Проверьте форму и исправьте ошибки перед сохранением.'
    }
  }
}
</script>

<template>
  <form class="question-edit-form" @submit.prevent="handleSubmit">
    <p v-if="formError" class="question-edit-form__summary" role="alert">{{ formError }}</p>
    <p v-if="successMessage" class="question-edit-form__success" role="status">{{ successMessage }}</p>

    <AppInput
      id="question-edit-title"
      v-model="form.question_title"
      label="Заголовок"
      placeholder="Коротко опишите проблему"
      :error="fieldErrors.question_title"
    />

    <MarkdownComposer
      id="question-edit-body"
      v-model="form.question_body"
      label="Текст вопроса"
      placeholder="Опишите проблему, приложите контекст, код и ожидаемое поведение."
      :error="fieldErrors.question_body"
    />

    <QuestionTagInput id="question-edit-tags" v-model="form.tags" label="Теги" :error="fieldErrors.tags" />

    <div class="question-edit-form__footer">
      <p class="question-edit-form__hint">
        Сохраняем через API вопроса и показываем обновлённые данные только после ответа сервера.
      </p>

      <AppButton type="submit" :disabled="updateQuestionMutation.isPending.value">
        {{ pendingLabel }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.question-edit-form {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
}

.question-edit-form > * {
  min-width: 0;
}

.question-edit-form__summary,
.question-edit-form__success,
.question-edit-form__hint {
  margin: 0;
}

.question-edit-form__summary,
.question-edit-form__success {
  padding: var(--space-md);
  border-radius: var(--radius-md);
}

.question-edit-form__summary {
  border: 1px solid rgb(180 35 24 / 0.2);
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
}

.question-edit-form__success {
  border: 1px solid rgb(21 128 61 / 0.22);
  background: rgb(21 128 61 / 0.1);
  color: #166534;
}

.question-edit-form__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.question-edit-form__hint {
  max-width: 48ch;
  color: var(--color-muted);
  line-height: 1.6;
}
</style>