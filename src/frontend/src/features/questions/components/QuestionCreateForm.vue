<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useCreateQuestionMutation } from '@/features/questions/mutations/useCreateQuestionMutation'
import {
  extractQuestionFieldErrors,
  normalizeQuestionSubmitError,
} from '@/features/questions/lib/question-form-errors'
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'

import MarkdownComposer from './MarkdownComposer.vue'

const router = useRouter()
const createQuestionMutation = useCreateQuestionMutation()

const form = reactive({
  question_title: '',
  question_body: '',
})

const fieldErrors = reactive({
  question_title: '',
  question_body: '',
})

const formError = ref('')

function validate() {
  fieldErrors.question_title = form.question_title.trim() ? '' : 'Добавьте короткий заголовок вопроса.'
  fieldErrors.question_body = form.question_body.trim() ? '' : 'Опишите вопрос и приведите технический контекст.'

  return !fieldErrors.question_title && !fieldErrors.question_body
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

    formError.value = normalizeQuestionSubmitError(error)

    if (!formError.value || fieldErrors.question_title || fieldErrors.question_body) {
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
