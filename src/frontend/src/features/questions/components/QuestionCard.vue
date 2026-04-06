<script setup lang="ts">
import type { QuestionListItem } from '@/features/questions/api/questions'
import { formatLongDate, formatQuestionStatus } from '@/shared/libs/formatting'

const props = defineProps<{
  question: QuestionListItem
}>()
</script>

<template>
  <article class="question-card" data-testid="question-card">
    <div class="question-card__meta">
      <span
        class="question-card__status"
        :class="`question-card__status--${question.question_status}`"
      >
        {{ formatQuestionStatus(question.question_status) }}
      </span>
      <span class="question-card__stamp">
        Создан {{ formatLongDate(question.question_created_at) }}
      </span>
      <span class="question-card__stamp">
        Обновлён {{ formatLongDate(question.question_updated_at) }}
      </span>
    </div>

    <RouterLink
      class="question-card__link"
      :to="`/questions/${question.question_id}`"
    >
      <h2 class="question-card__title">{{ question.question_title }}</h2>
    </RouterLink>
  </article>
</template>

<style scoped>
.question-card {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-xl);
  border: 1px solid rgb(207 198 180 / 0.88);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.78);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.question-card:hover {
  transform: translateY(-2px);
  border-color: rgb(14 116 144 / 0.26);
  box-shadow: 0 18px 30px rgb(69 58 38 / 0.08);
}

.question-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  align-items: center;
}

.question-card__status,
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

.question-card__stamp {
  color: var(--color-muted);
}

.question-card__link {
  display: inline-flex;
}

.question-card__title {
  margin: 0;
  max-width: 22ch;
  font-size: clamp(24px, 4vw, 30px);
  line-height: 1.15;
  letter-spacing: -0.03em;
}

@media (width <= 640px) {
  .question-card {
    padding: var(--space-lg);
  }

  .question-card__title {
    max-width: none;
    font-size: 24px;
  }
}
</style>
