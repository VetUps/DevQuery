<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'
import ProfileEditReviewGroupedList from '@/features/solutions/components/ProfileEditReviewGroupedList.vue'
import ProfileEditReviewList from '@/features/solutions/components/ProfileEditReviewList.vue'
import ProfileEditReviewModal from '@/features/solutions/components/ProfileEditReviewModal.vue'
import { groupSolutionEditsBySolution } from '@/features/solutions/libs/group-solution-edits'
import { useReviewQueueQuery } from '@/features/solutions/queries/useReviewQueueQuery'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

type ReviewMode = 'all' | 'grouped'

const reviewQueueQuery = useReviewQueueQuery()

const activeMode = ref<ReviewMode>('all')
const selectedEdit = ref<SolutionEditRecord | null>(null)
const successMessage = ref('')

const items = computed(() => {
  const queue = reviewQueueQuery.data.value ?? []

  return [...queue].sort((left, right) => (
    new Date(right.solution_edit_edited_at).getTime() -
    new Date(left.solution_edit_edited_at).getTime()
  ))
})

const groupedItems = computed(() => groupSolutionEditsBySolution(items.value))

function openEdit(item: SolutionEditRecord) {
  successMessage.value = ''
  selectedEdit.value = item
}

function handleModerated(approved: boolean) {
  selectedEdit.value = null
  successMessage.value = approved ? 'Правка одобрена.' : 'Правка отклонена.'
}
</script>

<template>
  <section class="profile-edit-review-queue" data-testid="profile-edit-review-queue">
    <header class="profile-edit-review-queue__header">
      <div>
        <p class="profile-edit-review-queue__eyebrow">Проверка правок</p>
        <h2 class="profile-edit-review-queue__title">Входящие предложения к вашим решениям</h2>
      </div>

      <div class="profile-edit-review-queue__modes">
        <button
          type="button"
          class="profile-edit-review-queue__mode"
          :class="{ 'profile-edit-review-queue__mode--active': activeMode === 'all' }"
          data-testid="review-mode-all"
          @click="activeMode = 'all'"
        >
          Все правки
        </button>
        <button
          type="button"
          class="profile-edit-review-queue__mode"
          :class="{ 'profile-edit-review-queue__mode--active': activeMode === 'grouped' }"
          data-testid="review-mode-grouped"
          @click="activeMode = 'grouped'"
        >
          По решениям
        </button>
      </div>
    </header>

    <p v-if="successMessage" class="profile-edit-review-queue__success">{{ successMessage }}</p>

    <InlineFeedbackPanel
      v-if="reviewQueueQuery.isError.value"
      eyebrow="Проверка правок"
      title="Не удалось загрузить очередь"
      description="Попробуйте запросить данные ещё раз."
      tone="danger"
      :show-action="true"
      data-testid="review-queue-error"
      @action="reviewQueueQuery.refetch()"
    />

    <p v-else-if="reviewQueueQuery.isPending.value && !items.length" class="profile-edit-review-queue__muted">
      Загружаем очередь правок...
    </p>

    <p v-else-if="!items.length" class="profile-edit-review-queue__muted">
      Пока здесь нет ожидающих правок.
    </p>

    <ProfileEditReviewList
      v-else-if="activeMode === 'all'"
      :items="items"
      @select="openEdit"
    />

    <ProfileEditReviewGroupedList
      v-else
      :groups="groupedItems"
      @select="openEdit"
    />

    <ProfileEditReviewModal
      v-if="selectedEdit"
      :open="Boolean(selectedEdit)"
      :edit="selectedEdit"
      @close="selectedEdit = null"
      @moderated="handleModerated"
    />
  </section>
</template>

<style scoped>
.profile-edit-review-queue,
.profile-edit-review-queue__header {
  display: grid;
  gap: var(--space-md);
}

.profile-edit-review-queue__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.profile-edit-review-queue__eyebrow,
.profile-edit-review-queue__title,
.profile-edit-review-queue__success,
.profile-edit-review-queue__muted {
  margin: 0;
}

.profile-edit-review-queue__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-edit-review-queue__title {
  margin-top: 4px;
  font-size: 26px;
  line-height: 1.06;
}

.profile-edit-review-queue__modes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.profile-edit-review-queue__mode {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.88);
  color: var(--color-text);
  font-weight: 600;
}

.profile-edit-review-queue__mode--active {
  border-color: rgb(14 116 144 / 0.22);
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
}

.profile-edit-review-queue__success {
  padding: var(--space-md);
  border: 1px solid rgb(47 133 90 / 0.22);
  border-radius: var(--radius-md);
  background: rgb(47 133 90 / 0.08);
  color: #2F855A;
  font-weight: 600;
}

.profile-edit-review-queue__muted {
  color: var(--color-muted);
}

@media (width <= 900px) {
  .profile-edit-review-queue__header {
    grid-template-columns: 1fr;
  }
}
</style>
