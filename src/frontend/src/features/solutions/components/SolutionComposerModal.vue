<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import { useCreateSolutionMutation } from '@/features/solutions/mutations/useCreateSolutionMutation'
import {
  extractSolutionFieldErrors,
  normalizeSolutionSubmitError,
} from '@/features/solutions/lib/solution-form-errors'
import type { CreateSolutionResponse } from '@/features/solutions/api/solutions'
import MarkdownComposer from '@/features/questions/components/MarkdownComposer.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'

interface Props {
  open: boolean
  questionId: string
  questionTitle: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  submitted: [solution: CreateSolutionResponse]
}>()

const createSolutionMutation = useCreateSolutionMutation()

const form = reactive({
  solution_body: '',
})

const fieldErrors = reactive({
  solution_body: '',
})

const formError = ref('')

watch(
  () => props.questionId,
  () => {
    form.solution_body = ''
    fieldErrors.solution_body = ''
    formError.value = ''
  },
)

function validate() {
  fieldErrors.solution_body = form.solution_body.trim()
    ? ''
    : 'Добавьте решение и поясните, почему такой подход работает.'

  return !fieldErrors.solution_body
}

async function handleSubmit() {
  formError.value = ''

  if (!validate()) {
    formError.value = 'Проверьте форму и исправьте ошибки перед отправкой.'
    return
  }

  try {
    const createdSolution = await createSolutionMutation.mutateAsync({
      question: props.questionId,
      solution_body: form.solution_body.trim(),
    })

    form.solution_body = ''
    fieldErrors.solution_body = ''
    formError.value = ''
    emit('submitted', createdSolution)
  } catch (error) {
    const nextFieldErrors = extractSolutionFieldErrors(error)
    fieldErrors.solution_body = nextFieldErrors.solution_body
    formError.value = normalizeSolutionSubmitError(error)

    if (!formError.value) {
      formError.value = 'Не удалось добавить решение. Попробуйте ещё раз.'
    }
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Написать решение"
    :description="`Вы отвечаете на вопрос: ${questionTitle}`"
    @close="$emit('close')"
  >
    <form class="solution-composer-modal" @submit.prevent="handleSubmit">
      <p v-if="formError" class="solution-composer-modal__summary">{{ formError }}</p>

      <MarkdownComposer
        id="solution-body"
        v-model="form.solution_body"
        label="Текст решения"
        placeholder="Опишите ход мысли, приведите пример кода и объясните, почему решение работает."
        :error="fieldErrors.solution_body"
      />

      <div class="solution-composer-modal__footer">
        <p class="solution-composer-modal__hint">
          После публикации решение появится в общем списке, а мы перенесём вас прямо к нему.
        </p>

        <div class="solution-composer-modal__actions">
          <AppButton type="button" variant="ghost" @click="$emit('close')">
            Отменить
          </AppButton>
          <AppButton type="submit" :disabled="createSolutionMutation.isPending.value">
            {{ createSolutionMutation.isPending.value ? 'Добавляем решение…' : 'Написать решение' }}
          </AppButton>
        </div>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.solution-composer-modal {
  display: grid;
  gap: var(--space-lg);
}

.solution-composer-modal__summary,
.solution-composer-modal__hint {
  margin: 0;
}

.solution-composer-modal__summary {
  padding: var(--space-md);
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
}

.solution-composer-modal__footer,
.solution-composer-modal__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.solution-composer-modal__hint {
  max-width: 48ch;
  color: var(--color-muted);
  line-height: 1.6;
}
</style>
