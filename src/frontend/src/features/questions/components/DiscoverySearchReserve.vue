<script setup lang="ts">
import { ArrowDownUp, Search } from 'lucide-vue-next'

import type { QuestionOrdering } from '@/features/questions/api/questions'
import DiscoveryTagFilterInput from '@/features/questions/components/DiscoveryTagFilterInput.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

defineProps<{
  totalQuestions: number
}>()

const search = defineModel<string>('search', { required: true })
const ordering = defineModel<QuestionOrdering>('ordering', { required: true })
const tags = defineModel<string[]>('tags', { required: true })
</script>

<template>
  <SurfacePanel
    class="discovery-search-reserve"
    variant="accent"
    padding="md"
    data-testid="discovery-search-reserve"
  >
    <div class="discovery-search-reserve__header">
      <div class="discovery-search-reserve__copy">
        <p class="discovery-search-reserve__eyebrow">Навигация по ленте</p>
        <h1 class="discovery-search-reserve__title">Найдите вопрос по названию</h1>
      </div>

      <p class="discovery-search-reserve__count">
        <strong>{{ totalQuestions }}</strong> вопросов
      </p>
    </div>

    <div class="discovery-search-reserve__controls">
      <label class="discovery-search-reserve__field">
        <Search :size="17" aria-hidden="true" />
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
        <ArrowDownUp :size="15" aria-hidden="true" />
        <span class="discovery-search-reserve__sort-label">Сортировка</span>
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

    <div class="discovery-search-reserve__tag-filter">
      <DiscoveryTagFilterInput
        id="discovery-tag-filter"
        v-model="tags"
        label="Фильтр по тегам"
      />
    </div>
  </SurfacePanel>
</template>

<style scoped>
.discovery-search-reserve {
  gap: var(--space-md);
}

.discovery-search-reserve__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-md);
}

.discovery-search-reserve__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.discovery-search-reserve__eyebrow,
.discovery-search-reserve__title,
.discovery-search-reserve__count {
  margin: 0;
}

.discovery-search-reserve__eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.discovery-search-reserve__title {
  font-size: clamp(21px, 2.4vw, 28px);
  line-height: 1.08;
  letter-spacing: -0.035em;
}

.discovery-search-reserve__count {
  flex: 0 0 auto;
  padding: 7px 11px;
  border: 1px solid rgb(14 116 144 / 0.14);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.54);
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1;
}

.discovery-search-reserve__count strong {
  color: var(--color-text);
}

.discovery-search-reserve__controls {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(190px, 0.34fr);
  gap: var(--space-sm);
}

.discovery-search-reserve__field,
.discovery-search-reserve__sort {
  min-width: 0;
  border: 1px solid rgb(207 198 180 / 0.86);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.72);
  color: var(--color-text);
}

.discovery-search-reserve__field {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: 44px;
  padding: 0 var(--space-md);
}

.discovery-search-reserve__sort {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 7px;
  min-height: 44px;
  padding: 0 12px;
  font-size: 13px;
}

.discovery-search-reserve__sort-label {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1;
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

.discovery-search-reserve__select {
  grid-column: 1 / -1;
  cursor: pointer;
  font-size: 13px;
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

.discovery-search-reserve__tag-filter {
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.1);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.42);
}

@media (width <= 760px) {
  .discovery-search-reserve__header {
    align-items: stretch;
    flex-direction: column;
  }

  .discovery-search-reserve__count {
    align-self: flex-start;
  }

  .discovery-search-reserve__controls {
    grid-template-columns: 1fr;
  }
}
</style>
