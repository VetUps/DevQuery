<script setup lang="ts">
import { computed } from 'vue'

import type { SolutionListItem } from '@/features/solutions/api/solutions'
import ReadOnlyVoteBlock from '@/features/questions/components/ReadOnlyVoteBlock.vue'
import CommentContextBlock from '@/features/comments/components/CommentContextBlock.vue'
import { useCommentContextQuery } from '@/features/comments/queries/useCommentContextQuery'
import { formatLongDate } from '@/shared/libs/formatting'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'

const props = defineProps<{
  solution: SolutionListItem
  featured?: boolean
  isFresh?: boolean
}>()

const solutionId = computed(() => props.solution.solution_id)
const commentQuery = useCommentContextQuery('solution', solutionId)
</script>

<template>
  <article
    :id="`solution-${solution.solution_id}`"
    class="solution-read-card"
    :class="{
      'solution-read-card--featured': featured,
      'solution-read-card--fresh': isFresh,
    }"
  >
    <div class="solution-read-card__header">
      <div>
        <p class="solution-read-card__eyebrow">
          {{ featured ? 'Развёрнутое решение' : 'Решение' }}
        </p>
        <p class="solution-read-card__stamp">
          Обновлено {{ formatLongDate(solution.solution_updated_at) }}
        </p>
      </div>

      <span
        v-if="solution.solution_is_best"
        class="solution-read-card__best"
      >
        Лучшее решение
      </span>
    </div>

    <div class="solution-read-card__content">
      <div class="solution-read-card__body">
        <MarkdownContent :source="solution.solution_body" />
      </div>

      <ReadOnlyVoteBlock
        :score="solution.score"
        :upvotes="solution.upvotes"
        :downvotes="solution.downvotes"
        :user-vote="solution.user_vote"
        label="Оценка решения"
      />
    </div>

    <CommentContextBlock
      title="Комментарии к решению"
      :comments="commentQuery.data.value?.comments ?? []"
      :is-pending="commentQuery.isPending.value"
      :is-error="commentQuery.isError.value"
      :has-more="commentQuery.data.value?.hasMore ?? false"
      @retry="commentQuery.refetch()"
    />
  </article>
</template>

<style scoped>
.solution-read-card {
  display: grid;
  gap: var(--space-lg);
  padding: var(--space-xl);
  border: 1px solid rgb(207 198 180 / 0.76);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.58);
}

.solution-read-card--featured {
  background: linear-gradient(180deg, rgb(255 255 255 / 0.82), rgb(247 243 234 / 0.9));
}

.solution-read-card--fresh {
  animation: solution-fresh-highlight 2.4s ease;
  box-shadow:
    0 0 0 1px rgb(47 133 90 / 0.28),
    0 0 0 8px rgb(47 133 90 / 0.08);
}

.solution-read-card__header,
.solution-read-card__content {
  display: grid;
  gap: var(--space-md);
}

.solution-read-card__content {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
  align-items: start;
}

.solution-read-card__eyebrow,
.solution-readCard__stamp,
.solution-read-card__body {
  margin: 0;
}

.solution-read-card__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.solution-read-card__stamp {
  margin: 0;
  color: var(--color-muted);
  font-size: 14px;
}

.solution-read-card__best {
  justify-self: start;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
  font-size: 14px;
  font-weight: 600;
}

.solution-read-card__body {
  line-height: 1.7;
}

@keyframes solution-fresh-highlight {
  0% {
    box-shadow:
      0 0 0 1px rgb(47 133 90 / 0.42),
      0 0 0 12px rgb(47 133 90 / 0.14);
  }

  100% {
    box-shadow:
      0 0 0 1px rgb(47 133 90 / 0.28),
      0 0 0 8px rgb(47 133 90 / 0.08);
  }
}

@media (width <= 900px) {
  .solution-read-card__content {
    grid-template-columns: 1fr;
  }
}

@media (width <= 640px) {
  .solution-read-card {
    padding: var(--space-lg);
  }
}
</style>
