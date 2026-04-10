<script setup lang="ts">
import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'
import type { SolutionEditGroup } from '@/features/solutions/libs/group-solution-edits'
import { formatDateTime } from '@/shared/libs/formatting'
import {
  formatSolutionEditStatus,
  resolveSolutionEditStatusTone,
} from '@/features/solutions/libs/solution-edit-status'

defineProps<{
  groups: SolutionEditGroup[]
}>()

defineEmits<{
  select: [item: SolutionEditRecord]
}>()
</script>

<template>
  <div class="profile-edit-review-grouped-list" data-testid="grouped-review-list">
    <section
      v-for="group in groups"
      :key="group.solutionId"
      class="profile-edit-review-grouped-list__group"
    >
      <header class="profile-edit-review-grouped-list__header">
        <div>
          <p class="profile-edit-review-grouped-list__eyebrow">{{ group.questionTitle }}</p>
          <h3 class="profile-edit-review-grouped-list__title">Решение с {{ group.items.length }} правками</h3>
        </div>
        <p class="profile-edit-review-grouped-list__excerpt">{{ group.solutionExcerpt }}</p>
      </header>

      <div class="profile-edit-review-grouped-list__items">
        <button
          v-for="item in group.items"
          :key="item.solution_edit_id"
          type="button"
          class="profile-edit-review-grouped-list__item"
          :data-testid="`grouped-review-item-${item.solution_edit_id}`"
          @click="$emit('select', item)"
        >
          <span class="profile-edit-review-grouped-list__author">{{ item.edit_author_name }}</span>
          <span
            class="profile-edit-review-grouped-list__status"
            :class="`profile-edit-review-grouped-list__status--${resolveSolutionEditStatusTone(item.solution_edit_is_approved)}`"
          >
            {{ formatSolutionEditStatus(item.solution_edit_is_approved) }}
          </span>
          <time :datetime="item.solution_edit_edited_at">
            {{ formatDateTime(item.solution_edit_edited_at) }}
          </time>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile-edit-review-grouped-list,
.profile-edit-review-grouped-list__group,
.profile-edit-review-grouped-list__header,
.profile-edit-review-grouped-list__items {
  display: grid;
}

.profile-edit-review-grouped-list {
  gap: var(--space-lg);
}

.profile-edit-review-grouped-list__group {
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.74);
}

.profile-edit-review-grouped-list__header,
.profile-edit-review-grouped-list__items {
  gap: var(--space-sm);
}

.profile-edit-review-grouped-list__eyebrow,
.profile-edit-review-grouped-list__title,
.profile-edit-review-grouped-list__excerpt {
  margin: 0;
}

.profile-edit-review-grouped-list__eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-edit-review-grouped-list__title {
  margin-top: 4px;
  font-size: 20px;
  line-height: 1.08;
}

.profile-edit-review-grouped-list__excerpt {
  color: var(--color-muted);
  line-height: 1.6;
}

.profile-edit-review-grouped-list__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-sm);
  align-items: center;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgb(207 198 180 / 0.62);
  border-radius: 999px;
  background: rgb(247 243 234 / 0.86);
  text-align: left;
}

.profile-edit-review-grouped-list__author {
  font-weight: 600;
}

.profile-edit-review-grouped-list__status {
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.profile-edit-review-grouped-list__status--pending {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.profile-edit-review-grouped-list__status--approved {
  background: rgb(47 133 90 / 0.12);
  color: #2F855A;
}

.profile-edit-review-grouped-list__status--rejected {
  background: rgb(180 35 24 / 0.12);
  color: #B42318;
}

@media (width <= 720px) {
  .profile-edit-review-grouped-list__item {
    grid-template-columns: 1fr;
    justify-items: start;
    padding: var(--space-md);
    border-radius: var(--radius-md);
  }
}
</style>
