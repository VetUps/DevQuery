<script setup lang="ts">
import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'
import { formatDateTime } from '@/shared/libs/formatting'
import {
  formatSolutionEditStatus,
  resolveSolutionEditStatusTone,
} from '@/features/solutions/libs/solution-edit-status'

defineProps<{
  items: SolutionEditRecord[]
}>()

defineEmits<{
  select: [item: SolutionEditRecord]
}>()
</script>

<template>
  <div class="profile-edit-review-list" data-testid="review-list">
    <button
      v-for="item in items"
      :key="item.solution_edit_id"
      type="button"
      class="profile-edit-review-list__item"
      :data-testid="`review-item-${item.solution_edit_id}`"
      @click="$emit('select', item)"
    >
      <div class="profile-edit-review-list__copy">
        <p class="profile-edit-review-list__eyebrow">{{ item.solution_question_title }}</p>
        <h3 class="profile-edit-review-list__title">Правка от {{ item.edit_author_name }}</h3>
        <p class="profile-edit-review-list__excerpt">{{ item.solution_excerpt }}</p>
      </div>

      <div class="profile-edit-review-list__meta">
        <span
          class="profile-edit-review-list__status"
          :class="`profile-edit-review-list__status--${resolveSolutionEditStatusTone(item.solution_edit_is_approved)}`"
        >
          {{ formatSolutionEditStatus(item.solution_edit_is_approved) }}
        </span>
        <time class="profile-edit-review-list__time" :datetime="item.solution_edit_edited_at">
          {{ formatDateTime(item.solution_edit_edited_at) }}
        </time>
      </div>
    </button>
  </div>
</template>

<style scoped>
.profile-edit-review-list,
.profile-edit-review-list__item,
.profile-edit-review-list__copy,
.profile-edit-review-list__meta {
  display: grid;
  min-width: 0;
}

.profile-edit-review-list {
  gap: var(--space-sm);
}

.profile-edit-review-list__item {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-md);
  align-items: start;
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.76);
  text-align: left;
}

.profile-edit-review-list__copy {
  gap: 6px;
  min-width: 0;
}

.profile-edit-review-list__meta {
  gap: 8px;
  justify-items: end;
}

.profile-edit-review-list__eyebrow,
.profile-edit-review-list__title,
.profile-edit-review-list__excerpt,
.profile-edit-review-list__time {
  margin: 0;
  overflow-wrap: anywhere;
}

.profile-edit-review-list__eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-edit-review-list__title {
  font-size: 20px;
  line-height: 1.08;
}

.profile-edit-review-list__excerpt,
.profile-edit-review-list__time {
  color: var(--color-muted);
  line-height: 1.5;
}

.profile-edit-review-list__status {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.profile-edit-review-list__status--pending {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.profile-edit-review-list__status--approved {
  background: rgb(47 133 90 / 0.12);
  color: #2F855A;
}

.profile-edit-review-list__status--rejected {
  background: rgb(180 35 24 / 0.12);
  color: #B42318;
}

@media (width <= 720px) {
  .profile-edit-review-list__item {
    grid-template-columns: 1fr;
  }

  .profile-edit-review-list__meta {
    justify-items: start;
  }
}
</style>
