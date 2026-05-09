<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import CommentContextBlock from '@/features/comments/components/CommentContextBlock.vue'
import DiscussionThreadModal from '@/features/comments/components/DiscussionThreadModal.vue'
import { useCommentContextQuery } from '@/features/comments/queries/useCommentContextQuery'
import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import { useSessionStore } from '@/features/auth/stores/session'
import type { NotificationItem } from '@/features/notifications/api/notifications'
import { useNotificationsQuery } from '@/features/notifications/queries/useNotificationsQuery'
import QuestionDetailHero from '@/features/questions/components/QuestionDetailHero.vue'
import QuestionExpertInvitationPanel from '@/features/questions/components/QuestionExpertInvitationPanel.vue'
import QuestionInvitationContextPanel from '@/features/questions/components/QuestionInvitationContextPanel.vue'
import QuestionRevisionHistoryButton from '@/features/questions/components/QuestionRevisionHistoryButton.vue'
import QuestionEditProposalModal from '@/features/questions/components/QuestionEditProposalModal.vue'
import QuestionDetailSkeleton from '@/features/questions/components/QuestionDetailSkeleton.vue'
import QuestionEditForm from '@/features/questions/components/QuestionEditForm.vue'
import type { QuestionEditRecord } from '@/features/questions/api/questionEdits'
import type { QuestionDetail } from '@/features/questions/api/questions'
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
import AppDialog from '@/shared/ui/AppDialog.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const route = useRoute()
const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)

const questionId = computed(() => String(route.params.questionId ?? '').trim())
const questionDetailQuery = useQuestionDetailQuery(questionId)
const solutionsQuery = useSolutionsQuery(questionId)
const questionCommentsQuery = useCommentContextQuery('question', questionId)
const currentUserQuery = useCurrentUserQuery()
const notificationsQuery = useNotificationsQuery(isAuthenticated.value)

const questionAuthorId = computed(() => questionDetailQuery.data.value?.user ?? '')
const questionAuthorQuery = usePublicProfileQuery(questionAuthorId)

const isComposerOpen = ref(false)
const isQuestionEditOpen = ref(false)
const isQuestionProposalOpen = ref(false)
const questionEditSuccessMessage = ref('')
const questionProposalSuccessMessage = ref('')
const solutionSuccessMessage = ref('')
const freshSolutionId = ref<string | null>(null)
const activeInlineComposerKey = ref<string | null>(null)
const isQuestionDiscussionOpen = ref(false)
const isExpertInvitationOpen = ref(false)

let clearFreshSolutionTimer: ReturnType<typeof setTimeout> | null = null

const isPageLoading = computed(
  () => questionDetailQuery.isPending.value && !questionDetailQuery.data.value,
)
const hasPageError = computed(
  () => questionDetailQuery.isError.value || (!questionDetailQuery.isPending.value && !questionDetailQuery.data.value),
)
const questionCreatedNotice = computed(() => route.query.message === 'question-created')
const currentUserId = computed(() => currentUserQuery.data.value?.user_id ?? '')
const isQuestionAuthor = computed(() => Boolean(currentUserId.value) && currentUserId.value === questionAuthorId.value)
const canEditQuestion = computed(
  () => isQuestionAuthor.value && !currentUserQuery.isPending.value && !currentUserQuery.isError.value,
)
const canProposeQuestionEdit = computed(
  () =>
    Boolean(currentUserId.value) &&
    !isQuestionAuthor.value &&
    !currentUserQuery.isPending.value &&
    !currentUserQuery.isError.value,
)
const canShowExpertInvitationPanel = computed(
  () =>
    isQuestionAuthor.value &&
    !currentUserQuery.isPending.value &&
    !currentUserQuery.isError.value &&
    Boolean(questionDetailQuery.data.value?.is_protected),
)
const canShowInvitationContextPanel = computed(
  () => isAuthenticated.value && !isQuestionAuthor.value && Boolean(questionDetailQuery.data.value?.is_protected),
)
const matchingExpertInvitation = computed<NotificationItem | null>(() => {
  const question = questionDetailQuery.data.value

  if (!question || !canShowInvitationContextPanel.value) {
    return null
  }

  return notificationsQuery.data.value?.results.find(
    (notification) =>
      notification.notification_type === 'expert_invitation' &&
      notification.source_question_id === question.question_id,
  ) ?? null
})
const currentUserSolution = computed(() =>
  (solutionsQuery.data.value ?? []).find((solution) => solution.user === currentUserId.value) ?? null,
)
const answerProgressHint = computed(() => {
  const question = questionDetailQuery.data.value
  if (!question || question.viewer_can_answer) {
    return ''
  }

  const levelLabel = question.viewer_level_label ?? question.viewer_level ?? 'Текущий уровень'
  const nextLevelLabel = question.viewer_next_level_label ?? question.viewer_next_level
  const points = question.viewer_points_to_next_level

  if (typeof points === 'number' && points > 0 && nextLevelLabel) {
    return `${levelLabel}: не хватает ${points} очков до уровня ${nextLevelLabel}.`
  }

  if (levelLabel) {
    return `Сейчас ваш уровень: ${levelLabel}.`
  }

  return ''
})

