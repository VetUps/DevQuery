<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/shared/ui/AppButton.vue'

import PublicSolutionEditHistoryModal from './PublicSolutionEditHistoryModal.vue'

defineProps<{
  solutionId: string
}>()

const isOpen = ref(false)
</script>

<template>
  <div class="public-solution-edit-history-button">
    <AppButton
      type="button"
      variant="secondary"
      data-testid="public-history-button"
      @click="isOpen = true"
    >
      История изменений
    </AppButton>

    <PublicSolutionEditHistoryModal
      :open="isOpen"
      :solution-id="solutionId"
      @close="isOpen = false"
    />
  </div>
</template>
