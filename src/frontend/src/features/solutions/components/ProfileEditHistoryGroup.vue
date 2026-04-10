<script setup lang="ts">
import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'
import type { SolutionEditGroup } from '@/features/solutions/libs/group-solution-edits'
import { formatDateTime } from '@/shared/libs/formatting'
import {
  formatSolutionEditStatus,
  resolveSolutionEditStatusTone,
} from '@/features/solutions/libs/solution-edit-status'

defineProps<{
  group: SolutionEditGroup
}>()

defineEmits<{
  select: [item: SolutionEditRecord]
}>()
</script>

<template>
  <section class="profile-edit-history-group">
    <header class="profile-edit-history-group__header">
      <div>
        <p class="profile-edit-history-group__eyebrow">{{ group.questionTitle }}</p>
        <h3 class="profile-edit-history-group__title">История решения</h3>
      </div>
      <p class="profile-edit-history-group__excerpt">{{ group.solutionExcerpt }}</p>
    </header>

    <div class="profile-edit-history-group__timeline">
      <button
        v-for="item in group.items"
        :key="item.solution_edit_id"
        type="button"
        class="profile-edit-history-group__item"
        :data-testid="`history-item-${item.solution_edit_id}`"
        @click="$emit('select', item)"
      >
        <div class="profile-edit-history-group__copy">
          <strong>{{ item.edit_author_name }}</strong>
          <time :datetime="item.solution_edit_edited_at">
            {{ formatDateTime(item.solution_edit_edited_at) }}
          </time>
        </div>
        <span
          class="profile-edit-history-group__status"
          :class="`profile-edit-history-group__status--${resolveSolutionEditStatusTone(item.solution_edit_is_approved)}`"
        >
          {{ formatSolutionEditStatus(item.solution_edit_is_approved) }}
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.profile-edit-history-group,
.profile-edit-history-group__header,
.profile-edit-history-group__timeline {
  display: grid;
}

.profile-edit-history-group {
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.74);
}

.profile-edit-history-group__header,
.profile-edit-history-group__timeline {
  gap: var(--space-sm);
}

.profile-edit-history-group__eyebrow,
.profile-edit-history-group__title,
.profile-edit-history-group__excerpt {
  margin: 0;
}

.profile-edit-history-group__eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-edit-history-group__title {
  margin-top: 4px;
  font-size: 20px;
  line-height: 1.08;
}

.profile-edit-history-group__excerpt {
  color: var(--color-muted);
  line-height: 1.6;
}

.profile-edit-history-group__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-sm);
  align-items: center;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgb(207 198 180 / 0.62);
  border-radius: 999px;
  background: rgb(247 243 234 / 0.88);
  text-align: left;
}

.profile-edit-history-group__copy {
  display: grid;
  gap: 4px;
}

.profile-edit-history-group__copy time {
  color: var(--color-muted);
  font-size: 14px;
}

.profile-edit-history-group__status {
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.profile-edit-history-group__status--pending {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.profile-edit-history-group__status--approved {
  background: rgb(47 133 90 / 0.12);
  color: #2F855A;
}

.profile-edit-history-group__status--rejected {
  background: rgb(180 35 24 / 0.12);
  color: #B42318;
}

@media (width <= 720px) {
  .profile-edit-history-group__item {
    grid-template-columns: 1fr;
    justify-items: start;
    padding: var(--space-md);
    border-radius: var(--radius-md);
  }
}
</style>