async function retryPage() {
  await Promise.allSettled([
    questionDetailQuery.refetch(),
    solutionsQuery.refetch(),
    questionCommentsQuery.refetch(),
  ])
}

function openQuestionEdit() {
  questionEditSuccessMessage.value = ''
  questionProposalSuccessMessage.value = ''
  isQuestionEditOpen.value = true
}

function closeQuestionEdit() {
  isQuestionEditOpen.value = false
}

function openQuestionProposal() {
  questionEditSuccessMessage.value = ''
  questionProposalSuccessMessage.value = ''
  isQuestionProposalOpen.value = true
}

function closeQuestionProposal() {
  isQuestionProposalOpen.value = false
}

function openExpertInvitation() {
  if (!canShowExpertInvitationPanel.value) {
    return
  }

  isExpertInvitationOpen.value = true
}

function closeExpertInvitation() {
  isExpertInvitationOpen.value = false
}

async function handleQuestionEditSaved(_updatedQuestion: QuestionDetail) {
  await questionDetailQuery.refetch()
  isQuestionEditOpen.value = false
  questionEditSuccessMessage.value = 'Изменения сохранены. Вопрос обновлён данными с сервера.'
}

function handleQuestionProposalSubmitted(_createdEdit: QuestionEditRecord) {
  isQuestionProposalOpen.value = false
  questionProposalSuccessMessage.value = 'Правка отправлена на проверку автору вопроса.'
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
    isQuestionEditOpen.value = false
    isQuestionProposalOpen.value = false
    questionEditSuccessMessage.value = ''
    questionProposalSuccessMessage.value = ''
    solutionSuccessMessage.value = ''
    freshSolutionId.value = null
    activeInlineComposerKey.value = null
    isQuestionDiscussionOpen.value = false
    isExpertInvitationOpen.value = false

    if (clearFreshSolutionTimer) {
      clearTimeout(clearFreshSolutionTimer)
      clearFreshSolutionTimer = null
    }
  },
)

