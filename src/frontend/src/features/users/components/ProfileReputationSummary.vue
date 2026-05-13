<script setup lang="ts">
import { computed } from 'vue'

import {
  buildReputationProgress,
  type ReputationSummary,
} from '@/features/users/api/reputation'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const props = defineProps<{
  reputation: ReputationSummary
}>()

const emit = defineEmits<{
  explain: []
}>()

const progress = computed(() => buildReputationProgress(props.reputation))
const progressLabel = computed(() => {
  if (!props.reputation.next_level_label) {
    return 'Вы уже на максимальном уровне доверия сообщества.'
  }

  if (props.reputation.points_to_next_level === 0) {
    return `Следующий уровень ${props.reputation.next_level_label} уже доступен.`
  }

  return `До уровня ${props.reputation.next_level_label} осталось ${props.reputation.points_to_next_level} очк.`
})
const statusLabel = computed(() => (
  props.reputation.is_manual_override ? 'Уровень закреплён вручную администратором.' : ''
))
</script>

<template>
  <SurfacePanel class="profile-reputation-summary" variant="accent" padding="lg">
    <header class="profile-reputation-summary__header">
      <div>
        <div class="profile-reputation-summary__label-row">
          <p class="profile-reputation-summary__eyebrow">Репутация</p>
          <button
            type="button"
            class="profile-reputation-summary__explain"
            data-testid="reputation-explanation-trigger"
            @click="emit('explain')"
          >
            Как работает репутация
          </button>
        </div>
        <h2 class="profile-reputation-summary__title">{{ reputation.level_label }}</h2>
      </div>
      <div class="profile-reputation-summary__score-block">
        <span class="profile-reputation-summary__score">{{ reputation.score }}</span>
        <span class="profile-reputation-summary__score-label">очков</span>
      </div>
    </header>

    <dl class="profile-reputation-summary__facts">
      <div class="profile-reputation-summary__fact">
        <dt>Текущий уровень</dt>
        <dd>{{ reputation.level_label }}</dd>
      </div>
      <div class="profile-reputation-summary__fact">
        <dt>Следующий уровень</dt>
        <dd>{{ reputation.next_level_label ?? 'Максимум' }}</dd>
      </div>
      <div class="profile-reputation-summary__fact">
        <dt>До следующего уровня</dt>
        <dd>{{ reputation.points_to_next_level }}</dd>
      </div>
    </dl>

    <div class="profile-reputation-summary__progress-block">
      <div class="profile-reputation-summary__progress-copy">
        <p class="profile-reputation-summary__progress-label">Прогресс внутри уровня</p>
        <p class="profile-reputation-summary__progress-text">{{ progressLabel }}</p>
      </div>
      <div
        class="profile-reputation-summary__progress-track"
        role="progressbar"
        aria-label="Прогресс репутации"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(progress.percent)"
      >
        <span class="profile-reputation-summary__progress-fill" :style="{ width: `${progress.percent}%` }" />
      </div>
      <div class="profile-reputation-summary__progress-meta">
        <span>{{ Math.round(progress.percent) }}%</span>
        <span v-if="statusLabel">{{ statusLabel }}</span>
      </div>
    </div>
  </SurfacePanel>
</template>

<style scoped>
.profile-reputation-summary,
.profile-reputation-summary__header,
.profile-reputation-summary__facts,
.profile-reputation-summary__progress-block {
  display: grid;
  gap: var(--space-lg);
}

.profile-reputation-summary__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.profile-reputation-summary__eyebrow,
.profile-reputation-summary__title,
.profile-reputation-summary__progress-label,
.profile-reputation-summary__progress-text {
  margin: 0;
}

.profile-reputation-summary__label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}

.profile-reputation-summary__eyebrow,
.profile-reputation-summary__progress-label {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-reputation-summary__explain {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.07);
  color: var(--color-accent);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.profile-reputation-summary__explain:hover,
.profile-reputation-summary__explain:focus-visible {
  border-color: rgb(14 116 144 / 0.34);
  background: rgb(14 116 144 / 0.12);
  outline: none;
}

.profile-reputation-summary__title {
  margin-top: var(--space-xs);
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.08;
}

.profile-reputation-summary__score-block {
  display: grid;
  justify-items: end;
}

.profile-reputation-summary__score {
  font-size: clamp(34px, 5vw, 46px);
  font-weight: 700;
  line-height: 1;
}

.profile-reputation-summary__score-label,
.profile-reputation-summary__progress-text,
.profile-reputation-summary__progress-meta,
.profile-reputation-summary__fact dt {
  color: var(--color-muted);
}

.profile-reputation-summary__facts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.profile-reputation-summary__fact {
  display: grid;
  gap: 6px;
}

.profile-reputation-summary__fact dt,
.profile-reputation-summary__fact dd {
  margin: 0;
}

.profile-reputation-summary__fact dd {
  font-size: 18px;
  font-weight: 600;
}

.profile-reputation-summary__progress-block {
  gap: var(--space-sm);
}

.profile-reputation-summary__progress-track {
  overflow: hidden;
  height: 12px;
  border-radius: 999px;
  background: rgb(207 198 180 / 0.4);
}

.profile-reputation-summary__progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(14 116 144 / 0.9), rgb(56 189 248 / 0.85));
}

.profile-reputation-summary__progress-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: space-between;
  font-size: 14px;
  line-height: 1.5;
}

@media (width <= 900px) {
  .profile-reputation-summary__header,
  .profile-reputation-summary__facts {
    grid-template-columns: 1fr;
  }

  .profile-reputation-summary__score-block {
    justify-items: start;
  }
}
</style>
