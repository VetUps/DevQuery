<script setup lang="ts">
import type { SolutionListItem } from '@/features/solutions/api/solutions'
import AppButton from '@/shared/ui/AppButton.vue'

import SolutionReadCard from './SolutionReadCard.vue'

defineProps<{
  solutions: SolutionListItem[]
  questionId: string
  viewerUserId?: string
  isAuthenticated?: boolean
  activeComposerKey?: string | null
  isPending?: boolean
  isError?: boolean
  successMessage?: string
  freshSolutionId?: string | null
}>()

defineEmits<{
  retry: []
  requestComposer: [key: string | null]
}>()
</script>

<template>
  <section class="solution-list-section">
    <slot name="authoring" />

    <div class="solution-list-section__header">
      <div>
        <p class="solution-list-section__eyebrow">Решения</p>
        <h2 class="solution-list-section__title">Ответы сообщества</h2>
      </div>
      <p class="solution-list-section__meta">{{ solutions.length }} шт.</p>
    </div>

    <p v-if="successMessage" class="solution-list-section__success">
      {{ successMessage }}
    </p>

    <p v-if="isPending" class="solution-list-section__muted">Загружаем решения…</p>

    <div v-else-if="isError" class="solution-list-section__feedback">
      <p class="solution-list-section__muted">Не удалось загрузить данные. Попробуйте снова.</p>
      <AppButton variant="secondary" @click="$emit('retry')">
        Попробовать снова
      </AppButton>
    </div>

    <p v-else-if="solutions.length === 0" class="solution-list-section__muted">
      Решений пока нет.
    </p>

    <div v-else class="solution-list-section__list">
      <SolutionReadCard
        v-for="(solution, index) in solutions"
        :key="solution.solution_id"
        :solution="solution"
        :question-id="questionId"
        :viewer-user-id="viewerUserId"
        :is-authenticated="isAuthenticated"
        :active-composer-key="activeComposerKey"
        :featured="index === 0"
        :is-fresh="solution.solution_id === freshSolutionId"
        @request-composer="$emit('requestComposer', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.solution-list-section {
  display: grid;
  gap: var(--space-lg);
}

.solution-list-section__header,
.solution-list-section__feedback,
.solution-list-section__list {
  display: grid;
  gap: var(--space-md);
}

.solution-list-section__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.solution-list-section__eyebrow,
.solution-list-section__title,
.solution-list-section__meta,
.solution-list-section__muted,
.solution-list-section__success {
  margin: 0;
}

.solution-list-section__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.solution-list-section__title {
  font-size: 28px;
  line-height: 1.1;
}

.solution-list-section__meta,
.solution-list-section__muted {
  color: var(--color-muted);
  line-height: 1.6;
}

.solution-list-section__success {
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(47 133 90 / 0.24);
  border-radius: var(--radius-md);
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
}
</style>
