<script setup lang="ts">
import { ArrowDownUp, Search } from 'lucide-vue-next'

import type { QuestionOrdering } from '@/features/questions/api/questions'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

defineProps<{
  totalQuestions: number
}>()

const search = defineModel<string>('search', { required: true })
const ordering = defineModel<QuestionOrdering>('ordering', { required: true })
</script>

<template>
  <SurfacePanel
    class="discovery-search-reserve"
    variant="accent"
    padding="lg"
    data-testid="discovery-search-reserve"
  >
    <div class="discovery-search-reserve__copy">
      <p class="discovery-search-reserve__eyebrow">Навигация по ленте</p>
      <h1 class="discovery-search-reserve__title">Найдите вопрос по названию</h1>
    </div>

    <div class="discovery-search-reserve__surface">
      <label class="discovery-search-reserve__field">
        <Search :size="18" aria-hidden="true" />
        <span class="discovery-search-reserve__visually-hidden">Поиск по названию вопроса</span>
        <input
          v-model="search"
          class="discovery-search-reserve__input"
          type="search"
          placeholder="Поиск по названию, например Django serializer"
          autocomplete="off"
          data-testid="question-search-input"
        >
      </label>

      <label class="discovery-search-reserve__sort">
        <ArrowDownUp :size="16" aria-hidden="true" />
        <span>Сортировка</span>
        <select
          v-model="ordering"
          class="discovery-search-reserve__select"
          data-testid="question-ordering-select"
        >
          <option value="-question_created_at">Сначала новые</option>
          <option value="question_created_at">Сначала старые</option>
        </select>
      </label>
    </div>

    <div class="discovery-search-reserve__footer">
      <p class="discovery-search-reserve__count">
        В ленте <strong>{{ totalQuestions }}</strong> вопросов.
      </p>
    </div>
  </SurfacePanel>
</template>

<style scoped>
.discovery-search-reserve {
  gap: var(--space-xl);
}

.discovery-search-reserve__copy,
.discovery-search-reserve__surface,
.discovery-search-reserve__footer {
  display: grid;
  gap: var(--space-md);
}

.discovery-search-reserve__eyebrow,
.discovery-search-reserve__title,
.discovery-search-reserve__description,
.discovery-search-reserve__count {
  margin: 0;
}

.discovery-search-reserve__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.discovery-search-reserve__description,
.discovery-search-reserve__count {
  color: var(--color-muted);
  line-height: 1.65;
}

.discovery-search-reserve__title {
  max-width: 18ch;
  font-size: clamp(30px, 5vw, 42px);
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.discovery-search-reserve__surface {
  gap: var(--space-sm);
}

.discovery-search-reserve__field {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
  min-height: 56px;
  padding: 0 var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.86);
  color: var(--color-text);
}

.discovery-search-reserve__input,
.discovery-search-reserve__select {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  outline: none;
}

.discovery-search-reserve__input::placeholder {
  color: var(--color-muted);
}

.discovery-search-reserve__sort {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.88);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.48);
  color: var(--color-text);
  font-size: 14px;
}

.discovery-search-reserve__select {
  min-width: 150px;
  cursor: pointer;
}

.discovery-search-reserve__visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.discovery-search-reserve__footer {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-lg);
}

strong {
  color: var(--color-text);
}

@media (width <= 760px) {
  .discovery-search-reserve__title {
    max-width: none;
  }

  .discovery-search-reserve__footer {
    grid-template-columns: 1fr;
  }

  .discovery-search-reserve__field {
    flex-wrap: wrap;
    align-items: center;
    min-height: auto;
    padding: var(--space-md) var(--space-lg);
  }
}
</style>
