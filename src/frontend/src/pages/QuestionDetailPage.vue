<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import CommentContextBlock from '@/features/comments/components/CommentContextBlock.vue'
import DiscussionThreadModal from '@/features/comments/components/DiscussionThreadModal.vue'
import { useCommentContextQuery } from '@/features/comments/queries/useCommentContextQuery'
import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import { useSessionStore } from '@/features/auth/stores/session'
import QuestionDetailHero from '@/features/questions/components/QuestionDetailHero.vue'
import QuestionDetailSkeleton from '@/features/questions/components/QuestionDetailSkeleton.vue'
import { useQuestionDetailQuery } from '@/features/questions/queries/useQuestionDetailQuery'
import SolutionComposerModal from '@/features/solutions/components/SolutionComposerModal.vue'
import SolutionComposerPrompt from '@/features/solutions/components/SolutionComposerPrompt.vue'
import SolutionExistingNotice from '@/features/solutions/components/SolutionExistingNotice.vue'
import type { CreateSolutionResponse } from '@/features/solutions/api/solutions'
import SolutionListSection from '@/features/solutions/components/SolutionListSection.vue'
import { useSolutionsQuery } from '@/features/solutions/queries/useSolutionsQuery'
import { usePublicProfileQuery } from '@/features/users/queries/usePublicProfileQuery'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const route = useRoute()
const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)

const questionId = computed(() => String(route.params.questionId ?? '').trim())
const questionDetailQuery = useQuestionDetailQuery(questionId)
const solutionsQuery = useSolutionsQuery(questionId)
const questionCommentsQuery = useCommentContextQuery('question', questionId)
const currentUserQuery = useCurrentUserQuery()

const questionAuthorId = computed(() => questionDetailQuery.data.value?.user ?? '')
const questionAuthorQuery = usePublicProfileQuery(questionAuthorId)

const isComposerOpen = ref(false)
const solutionSuccessMessage = ref('')
const freshSolutionId = ref<string | null>(null)
const activeInlineComposerKey = ref<string | null>(null)
const isQuestionDiscussionOpen = ref(false)

let clearFreshSolutionTimer: ReturnType<typeof setTimeout> | null = null

const isPageLoading = computed(
  () => questionDetailQuery.isPending.value && !questionDetailQuery.data.value,
)
const hasPageError = computed(
  () => questionDetailQuery.isError.value || (!questionDetailQuery.isPending.value && !questionDetailQuery.data.value),
)
const questionCreatedNotice = computed(() => route.query.message === 'question-created')
const currentUserId = computed(() => currentUserQuery.data.value?.user_id ?? '')
const currentUserSolution = computed(() =>
  (solutionsQuery.data.value ?? []).find((solution) => solution.user === currentUserId.value) ?? null,
)

async function retryPage() {
  await Promise.allSettled([
    questionDetailQuery.refetch(),
    solutionsQuery.refetch(),
    questionCommentsQuery.refetch(),
  ])
}

async function focusSolution(solutionId: string) {
  await nextTick()

  const target = document.getElementById(`solution-${solutionId}`)
  target?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

async function handleSolutionSubmitted(createdSolution: CreateSolutionResponse) {
  isComposerOpen.value = false
  solutionSuccessMessage.value = 'Решение добавлено. Мы перенесли вас к нему ниже.'
  freshSolutionId.value = createdSolution.solution_id

  await solutionsQuery.refetch()
  await focusSolution(createdSolution.solution_id)

  if (clearFreshSolutionTimer) {
    clearTimeout(clearFreshSolutionTimer)
  }

  clearFreshSolutionTimer = setTimeout(() => {
    freshSolutionId.value = null
  }, 2400)
}

watch(
  questionId,
  () => {
    isComposerOpen.value = false
    solutionSuccessMessage.value = ''
    freshSolutionId.value = null
    activeInlineComposerKey.value = null
    isQuestionDiscussionOpen.value = false

    if (clearFreshSolutionTimer) {
      clearTimeout(clearFreshSolutionTimer)
      clearFreshSolutionTimer = null
    }
  },
)

onBeforeUnmount(() => {
  if (clearFreshSolutionTimer) {
    clearTimeout(clearFreshSolutionTimer)
  }
})
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
        <p v-if="questionCreatedNotice" class="question-detail-page__notice">
          Вопрос опубликован. Теперь его могут увидеть другие разработчики.
        </p>

        <QuestionDetailHero
          :question="questionDetailQuery.data.value"
          :author="questionAuthorQuery.data.value"
          :current-user-id="currentUserId"
          :can-vote="isAuthenticated"
        />

        <CommentContextBlock
          title="Комментарии к вопросу"
          target-type="question"
          :target-id="questionId"
          :comments="questionCommentsQuery.data.value?.comments ?? []"
          composer-key-prefix="question"
          :active-composer-key="activeInlineComposerKey"
          :can-comment="isAuthenticated"
          :is-pending="questionCommentsQuery.isPending.value"
          :is-error="questionCommentsQuery.isError.value"
          :has-more="questionCommentsQuery.data.value?.hasMore ?? false"
          @retry="questionCommentsQuery.refetch()"
          @request-composer="activeInlineComposerKey = $event"
          @open-thread="isQuestionDiscussionOpen = true"
        />

        <SolutionListSection
          :solutions="solutionsQuery.data.value ?? []"
          :question-id="questionId"
          :viewer-user-id="currentUserId"
          :is-authenticated="isAuthenticated"
          :active-composer-key="activeInlineComposerKey"
          :is-pending="solutionsQuery.isPending.value"
          :is-error="solutionsQuery.isError.value"
          :success-message="solutionSuccessMessage"
          :fresh-solution-id="freshSolutionId"
          @retry="solutionsQuery.refetch()"
          @request-composer="activeInlineComposerKey = $event"
        >
          <template #authoring>
            <SolutionExistingNotice
              v-if="currentUserSolution"
              @focus-solution="focusSolution(currentUserSolution.solution_id)"
            />

            <SolutionComposerPrompt
              v-else-if="!isAuthenticated"
              title="Чтобы предложить решение, создайте аккаунт"
              action-label="Создать аккаунт"
              to="/register"
            />

            <SolutionComposerPrompt
              v-else
              title="Есть рабочее решение?"
              description="Откройте короткий модальный редактор и опишите ход мысли, код и технические оговорки."
              action-label="Написать решение"
              @action="isComposerOpen = true"
            />
          </template>
        </SolutionListSection>

        <SolutionComposerModal
          v-if="questionDetailQuery.data.value"
          :open="isComposerOpen"
          :question-id="questionId"
          :question-title="questionDetailQuery.data.value.question_title"
          @close="isComposerOpen = false"
          @submitted="handleSolutionSubmitted"
        />

        <DiscussionThreadModal
          v-if="isQuestionDiscussionOpen && questionDetailQuery.data.value"
          :open="isQuestionDiscussionOpen"
          title="Комментарии к вопросу"
          target-type="question"
          :target-id="questionId"
          context-eyebrow="Контекст вопроса"
          :context-title="questionDetailQuery.data.value.question_title"
          :context-body="questionDetailQuery.data.value.question_body"
          :can-comment="isAuthenticated"
          @close="isQuestionDiscussionOpen = false"
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

.question-detail-page__notice {
  margin: 0;
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(47 133 90 / 0.24);
  border-radius: var(--radius-md);
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
}
</style>
