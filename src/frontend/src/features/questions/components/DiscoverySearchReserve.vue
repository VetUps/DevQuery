<script setup lang="ts">
import { ArrowDownUp, Search } from 'lucide-vue-next'

import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

defineProps<{
  totalQuestions: number
}>()

const futureSignals = [
  'Поиск по заголовкам',
  'Сортировка по дате',
]
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
    </div>

    <div class="discovery-search-reserve__surface">
      <div class="discovery-search-reserve__field" aria-disabled="true">
        <Search :size="18" aria-hidden="true" />
        <span>Поиск по названию...</span>
      </div>

      <div class="discovery-search-reserve__signals" aria-label="Будущие discovery-возможности">
        <span
          v-for="signal in futureSignals"
          :key="signal"
          class="discovery-search-reserve__signal"
        >
          <ArrowDownUp :size="14" aria-hidden="true" />
          {{ signal }}
        </span>
      </div>
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

.discovery-search-reserve__title {
  max-width: 15ch;
  font-size: clamp(30px, 5vw, 42px);
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.discovery-search-reserve__description,
.discovery-search-reserve__count {
  color: var(--color-muted);
  line-height: 1.65;
}

.discovery-search-reserve__surface {
  gap: var(--space-sm);
}

.discovery-search-reserve__field {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: 56px;
  padding: 0 var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.86);
  color: var(--color-text);
}

.discovery-search-reserve__signals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.discovery-search-reserve__signal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px dashed rgb(207 198 180 / 0.88);
  border-radius: 999px;
  color: var(--color-text);
  font-size: 14px;
}

.discovery-search-reserve__footer {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
