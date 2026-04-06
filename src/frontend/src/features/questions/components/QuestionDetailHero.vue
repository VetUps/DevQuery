<script setup lang="ts">
import type { QuestionDetail } from '@/features/questions/api/questions'
import type { PublicUserProfile } from '@/features/users/api/publicProfiles'
import ReadOnlyVoteBlock from '@/features/questions/components/ReadOnlyVoteBlock.vue'
import { formatLongDate, formatQuestionStatus } from '@/shared/lib/formatting'

const props = defineProps<{
  question: QuestionDetail
  author: PublicUserProfile | null | undefined
}>()
</script>

<template>
  <section class="question-detail-hero">
    <div class="question-detail-hero__main">
      <div class="question-detail-hero__meta">
        <span class="question-detail-hero__status">{{ formatQuestionStatus(question.question_status) }}</span>
        <span class="question-detail-hero__stamp">
          Создан {{ formatLongDate(question.question_created_at) }}
        </span>
        <span class="question-detail-hero__stamp">
          Обновлён {{ formatLongDate(question.question_updated_at) }}
        </span>
      </div>

      <h1 class="question-detail-hero__title">{{ question.question_title }}</h1>
      <p class="question-detail-hero__body">{{ question.question_body }}</p>

      <div class="question-detail-hero__author">
        <div>
          <p class="question-detail-hero__author-label">Автор вопроса</p>
          <p class="question-detail-hero__author-name">
            {{ author?.user_name ?? 'Профиль автора загружается' }}
          </p>
        </div>

        <dl v-if="author" class="question-detail-hero__author-stats">
          <div>
            <dt>Роль</dt>
            <dd>{{ author.user_role }}</dd>
          </div>
          <div>
            <dt>Репутация</dt>
            <dd>{{ author.user_reputation_score }}</dd>
          </div>
          <div>
            <dt>С нами с</dt>
            <dd>{{ formatLongDate(author.user_created_at) }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <ReadOnlyVoteBlock
      :score="question.score"
      :upvotes="question.upvotes"
      :downvotes="question.downvotes"
      :user-vote="question.user_vote"
      label="Оценка вопроса"
    />
  </section>
</template>

<style scoped>
.question-detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: var(--space-xl);
  padding: var(--space-2xl);
  border: 1px solid rgb(207 198 180 / 0.84);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.82), rgb(247 243 234 / 0.94));
}

.question-detail-hero__main,
.question-detail-hero__author {
  display: grid;
  gap: var(--space-lg);
}

.question-detail-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  align-items: center;
}

.question-detail-hero__status,
.question-detail-hero__stamp,
.question-detail-hero__title,
.question-detail-hero__body,
.question-detail-hero__author-label,
.question-detail-hero__author-name {
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

.question-detail-hero__stamp,
.question-detail-hero__author-label {
  color: var(--color-muted);
  font-size: 14px;
}

.question-detail-hero__title {
  font-size: clamp(34px, 5vw, 46px);
  line-height: 1;
  letter-spacing: -0.05em;
}

.question-detail-hero__body {
  white-space: pre-line;
  font-size: 17px;
  line-height: 1.75;
}

.question-detail-hero__author {
  padding-top: var(--space-lg);
  border-top: 1px solid rgb(207 198 180 / 0.72);
}

.question-detail-hero__author-name {
  font-size: 22px;
  font-weight: 600;
}

.question-detail-hero__author-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-md);
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
