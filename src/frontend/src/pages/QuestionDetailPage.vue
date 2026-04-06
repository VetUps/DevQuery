<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import CommentContextBlock from '@/features/comments/components/CommentContextBlock.vue'
import { useCommentContextQuery } from '@/features/comments/queries/useCommentContextQuery'
import QuestionDetailHero from '@/features/questions/components/QuestionDetailHero.vue'
import QuestionDetailSkeleton from '@/features/questions/components/QuestionDetailSkeleton.vue'
import { useQuestionDetailQuery } from '@/features/questions/queries/useQuestionDetailQuery'
import SolutionListSection from '@/features/solutions/components/SolutionListSection.vue'
import { useSolutionsQuery } from '@/features/solutions/queries/useSolutionsQuery'
import { usePublicProfileQuery } from '@/features/users/queries/usePublicProfileQuery'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const route = useRoute()

const questionId = computed(() => String(route.params.questionId ?? '').trim())
const questionDetailQuery = useQuestionDetailQuery(questionId)
const solutionsQuery = useSolutionsQuery(questionId)
const questionCommentsQuery = useCommentContextQuery('question', questionId)

const questionAuthorId = computed(() => questionDetailQuery.data.value?.user ?? '')
const questionAuthorQuery = usePublicProfileQuery(questionAuthorId)

const isPageLoading = computed(
  () => questionDetailQuery.isPending.value && !questionDetailQuery.data.value,
)
const hasPageError = computed(
  () => questionDetailQuery.isError.value || (!questionDetailQuery.isPending.value && !questionDetailQuery.data.value),
)

async function retryPage() {
  await Promise.allSettled([
    questionDetailQuery.refetch(),
    solutionsQuery.refetch(),
    questionCommentsQuery.refetch(),
  ])
}
</script>

<template>
  <AppShellLayout>
    <section class="question-detail-page">
      <div v-if="isPageLoading" class="question-detail-page__skeleton-stack">
        <QuestionDetailSkeleton />
        <ContentSkeleton :lines="2" />
      </div>

      <InlineFeedbackPanel
        v-else-if="hasPageError"
        eyebrow="Публичное чтение"
        title="Не удалось открыть вопрос"
        description="Не удалось загрузить данные. Попробуйте снова."
        :show-action="true"
        action-label="Попробовать снова"
        tone="danger"
        data-testid="question-detail-error"
        @action="retryPage"
      />

      <template v-else-if="questionDetailQuery.data.value">
        <QuestionDetailHero
          :question="questionDetailQuery.data.value"
          :author="questionAuthorQuery.data.value"
        />

        <CommentContextBlock
          title="Комментарии к вопросу"
          :comments="questionCommentsQuery.data.value?.comments ?? []"
          :is-pending="questionCommentsQuery.isPending.value"
          :is-error="questionCommentsQuery.isError.value"
          :has-more="questionCommentsQuery.data.value?.hasMore ?? false"
          @retry="questionCommentsQuery.refetch()"
        />

        <SolutionListSection
          :solutions="solutionsQuery.data.value ?? []"
          :is-pending="solutionsQuery.isPending.value"
          :is-error="solutionsQuery.isError.value"
          @retry="solutionsQuery.refetch()"
        />
      </template>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.question-detail-page {
  display: grid;
  gap: var(--space-xl);
}

.question-detail-page__skeleton-stack {
  display: grid;
  gap: var(--space-lg);
}
</style>
