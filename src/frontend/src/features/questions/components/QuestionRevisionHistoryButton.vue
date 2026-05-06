<script setup lang="ts">
import { shallowRef } from 'vue'

import QuestionRevisionHistoryModal from '@/features/questions/components/QuestionRevisionHistoryModal.vue'
import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  questionId: string
}

defineProps<Props>()

const isHistoryOpen = shallowRef(false)

function openHistory() {
  isHistoryOpen.value = true
}

function closeHistory() {
  isHistoryOpen.value = false
}
</script>

<template>
  <div class="question-revision-history-button">
    <AppButton type="button" variant="ghost" data-testid="question-revision-history-open" @click="openHistory">
      История изменений
    </AppButton>

    <QuestionRevisionHistoryModal
      v-if="isHistoryOpen"
      :open="isHistoryOpen"
      :question-id="questionId"
      @close="closeHistory"
    />
  </div>
</template>

<style scoped>
.question-revision-history-button {
  display: flex;
  justify-content: flex-start;
  min-width: 0;
}

.question-revision-history-button :deep(.app-button) {
  color: var(--color-accent);
}
</style>
