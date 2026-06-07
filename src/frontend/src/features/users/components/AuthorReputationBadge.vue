<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed } from 'vue'

import type { ReputationSummary } from '@/features/users/api/reputation'
import ReputationRankIcon from '@/features/users/components/ReputationRankIcon.vue'

const props = defineProps<{
  reputation?: ReputationSummary | null
  fallbackScore?: number | null
}>()

const badge = computed(() => {
  if (props.reputation) {
    return {
      score: props.reputation.score,
      label: props.reputation.level_label,
      level: props.reputation.level,
      ariaLabel: `Репутация автора: ${props.reputation.level_label}, ${props.reputation.score} очк.`,
      rankLevel: props.reputation.level,
    }
  }

  if (typeof props.fallbackScore === 'number' && Number.isFinite(props.fallbackScore)) {
    return {
      score: props.fallbackScore,
      label: 'Репутация',
      level: 'legacy',
      ariaLabel: `Репутация автора: ${props.fallbackScore} очк.`,
      rankLevel: null,
    }
  }

  return null
})
</script>

<template>
  <span
    v-if="badge"
    class="author-reputation-badge"
    :class="`author-reputation-badge--${badge.level}`"
    :aria-label="badge.ariaLabel"
    data-testid="author-reputation-badge"
  >
    <ReputationRankIcon :level="badge.rankLevel" />
    <span class="author-reputation-badge__label">{{ badge.label }}</span>
    <span class="author-reputation-badge__score">{{ badge.score }}</span>
  </span>
</template>

<style scoped>
.author-reputation-badge {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 28px;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.author-reputation-badge__label,
.author-reputation-badge__score {
  overflow: hidden;
  text-overflow: ellipsis;
}

.author-reputation-badge__score {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.author-reputation-badge--expert,
.author-reputation-badge--master {
  border-color: rgb(47 133 90 / 0.24);
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
}

.author-reputation-badge--newcomer,
.author-reputation-badge--legacy {
  border-color: rgb(207 198 180 / 0.82);
  background: rgb(255 255 255 / 0.62);
  color: var(--color-muted);
}

@media (width <= 640px) {
  .author-reputation-badge {
    min-height: 26px;
    padding-inline: 8px;
    font-size: 12px;
  }
}
</style>
