<script setup lang="ts">
import type { LocationQueryRaw } from 'vue-router'

import { type QuestionListItem } from '@/features/questions/api/questions'
import ProtectedQuestionChip from '@/features/questions/components/ProtectedQuestionChip.vue'
import QuestionTagChips from '@/features/questions/components/QuestionTagChips.vue'
import AuthorReputationBadge from '@/features/users/components/AuthorReputationBadge.vue'
import { formatLongDate, formatQuestionStatus } from '@/shared/libs/formatting'

const props = defineProps<{
  question: QuestionListItem
  isInvitedForCurrentUser?: boolean
  tagLinkPath?: string
  tagLinkQueryBase?: LocationQueryRaw
}>()
</script>

<template>
  <article
    class="question-card"
    :class="{ 'question-card--invited': props.isInvitedForCurrentUser }"
    data-testid="question-card"
    :data-invited-for-current-user="props.isInvitedForCurrentUser ? 'true' : 'false'"
  >
    <div class="question-card__header">
      <div class="question-card__meta">
        <span
          class="question-card__status"
          :class="`question-card__status--${question.question_status}`"
        >
          {{ formatQuestionStatus(question.question_status) }}
        </span>
        <ProtectedQuestionChip
          v-if="question.is_protected"
          :question="question"
          test-id="question-card-protection"
        />
        <span
          v-if="props.isInvitedForCurrentUser"
          class="question-card__invited-badge"
          data-testid="question-card-invited-badge"
          aria-label="Вас позвали ответить на этот вопрос"
        >
          Вас позвали ответить
        </span>
        <span class="question-card__author">
          {{ question.user_name ?? 'Автор вопроса' }}
        </span>
        <AuthorReputationBadge
          :reputation="question.reputation"
          :fallback-score="question.user_reputation_score"
        />
        <span class="question-card__stamp">
          Создан {{ formatLongDate(question.question_created_at) }}
        </span>
        <span class="question-card__stamp">
          Обновлён {{ formatLongDate(question.question_updated_at) }}
        </span>
      </div>
    </div>

    <RouterLink
      class="question-card__link"
      :to="`/questions/${question.question_id}`"
    >
      <h2 class="question-card__title">{{ question.question_title }}</h2>
    </RouterLink>

    <QuestionTagChips
      :tags="question.tags"
      :tag-link-path="props.tagLinkPath"
      :tag-link-query-base="props.tagLinkQueryBase"
    />
  </article>
</template>

<style scoped>
.question-card {
  display: grid;
  gap: var(--space-md);
  min-width: 0;
  padding: var(--space-xl);
  border: 1px solid rgb(207 198 180 / 0.88);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.78);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.question-card--invited {
  border-color: rgb(217 119 6 / 0.5);
  background:
    linear-gradient(135deg, rgb(255 251 235 / 0.9), rgb(255 255 255 / 0.78));
  box-shadow: 0 18px 34px rgb(217 119 6 / 0.12);
}

.question-card:hover {
  transform: translateY(-2px);
  border-color: rgb(14 116 144 / 0.26);
  box-shadow: 0 18px 30px rgb(69 58 38 / 0.08);
}

.question-card__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-md);
  align-items: start;
  min-width: 0;
}

.question-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  align-items: center;
  min-width: 0;
}

.question-card__favorite {
  justify-self: end;
}

.question-card__status,
.question-card__author,
.question-card__invited-badge,
.question-card__stamp {
  font-size: 14px;
}

.question-card__status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-weight: 600;
}

.question-card__status--solved {
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
}

.question-card__status--closed {
  background: rgb(180 35 24 / 0.1);
  color: #B42318;
}

.question-card__author {
  color: var(--color-text);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.question-card__invited-badge {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgb(217 119 6 / 0.24);
  border-radius: 999px;
  background: rgb(251 191 36 / 0.16);
  color: #92400E;
  font-weight: 700;
}

.question-card__stamp {
  color: var(--color-muted);
}

.question-card__link {
  display: block;
  min-width: 0;
  max-width: 100%;
}

.question-card__title {
  margin: 0;
  max-width: 100%;
  font-size: clamp(24px, 4vw, 30px);
  line-height: 1.15;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

@media (width <= 640px) {
  .question-card {
    padding: var(--space-lg);
  }

  .question-card__header {
    grid-template-columns: 1fr;
  }

  .question-card__favorite {
    justify-self: end;
  }

  .question-card__title {
    max-width: none;
    font-size: 24px;
  }
}
</style>
