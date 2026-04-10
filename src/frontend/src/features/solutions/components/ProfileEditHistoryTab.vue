<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'
import ProfileEditHistoryGroup from '@/features/solutions/components/ProfileEditHistoryGroup.vue'
import ProfileEditReviewModal from '@/features/solutions/components/ProfileEditReviewModal.vue'
import { groupSolutionEditsBySolution } from '@/features/solutions/libs/group-solution-edits'
import { useMyEditHistoryQuery } from '@/features/solutions/queries/useMyEditHistoryQuery'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const myEditHistoryQuery = useMyEditHistoryQuery()
const selectedEdit = ref<SolutionEditRecord | null>(null)

const items = computed(() => {
  const historyItems = myEditHistoryQuery.data.value ?? []

  return [...historyItems].sort((left, right) => (
    new Date(right.solution_edit_edited_at).getTime() -
    new Date(left.solution_edit_edited_at).getTime()
  ))
})

const groupedItems = computed(() => groupSolutionEditsBySolution(items.value))
</script>

<template>
  <section class="profile-edit-history-tab" data-testid="profile-edit-history-tab">
    <header class="profile-edit-history-tab__header">
      <p class="profile-edit-history-tab__eyebrow">История правок</p>
      <h2 class="profile-edit-history-tab__title">Изменения по вашим решениям</h2>
    </header>

    <InlineFeedbackPanel
      v-if="myEditHistoryQuery.isError.value"
      eyebrow="История правок"
      title="Не удалось загрузить историю"
      description="Попробуйте запросить данные ещё раз."
      tone="danger"
      :show-action="true"
      data-testid="edit-history-error"
      @action="myEditHistoryQuery.refetch()"
    />

    <p v-else-if="myEditHistoryQuery.isPending.value && !items.length" class="profile-edit-history-tab__muted">
      Загружаем историю правок...
    </p>

    <p v-else-if="!items.length" class="profile-edit-history-tab__muted">
      Пока по вашим решениям ещё нет обработанных правок.
    </p>

    <div v-else class="profile-edit-history-tab__groups">
      <ProfileEditHistoryGroup
        v-for="group in groupedItems"
        :key="group.solutionId"
        :group="group"
        @select="selectedEdit = $event"
      />
    </div>

    <ProfileEditReviewModal
      v-if="selectedEdit"
      :open="Boolean(selectedEdit)"
      :edit="selectedEdit"
      :readonly="true"
      @close="selectedEdit = null"
    />
  </section>
</template>

<style scoped>
.profile-edit-history-tab,
.profile-edit-history-tab__header,
.profile-edit-history-tab__groups {
  display: grid;
}

.profile-edit-history-tab {
  gap: var(--space-md);
}

.profile-edit-history-tab__header,
.profile-edit-history-tab__groups {
  gap: var(--space-sm);
}

.profile-edit-history-tab__eyebrow,
.profile-edit-history-tab__title,
.profile-edit-history-tab__muted {
  margin: 0;
}

.profile-edit-history-tab__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-edit-history-tab__title {
  font-size: 26px;
  line-height: 1.06;
}

.profile-edit-history-tab__muted {
  color: var(--color-muted);
}
</style>
