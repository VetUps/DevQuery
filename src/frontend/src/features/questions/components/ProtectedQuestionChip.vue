<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, shallowRef } from 'vue'

import {
  getProtectedQuestionWindowHours,
  getProtectedQuestionWindowLabel,
  type QuestionListItem,
} from '@/features/questions/api/questions'
import ProtectedQuestionInfoDialog from '@/features/questions/components/ProtectedQuestionInfoDialog.vue'

type ProtectedQuestionDisclosure = Pick<
  QuestionListItem,
  | 'question_created_at'
  | 'protected_until'
  | 'viewer_answer_required_level_label'
>

const props = withDefaults(defineProps<{
  question: ProtectedQuestionDisclosure
  testId?: string
}>(), {
  testId: 'protected-question-chip',
})

const isDialogOpen = shallowRef(false)
const windowHours = computed(() => getProtectedQuestionWindowHours(props.question))
const windowLabel = computed(() => getProtectedQuestionWindowLabel(windowHours.value))
const chipLabel = computed(() => `Защита ${windowLabel.value}`)

function openDialog() {
  isDialogOpen.value = true
}

function closeDialog() {
  isDialogOpen.value = false
}
</script>

<template>
  <button
    type="button"
    class="protected-question-chip"
    :data-testid="testId"
    :aria-label="`${chipLabel}. Открыть объяснение защиты вопроса`"
    @click="openDialog"
  >
    {{ chipLabel }}
  </button>

  <ProtectedQuestionInfoDialog
    :question="question"
    :open="isDialogOpen"
    @close="closeDialog"
  />
</template>

<style scoped>
.protected-question-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgb(180 35 24 / 0.18);
  border-radius: 999px;
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.16s ease,
    box-shadow 0.2s ease;
}

.protected-question-chip:hover {
  border-color: rgb(180 35 24 / 0.32);
  background: rgb(180 35 24 / 0.12);
  color: #8F1D14;
  box-shadow: 0 10px 22px rgb(180 35 24 / 0.1);
}

.protected-question-chip:focus-visible {
  outline: 3px solid rgb(14 116 144 / 0.24);
  outline-offset: 3px;
}

.protected-question-chip:active {
  transform: scale(0.97);
}
</style>
