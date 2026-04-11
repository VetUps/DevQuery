<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { SolutionListItem } from '@/features/solutions/api/solutions'
import CommentContextBlock from '@/features/comments/components/CommentContextBlock.vue'
import DiscussionThreadModal from '@/features/comments/components/DiscussionThreadModal.vue'
import { useCommentContextQuery } from '@/features/comments/queries/useCommentContextQuery'
import type { CreateSolutionEditResponse } from '@/features/solutions/api/solutionEdits'
import PublicSolutionEditHistoryButton from '@/features/solutions/components/PublicSolutionEditHistoryButton.vue'
import SolutionEditProposalModal from '@/features/solutions/components/SolutionEditProposalModal.vue'
import SignalVoteRail from '@/features/votes/components/SignalVoteRail.vue'
import { formatLongDate } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'

const props = defineProps<{
  solution: SolutionListItem
  questionId: string
  viewerUserId?: string
  isAuthenticated?: boolean
  activeComposerKey?: string | null
  featured?: boolean
  isFresh?: boolean
}>()

const emit = defineEmits<{
  requestComposer: [key: string | null]
}>()

const solutionId = computed(() => props.solution.solution_id)
const commentQuery = useCommentContextQuery('solution', solutionId)
const isDiscussionOpen = ref(false)
const isEditModalOpen = ref(false)
const editSuccessMessage = ref('')

const canSuggestEdit = computed(() => (
  Boolean(props.isAuthenticated) &&
  Boolean(props.viewerUserId) &&
  props.viewerUserId !== props.solution.user
))

watch(solutionId, () => {
  isDiscussionOpen.value = false
  isEditModalOpen.value = false
  editSuccessMessage.value = ''
})

function handleEditSubmitted(_createdEdit: CreateSolutionEditResponse) {
  isEditModalOpen.value = false
  editSuccessMessage.value = 'Правка отправлена на проверку'
}
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
      <div class="solution-read-card__identity">
        <p class="solution-read-card__eyebrow">
          {{ featured ? 'Развёрнутое решение' : 'Решение' }}
        </p>
        <div class="solution-read-card__meta">
          <strong class="solution-read-card__author">
            {{ solution.user_name || 'Автор решения' }}
          </strong>
          <span class="solution-read-card__meta-separator" aria-hidden="true">•</span>
          <p class="solution-read-card__stamp">
            Обновлено {{ formatLongDate(solution.solution_updated_at) }}
          </p>
        </div>
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

      <SignalVoteRail
        :mode="isAuthenticated ? 'interactive' : 'readonly'"
        :score="solution.score"
        :upvotes="solution.upvotes"
        :downvotes="solution.downvotes"
        :user-vote="solution.user_vote"
        target-type="solution"
        :target-id="solution.solution_id"
        :question-id="questionId"
        :is-own-content="Boolean(viewerUserId) && solution.user === viewerUserId"
        label="Оценка решения"
      />
    </div>

    <div class="solution-read-card__actions">
      <PublicSolutionEditHistoryButton :solution-id="solution.solution_id" />

      <AppButton
        v-if="canSuggestEdit && !editSuccessMessage"
        variant="secondary"
        @click="isEditModalOpen = true"
      >
        Предложить правку
      </AppButton>

      <p v-else class="solution-read-card__edit-success">
        {{ editSuccessMessage }}
      </p>
    </div>

    <CommentContextBlock
      title="Комментарии к решению"
      target-type="solution"
      :target-id="solutionId"
      :comments="commentQuery.data.value?.comments ?? []"
      :count="commentQuery.data.value?.count ?? 0"
      :composer-key-prefix="`solution:${solution.solution_id}`"
      :active-composer-key="activeComposerKey"
      :can-comment="isAuthenticated"
      :is-pending="commentQuery.isPending.value"
      :is-error="commentQuery.isError.value"
      :has-more="commentQuery.data.value?.hasMore ?? false"
      @retry="commentQuery.refetch()"
      @request-composer="$emit('requestComposer', $event)"
      @open-thread="isDiscussionOpen = true"
    />

    <DiscussionThreadModal
      v-if="isDiscussionOpen"
      :open="isDiscussionOpen"
      title="Комментарии к решению"
      target-type="solution"
      :target-id="solutionId"
      context-eyebrow="Контекст решения"
      :context-title="solution.solution_is_best ? 'Лучшее решение' : 'Решение автора'"
      :context-body="solution.solution_body"
      :can-comment="isAuthenticated"
      @close="isDiscussionOpen = false"
    />

    <SolutionEditProposalModal
      v-if="isEditModalOpen"
      :open="isEditModalOpen"
      :solution-id="solution.solution_id"
      :original-body="solution.solution_body"
      @close="isEditModalOpen = false"
      @submitted="handleEditSubmitted"
    />
  </article>
</template>

<style scoped>
.solution-read-card {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
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
.solution-read-card__content,
.solution-read-card__actions {
  display: grid;
  gap: var(--space-md);
  min-width: 0;
}

.solution-read-card__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.solution-read-card__content {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
  align-items: start;
}

.solution-read-card__eyebrow,
.solution-read-card__body,
.solution-read-card__author,
.solution-read-card__stamp {
  margin: 0;
}

.solution-read-card__identity,
.solution-read-card__meta {
  gap: var(--space-xs);
  min-width: 0;
}

.solution-read-card__identity {
  display: grid;
}

.solution-read-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs) 8px;
}

.solution-read-card__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.solution-read-card__author {
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.solution-read-card__meta-separator,
.solution-read-card__stamp {
  color: var(--color-muted);
  font-size: 14px;
  overflow-wrap: anywhere;
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
  min-width: 0;
  line-height: 1.7;
}

.solution-read-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid rgb(207 198 180 / 0.62);
}

.solution-read-card__edit-success {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid rgb(47 133 90 / 0.24);
  border-radius: 999px;
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
  font-size: 14px;
  font-weight: 600;
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

  .solution-read-card__header {
    grid-template-columns: 1fr;
  }
}

@media (width <= 640px) {
  .solution-read-card {
    padding: var(--space-lg);
  }
}
</style>
