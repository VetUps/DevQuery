<script setup lang="ts">
import { computed } from 'vue'

import {
  getProtectedQuestionAnswerWindowLabel,
  getProtectedQuestionAnswerWindowSummary,
  type QuestionDetail,
} from '@/features/questions/api/questions'
import type { PublicUserProfile } from '@/features/users/api/publicProfiles'
import QuestionTagChips from '@/features/questions/components/QuestionTagChips.vue'
import AuthorReputationBadge from '@/features/users/components/AuthorReputationBadge.vue'
import SignalVoteRail from '@/features/votes/components/SignalVoteRail.vue'
import { formatLongDate, formatQuestionStatus } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'

const props = defineProps<{
  question: QuestionDetail
  author: PublicUserProfile | null | undefined
  currentUserId?: string
  canVote?: boolean
  canEdit?: boolean
  canProposeEdit?: boolean
}>()

const emit = defineEmits<{
  requestEdit: []
  requestProposal: []
}>()

const protectionBadgeLabel = computed(() => {
  if (!props.question.is_protected) {
    return ''
  }

  return `Защищённый вопрос · ${getProtectedQuestionAnswerWindowLabel(props.question)}`
})

const protectionSummary = computed(() => {
  if (!props.question.is_protected) {
    return ''
  }

  return getProtectedQuestionAnswerWindowSummary(props.question)
})

const protectionWindowNote = computed(() => {
  if (!props.question.is_protected || !props.question.protected_until) {
    return ''
  }

  return `Окно защиты закончится ${formatLongDate(props.question.protected_until)}.`
})
</script>

<template>
  <section class="question-detail-hero">
    <div class="question-detail-hero__main">
      <div class="question-detail-hero__meta">
        <span class="question-detail-hero__status">{{ formatQuestionStatus(question.question_status) }}</span>
        <span
          v-if="question.is_protected"
          class="question-detail-hero__protection-badge"
          data-testid="question-protection-badge"
        >
          {{ protectionBadgeLabel }}
        </span>
        <span class="question-detail-hero__stamp">
          Создан {{ formatLongDate(question.question_created_at) }}
        </span>
        <span class="question-detail-hero__stamp">
          Обновлён {{ formatLongDate(question.question_updated_at) }}
        </span>
      </div>

      <h1 class="question-detail-hero__title">{{ question.question_title }}</h1>
      <QuestionTagChips :tags="question.tags" variant="large" />
      <div
        v-if="question.is_protected"
        class="question-detail-hero__protection-panel"
        data-testid="question-protection-panel"
      >
        <p class="question-detail-hero__protection-title">Защита новых авторов включена</p>
        <p class="question-detail-hero__protection-copy">{{ protectionSummary }}</p>
        <p v-if="protectionWindowNote" class="question-detail-hero__protection-copy">
          {{ protectionWindowNote }}
        </p>
        <p class="question-detail-hero__protection-copy">
          Чтение и комментарии остаются открытыми для всех, но ответ и даунвоут могут быть временно ограничены.
        </p>
      </div>
      <div v-if="canEdit || canProposeEdit" class="question-detail-hero__actions">
        <AppButton v-if="canEdit" type="button" variant="secondary" @click="emit('requestEdit')">
          Редактировать вопрос
        </AppButton>
        <AppButton v-else-if="canProposeEdit" type="button" variant="secondary" @click="emit('requestProposal')">
          Предложить правку
        </AppButton>
      </div>
      <div class="question-detail-hero__body">
        <MarkdownContent :source="question.question_body" />
      </div>

      <div class="question-detail-hero__author">
        <div>
          <p class="question-detail-hero__author-label">Автор вопроса</p>
          <p class="question-detail-hero__author-name">
            {{ author?.user_name ?? 'Профиль автора загружается' }}
          </p>
          <AuthorReputationBadge
            v-if="author"
            :reputation="author.reputation"
            :fallback-score="author.user_reputation_score"
          />
        </div>

        <dl v-if="author" class="question-detail-hero__author-stats">
          <div>
            <dt>Уровень</dt>
            <dd>{{ author.reputation?.level_label ?? '—' }}</dd>
          </div>
          <div>
            <dt>Репутация</dt>
            <dd>{{ author.reputation?.score ?? author.user_reputation_score }}</dd>
          </div>
          <div>
            <dt>С нами с</dt>
            <dd>{{ formatLongDate(author.user_created_at) }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <SignalVoteRail
      :mode="canVote ? 'interactive' : 'readonly'"
      :score="question.score"
      :upvotes="question.upvotes"
      :downvotes="question.downvotes"
      :user-vote="question.user_vote"
      target-type="question"
      :target-id="question.question_id"
      :is-own-content="Boolean(currentUserId) && question.user === currentUserId"
      :downvote-blocked="question.is_protected && !question.viewer_can_downvote"
      :blocked-note="question.viewer_downvote_reason_message"
      label="Оценка вопроса"
    />
  </section>
</template>

<style scoped>
.question-detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
  gap: var(--space-xl);
  min-width: 0;
  padding: var(--space-2xl);
  border: 1px solid rgb(207 198 180 / 0.84);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.82), rgb(247 243 234 / 0.94));
}