watch(
  canShowExpertInvitationPanel,
  (canShow) => {
    if (!canShow) {
      isExpertInvitationOpen.value = false
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

        <p v-if="questionEditSuccessMessage" class="question-detail-page__notice" role="status">
          {{ questionEditSuccessMessage }}
        </p>

        <p v-if="questionProposalSuccessMessage" class="question-detail-page__notice" role="status">
          {{ questionProposalSuccessMessage }}
        </p>

        <QuestionDetailHero
          :question="questionDetailQuery.data.value"
          :author="questionAuthorQuery.data.value"
          :current-user-id="currentUserId"
          :can-vote="isAuthenticated"
          :can-edit="canEditQuestion"
          :can-propose-edit="canProposeQuestionEdit"
          :can-invite-experts="canShowExpertInvitationPanel"
          @request-edit="openQuestionEdit"
          @request-proposal="openQuestionProposal"
          @request-expert-invitation="openExpertInvitation"
        />

        <QuestionInvitationContextPanel
          v-if="canShowInvitationContextPanel"
          :question="questionDetailQuery.data.value"
          :matching-invitation="matchingExpertInvitation"
          :is-author="isQuestionAuthor"
          :is-authenticated="isAuthenticated"
          :notifications-pending="notificationsQuery.isPending.value"
          :notifications-error="notificationsQuery.isError.value"
        />

        <QuestionRevisionHistoryButton :question-id="questionId" />

        <CommentContextBlock
          title="Комментарии к вопросу"
          target-type="question"
          :target-id="questionId"
          :comments="questionCommentsQuery.data.value?.comments ?? []"
          :count="questionCommentsQuery.data.value?.count ?? 0"
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
          :can-mark-best="isQuestionAuthor"
          :active-composer-key="activeInlineComposerKey"
          :is-pending="solutionsQuery.isPending.value"
          :is-error="solutionsQuery.isError.value"
          :success-message="solutionSuccessMessage"
          :fresh-solution-id="freshSolutionId"
          @retry="solutionsQuery.refetch()"
          @request-composer="activeInlineComposerKey = $event"
        >
          <template #authoring>
            <p
              v-if="isQuestionAuthor"
              class="question-detail-page__author-note"
            >
              Вы автор вопроса, поэтому не можете публиковать своё решение. Выберите лучший ответ среди решений сообщества.
            </p>

            <SolutionExistingNotice
              v-else-if="currentUserSolution"
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
              :title="questionDetailQuery.data.value.viewer_can_answer ? 'Есть рабочее решение?' : 'Ответ временно ограничен'"
              :description="questionDetailQuery.data.value.viewer_can_answer
                ? 'Откройте короткий модальный редактор и опишите ход мысли, код и технические оговорки.'
                : 'Вопрос остаётся доступным для чтения, но новые ответы на старте проходят через защиту новичков.'"
              action-label="Написать решение"
              :blocked="!questionDetailQuery.data.value.viewer_can_answer"
              :blocked-reason="questionDetailQuery.data.value.viewer_answer_reason_message"
              :progress-hint="answerProgressHint"
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

        <QuestionEditProposalModal
          v-if="questionDetailQuery.data.value"
          :open="isQuestionProposalOpen"
          :question="questionDetailQuery.data.value"
          @close="closeQuestionProposal"
          @submitted="handleQuestionProposalSubmitted"
        />

        <AppDialog
          v-if="questionDetailQuery.data.value"
          :open="isQuestionEditOpen"
          title="Редактировать вопрос"
          :description="`Измените текст и теги вопроса: ${questionDetailQuery.data.value.question_title}`"
          size="wide"
          @close="closeQuestionEdit"
        >
          <QuestionEditForm
            :question="questionDetailQuery.data.value"
            @saved="handleQuestionEditSaved"
          />
        </AppDialog>

        <AppDialog
          v-if="questionDetailQuery.data.value"
          :open="isExpertInvitationOpen && canShowExpertInvitationPanel"
          title="Позвать эксперта"
          :description="`Выберите экспертов и мастеров для защищённого вопроса: ${questionDetailQuery.data.value.question_title}`"
          size="wide"
          data-testid="question-expert-invitation-dialog"
          @close="closeExpertInvitation"
        >
          <QuestionExpertInvitationPanel
            v-if="isExpertInvitationOpen && canShowExpertInvitationPanel"
            :question-id="questionId"
            :enabled="isExpertInvitationOpen && canShowExpertInvitationPanel"
          />
        </AppDialog>

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
  min-width: 0;
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

.question-detail-page__author-note {
  margin: 0;
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-md);
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
  line-height: 1.6;
}
</style>
