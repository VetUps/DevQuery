<script setup lang="ts">
import type { ReputationLevel, ReputationSummary } from '@/features/users/api/reputation'
import ReputationRankIcon from '@/features/users/components/ReputationRankIcon.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

defineProps<{
  reputation?: ReputationSummary | null
}>()

const scoringRules = [
  { label: 'Лучшее решение', value: '+15' },
  { label: 'Голос за решение', value: '+10' },
  { label: 'Голос за вопрос', value: '+5' },
  { label: 'Одобренная правка', value: '+2' },
]

const levelThresholds: Array<{ level: ReputationLevel; label: string; range: string }> = [
  { level: 'newcomer', label: 'Новичок', range: '0–29' },
  { level: 'participant', label: 'Участник', range: '30–99' },
  { level: 'expert', label: 'Эксперт', range: '100–299' },
  { level: 'master', label: 'Мастер', range: '300+' },
]
</script>

<template>
  <SurfacePanel class="reputation-explanation-panel" variant="muted" padding="lg" data-testid="reputation-explanation-panel">
    <header class="reputation-explanation-panel__header">
      <p class="reputation-explanation-panel__eyebrow">Как работает репутация</p>
      <h2 class="reputation-explanation-panel__title">Репутация растёт за полезный вклад в сообщество</h2>
    </header>

    <div class="reputation-explanation-panel__columns">
      <section class="reputation-explanation-panel__section" aria-labelledby="reputation-scoring-title">
        <h3 id="reputation-scoring-title" class="reputation-explanation-panel__section-title">За что начисляются очки</h3>
        <dl class="reputation-explanation-panel__rule-list">
          <div
            v-for="rule in scoringRules"
            :key="rule.label"
            class="reputation-explanation-panel__rule"
          >
            <dt>{{ rule.label }}</dt>
            <dd>{{ rule.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="reputation-explanation-panel__section" aria-labelledby="reputation-levels-title">
        <h3 id="reputation-levels-title" class="reputation-explanation-panel__section-title">Уровни доверия</h3>
        <dl class="reputation-explanation-panel__rule-list">
          <div
            v-for="threshold in levelThresholds"
            :key="threshold.label"
            class="reputation-explanation-panel__rule reputation-explanation-panel__rule--level"
          >
            <dt class="reputation-explanation-panel__level-name">
              <ReputationRankIcon :level="threshold.level" />
              <span>{{ threshold.label }}</span>
            </dt>
            <dd>{{ threshold.range }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <p class="reputation-explanation-panel__note">
      История репутации помогает понять, какие действия уже повлияли на счёт и сколько очков осталось до следующего уровня.
    </p>
  </SurfacePanel>
</template>

<style scoped>
.reputation-explanation-panel,
.reputation-explanation-panel__header,
.reputation-explanation-panel__columns,
.reputation-explanation-panel__section,
.reputation-explanation-panel__rule-list {
  display: grid;
  gap: var(--space-lg);
}

.reputation-explanation-panel__header {
  gap: var(--space-xs);
}

.reputation-explanation-panel__eyebrow,
.reputation-explanation-panel__title,
.reputation-explanation-panel__copy,
.reputation-explanation-panel__section-title,
.reputation-explanation-panel__note {
  margin: 0;
}

.reputation-explanation-panel__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.reputation-explanation-panel__title {
  font-size: clamp(22px, 3vw, 28px);
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.reputation-explanation-panel__copy,
.reputation-explanation-panel__note {
  color: var(--color-muted);
  line-height: 1.6;
}

.reputation-explanation-panel__columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.reputation-explanation-panel__section {
  align-content: start;
  gap: var(--space-md);
}

.reputation-explanation-panel__section-title {
  font-size: 17px;
  line-height: 1.3;
}

.reputation-explanation-panel__rule-list {
  gap: var(--space-sm);
}

.reputation-explanation-panel__rule {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.58);
}

.reputation-explanation-panel__rule dt,
.reputation-explanation-panel__rule dd {
  margin: 0;
}

.reputation-explanation-panel__rule dt {
  color: var(--color-text);
  font-weight: 600;
}

.reputation-explanation-panel__level-name {
  display: inline-flex;
  gap: var(--space-xs);
  align-items: center;
}

.reputation-explanation-panel__rule dd {
  color: var(--color-accent);
  font-weight: 700;
}

.reputation-explanation-panel__note {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(14 116 144 / 0.08);
}

@media (width <= 700px) {
  .reputation-explanation-panel__columns {
    grid-template-columns: 1fr;
  }
}
</style>
