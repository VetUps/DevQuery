<script setup lang="ts">
import { ref, watch } from 'vue'

import type { CreateSolutionEditResponse } from '@/features/solutions/api/solutionEdits'
import MarkdownComposer from '@/features/questions/components/MarkdownComposer.vue'
import SolutionEditComparePane from '@/features/solutions/components/SolutionEditComparePane.vue'
import {
  extractSolutionEditFieldErrors,
  normalizeSolutionEditError,
} from '@/features/solutions/libs/solution-edit-errors'
import { useCreateSolutionEditMutation } from '@/features/solutions/mutations/useCreateSolutionEditMutation'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

interface Props {
  open: boolean
  solutionId: string
  originalBody: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  submitted: [payload: CreateSolutionEditResponse]
}>()

const createSolutionEditMutation = useCreateSolutionEditMutation()

const activeTab = ref<'editor' | 'preview' | 'changes'>('editor')
const draftBody = ref('')
const fieldError = ref('')
const summary = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      return
    }

    activeTab.value = 'editor'
    draftBody.value = props.originalBody
    fieldError.value = ''
    summary.value = ''
  },
  { immediate: true },
)

watch(
  () => props.solutionId,
  () => {
    draftBody.value = props.originalBody
    fieldError.value = ''
    summary.value = ''
  },
)

function validate() {
  if (!draftBody.value.trim()) {
    fieldError.value = 'Добавьте обновлённый текст решения.'
    return false
  }

  if (draftBody.value.trim() === props.originalBody.trim()) {
    fieldError.value = 'Покажите реальные изменения, а не ту же самую версию решения.'
    return false
  }

  fieldError.value = ''
  return true
}

async function handleSubmit() {
  summary.value = ''

  if (!validate()) {
    summary.value = 'Проверьте форму и уточните, какие изменения вы предлагаете.'
    return
  }

  try {
    const createdEdit = await createSolutionEditMutation.mutateAsync({
      solution: props.solutionId,
      solution_edit_body_after: draftBody.value.trim(),
    })

    emit('submitted', createdEdit)
  } catch (error) {
    const nextFieldErrors = extractSolutionEditFieldErrors(error)
    fieldError.value = nextFieldErrors.solution_edit_body_after || fieldError.value
    summary.value = normalizeSolutionEditError(error)
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    size="wide"
    title="Предложить правку"
    description="Сравните исходное решение с новой версией и отправьте её на проверку."
    @close="$emit('close')"
  >
    <form class="solution-edit-proposal-modal" @submit.prevent="handleSubmit">
      <p v-if="summary" class="solution-edit-proposal-modal__summary">{{ summary }}</p>

      <div class="solution-edit-proposal-modal__layout">
        <SurfacePanel class="solution-edit-proposal-modal__reference" padding="lg" variant="muted">
          <div>
            <p class="solution-edit-proposal-modal__eyebrow">Оригинал</p>
            <h3 class="solution-edit-proposal-modal__title">Текущее решение</h3>
          </div>

          <MarkdownContent :source="originalBody" />
        </SurfacePanel>

        <section class="solution-edit-proposal-modal__main">
          <div class="solution-edit-proposal-modal__tabs">
            <button
              type="button"
              class="solution-edit-proposal-modal__tab"
              :class="{ 'solution-edit-proposal-modal__tab--active': activeTab === 'editor' }"
              @click="activeTab = 'editor'"
            >
              Редактор
            </button>
            <button
              type="button"
              class="solution-edit-proposal-modal__tab"
              :class="{ 'solution-edit-proposal-modal__tab--active': activeTab === 'preview' }"
              @click="activeTab = 'preview'"
            >
              Предпросмотр
            </button>
            <button
              type="button"
              class="solution-edit-proposal-modal__tab"
              :class="{ 'solution-edit-proposal-modal__tab--active': activeTab === 'changes' }"
              @click="activeTab = 'changes'"
            >
              Изменения
            </button>
          </div>

          <MarkdownComposer
            v-if="activeTab === 'editor'"
            id="solution-edit-body"
            v-model="draftBody"
            label="Новая версия решения"
            placeholder="Опишите улучшенную версию решения, сохраняя полезный контекст и добавляя свои правки."
            :error="fieldError"
            :show-mode-toggle="false"
          />

          <SurfacePanel v-else-if="activeTab === 'preview'" padding="lg">
            <MarkdownContent :source="draftBody" />
          </SurfacePanel>

          <SolutionEditComparePane
            v-else
            :before="originalBody"
            :after="draftBody"
          />
        </section>
      </div>

      <div class="solution-edit-proposal-modal__footer">
        <p class="solution-edit-proposal-modal__hint">
          После отправки автор решения увидит правку в своём профиле и сможет одобрить или отклонить её.
        </p>

        <div class="solution-edit-proposal-modal__actions">
          <AppButton type="button" variant="ghost" @click="$emit('close')">
            Отменить
          </AppButton>
          <AppButton type="submit" :disabled="createSolutionEditMutation.isPending.value">
            {{ createSolutionEditMutation.isPending.value ? 'Отправляем правку…' : 'Отправить правку' }}
          </AppButton>
        </div>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.solution-edit-proposal-modal {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
}

.solution-edit-proposal-modal__summary,
.solution-edit-proposal-modal__hint,
.solution-edit-proposal-modal__eyebrow,
.solution-edit-proposal-modal__title {
  margin: 0;
}

.solution-edit-proposal-modal__summary {
  padding: var(--space-md);
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
}

.solution-edit-proposal-modal__layout {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: var(--space-lg);
  min-width: 0;
}

.solution-edit-proposal-modal__reference,
.solution-edit-proposal-modal__main {
  align-content: start;
  min-width: 0;
}

.solution-edit-proposal-modal__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.solution-edit-proposal-modal__title {
  margin-top: var(--space-xs);
  font-size: 24px;
  line-height: 1.1;
}

.solution-edit-proposal-modal__main {
  display: grid;
  gap: var(--space-md);
  min-width: 0;
}

.solution-edit-proposal-modal__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.solution-edit-proposal-modal__tab {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  color: var(--color-text);
  font-weight: 600;
}

.solution-edit-proposal-modal__tab--active {
  border-color: rgb(14 116 144 / 0.24);
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
}

.solution-edit-proposal-modal__footer,
.solution-edit-proposal-modal__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.solution-edit-proposal-modal__hint {
  max-width: 52ch;
  color: var(--color-muted);
  line-height: 1.6;
}

.solution-edit-proposal-modal :deep(.markdown-composer__textarea),
.solution-edit-proposal-modal :deep(.markdown-composer__preview) {
  min-height: 420px;
}

@media (width <= 900px) {
  .solution-edit-proposal-modal__layout {
    grid-template-columns: 1fr;
  }
}
</style>