.question-detail-hero__main,
.question-detail-hero__author {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
}

.question-detail-hero__main > *,
.question-detail-hero__author > *,
.question-detail-hero__author-stats > * {
  min-width: 0;
}

.question-detail-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  align-items: center;
}

.question-detail-hero__status,
.question-detail-hero__protection-badge,
.question-detail-hero__title,
.question-detail-hero__body,
.question-detail-hero__author-label,
.question-detail-hero__author-name,
.question-detail-hero__protection-title,
.question-detail-hero__protection-copy,
.question-detail-hero__stamp {
  margin: 0;
}

.question-detail-hero__status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.question-detail-hero__protection-badge {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgb(180 35 24 / 0.18);
  border-radius: 999px;
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
  font-size: 14px;
  font-weight: 600;
}

.question-detail-hero__stamp,
.question-detail-hero__author-label {
  color: var(--color-muted);
  font-size: 14px;
}

.question-detail-hero__title {
  font-size: clamp(34px, 5vw, 46px);
  line-height: 1;
  letter-spacing: -0.05em;
  overflow-wrap: anywhere;
}

.question-detail-hero__body {
  min-width: 0;
  font-size: 17px;
}

.question-detail-hero__protection-panel {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(180 35 24 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(180 35 24 / 0.06);
}

.question-detail-hero__protection-title {
  color: #8F1D14;
  font-size: 15px;
  font-weight: 700;
}

.question-detail-hero__protection-copy {
  color: #7A5A46;
  line-height: 1.6;
}

.question-detail-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.question-detail-hero__actions :deep(.app-button) {
  box-shadow: 0 10px 24px rgb(14 116 144 / 0.12);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease,
    transform 0.16s ease,
    box-shadow 0.2s ease;
}

.question-detail-hero__actions :deep(.app-button:active:enabled) {
  transform: scale(0.96);
}

.question-detail-hero__author {
  padding-top: var(--space-lg);
  border-top: 1px solid rgb(207 198 180 / 0.72);
}

.question-detail-hero__author-name {
  font-size: 22px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.question-detail-hero__author-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-md);
  min-width: 0;
  margin: 0;
}

.question-detail-hero__author-stats dt {
  color: var(--color-muted);
  font-size: 13px;
}

.question-detail-hero__author-stats dd {
  margin: var(--space-xs) 0 0;
  font-size: 17px;
  font-weight: 600;
}

@media (width <= 900px) {
  .question-detail-hero {
    grid-template-columns: 1fr;
    padding: var(--space-lg);
  }
}
</style>
