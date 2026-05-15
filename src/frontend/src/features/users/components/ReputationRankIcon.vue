<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'

import { getReputationRankDescriptor, type ReputationLevel } from '@/features/users/api/reputation'

const props = withDefaults(defineProps<{
  level?: ReputationLevel | string | null
  size?: 'compact' | 'profile'
}>(), {
  level: null,
  size: 'compact',
})

const rank = computed(() => getReputationRankDescriptor(props.level))
</script>

<template>
  <span
    v-if="rank"
    class="reputation-rank-icon"
    :class="[`reputation-rank-icon--${rank.level}`, `reputation-rank-icon--${size}`]"
    :aria-label="`Знак уровня ${rank.label}: ${rank.ariaDescription}`"
    :data-rank-level="rank.level"
    data-testid="reputation-rank-icon"
  >
    <span class="reputation-rank-icon__parts" aria-hidden="true">
      <span
        v-for="(part, index) in rank.parts"
        :key="`${part}-${index}`"
        class="reputation-rank-icon__part"
        :class="`reputation-rank-icon__part--${part}`"
        :data-rank-part="part"
      >
        <Star
          :size="size === 'profile' ? 19 : 13"
          :stroke-width="2.4"
          aria-hidden="true"
        />
      </span>
    </span>
  </span>
</template>

<style scoped>
.reputation-rank-icon {
  --rank-color: var(--color-accent);
  --rank-bg: rgb(14 116 144 / 0.08);
  --rank-border: rgb(14 116 144 / 0.18);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid var(--rank-border);
  border-radius: 999px;
  background: var(--rank-bg);
  color: var(--rank-color);
  line-height: 1;
  vertical-align: middle;
}

.reputation-rank-icon--compact {
  min-width: 26px;
  min-height: 22px;
  padding: 0 6px;
}

.reputation-rank-icon--profile {
  min-width: 44px;
  min-height: 36px;
  padding: 0 10px;
}

.reputation-rank-icon--participant.reputation-rank-icon--compact {
  min-width: 34px;
}

.reputation-rank-icon--participant.reputation-rank-icon--profile {
  min-width: 52px;
}

.reputation-rank-icon--newcomer {
  --rank-color: #6B6252;
  --rank-bg: rgb(255 255 255 / 0.72);
  --rank-border: rgb(207 198 180 / 0.9);
}

.reputation-rank-icon--participant {
  --rank-color: #0E7490;
  --rank-bg: rgb(14 116 144 / 0.1);
  --rank-border: rgb(14 116 144 / 0.24);
}

.reputation-rank-icon--expert,
.reputation-rank-icon--master {
  --rank-color: #B45309;
  --rank-bg: linear-gradient(135deg, rgb(255 251 235 / 0.94), rgb(255 237 213 / 0.88));
  --rank-border: rgb(217 119 6 / 0.34);
}

.reputation-rank-icon__parts {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.reputation-rank-icon--expert .reputation-rank-icon__parts,
.reputation-rank-icon--master .reputation-rank-icon__parts {
  display: grid;
  justify-items: center;
  gap: 0;
}

.reputation-rank-icon--expert .reputation-rank-icon__parts {
  grid-template-columns: repeat(2, 11px);
  grid-template-rows: 11px 9px;
}

.reputation-rank-icon--master .reputation-rank-icon__parts {
  grid-template-columns: repeat(2, 13px);
  grid-template-rows: 10px 10px;
}

.reputation-rank-icon--expert.reputation-rank-icon--profile .reputation-rank-icon__parts {
  grid-template-columns: repeat(2, 17px);
  grid-template-rows: 17px 12px;
}

.reputation-rank-icon--master.reputation-rank-icon--profile .reputation-rank-icon__parts {
  grid-template-columns: repeat(2, 19px);
  grid-template-rows: 15px 15px;
}

.reputation-rank-icon--participant .reputation-rank-icon__parts {
  gap: 2px;
}

.reputation-rank-icon--participant .reputation-rank-icon__parts::before,
.reputation-rank-icon--participant .reputation-rank-icon__parts::after {
  position: absolute;
  z-index: 0;
  width: 15px;
  height: 10px;
  border: 1px solid rgb(14 116 144 / 0.28);
  border-top-color: transparent;
  border-left-color: transparent;
  border-radius: 999px;
  content: '';
}

.reputation-rank-icon--participant .reputation-rank-icon__parts::before {
  left: -3px;
  transform: rotate(-24deg);
}

.reputation-rank-icon--participant .reputation-rank-icon__parts::after {
  right: -3px;
  transform: scaleX(-1) rotate(-24deg);
}

.reputation-rank-icon--participant.reputation-rank-icon--profile .reputation-rank-icon__parts::before,
.reputation-rank-icon--participant.reputation-rank-icon--profile .reputation-rank-icon__parts::after {
  width: 22px;
  height: 14px;
}

.reputation-rank-icon--newcomer .reputation-rank-icon__part--star svg {
  width: 10px;
  height: 10px;
}

.reputation-rank-icon--newcomer.reputation-rank-icon--profile .reputation-rank-icon__part--star svg {
  width: 15px;
  height: 15px;
}

.reputation-rank-icon--participant .reputation-rank-icon__part--star svg {
  width: 11px;
  height: 11px;
}

.reputation-rank-icon--participant.reputation-rank-icon--profile .reputation-rank-icon__part--star svg {
  width: 16px;
  height: 16px;
}

.reputation-rank-icon--expert .reputation-rank-icon__part:nth-child(1) svg {
  width: 12px;
  height: 12px;
}

.reputation-rank-icon--expert .reputation-rank-icon__part:nth-child(2) svg,
.reputation-rank-icon--expert .reputation-rank-icon__part:nth-child(3) svg {
  width: 8px;
  height: 8px;
}

.reputation-rank-icon--expert.reputation-rank-icon--profile .reputation-rank-icon__part:nth-child(1) svg {
  width: 18px;
  height: 18px;
}

.reputation-rank-icon--expert.reputation-rank-icon--profile .reputation-rank-icon__part:nth-child(2) svg,
.reputation-rank-icon--expert.reputation-rank-icon--profile .reputation-rank-icon__part:nth-child(3) svg {
  width: 12px;
  height: 12px;
}

.reputation-rank-icon--master .reputation-rank-icon__parts::before {
  position: absolute;
  inset: 1px 2px;
  z-index: 0;
  border: 1px solid rgb(217 119 6 / 0.58);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgb(251 191 36 / 0.12), 0 0 8px rgb(217 119 6 / 0.16);
  content: '';
}

.reputation-rank-icon__part {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.reputation-rank-icon__part--star svg {
  fill: currentColor;
}

.reputation-rank-icon--expert .reputation-rank-icon__part:nth-child(1),
.reputation-rank-icon--master .reputation-rank-icon__part:nth-child(1) {
  grid-column: 1 / -1;
  grid-row: 1;
}

.reputation-rank-icon--expert .reputation-rank-icon__part:nth-child(2),
.reputation-rank-icon--master .reputation-rank-icon__part:nth-child(2) {
  grid-column: 1;
  grid-row: 2;
}

.reputation-rank-icon--expert .reputation-rank-icon__part:nth-child(3),
.reputation-rank-icon--master .reputation-rank-icon__part:nth-child(3) {
  grid-column: 2;
  grid-row: 2;
}
</style>
