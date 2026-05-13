<script setup lang="ts">
import { computed } from 'vue'

import {
  formatReputationDelta,
  formatReputationReason,
  type ReputationLedgerEntry,
} from '@/features/users/api/reputation'
import { formatDateTime } from '@/shared/libs/formatting'
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const props = defineProps<{
  items: ReputationLedgerEntry[]
  isPending: boolean
  isError: boolean
  errorMessage: string
}>()

const hasItems = computed(() => props.items.length > 0)

function entryMeta(item: ReputationLedgerEntry) {
  const actorName = item.actor_name ? ` · ${item.actor_name}` : ''
  return `${formatDateTime(item.created_at)}${actorName}`
}
</script>

<template>
  <SurfacePanel class="reputation-ledger-list" padding="lg">
    <header class="reputation-ledger-list__header">
      <div>
        <p class="reputation-ledger-list__eyebrow">История репутации</p>
        <h2 class="reputation-ledger-list__title">Последние изменения счёта</h2>
      </div>
    </header>

    <div v-if="isPending && !hasItems" class="reputation-ledger-list__loading" data-testid="reputation-ledger-loading">
      <ContentSkeleton :lines="4" />
      <ContentSkeleton :lines="4" />
    </div>

    <InlineFeedbackPanel
      v-else-if="isError"
      eyebrow="История репутации"
      title="Не удалось загрузить историю репутации"
      :description="errorMessage"
      tone="danger"
      data-testid="reputation-ledger-error"
    />

    <div
      v-else-if="!hasItems"
      class="reputation-ledger-list__empty"
      data-testid="reputation-ledger-empty"
    >
      <p class="reputation-ledger-list__empty-title">История пока пуста</p>
      <p class="reputation-ledger-list__empty-copy">
        Как только появятся первые награды, голоса или одобренные правки, они отобразятся здесь.
      </p>
    </div>

    <ol v-else class="reputation-ledger-list__items" data-testid="reputation-ledger-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="reputation-ledger-list__item"
        :data-testid="`reputation-ledger-item-${item.id}`"
      >
        <div class="reputation-ledger-list__item-copy">
          <div class="reputation-ledger-list__item-heading">
            <strong>{{ formatReputationReason(item.reason) }}</strong>
            <span
              class="reputation-ledger-list__delta"
              :class="{
                'reputation-ledger-list__delta--positive': item.amount > 0,
                'reputation-ledger-list__delta--negative': item.amount < 0,
              }"
            >
              {{ formatReputationDelta(item.amount) }}
            </span>
          </div>
          <p class="reputation-ledger-list__meta">{{ entryMeta(item) }}</p>
          <p v-if="item.note" class="reputation-ledger-list__note">{{ item.note }}</p>
        </div>
      </li>
    </ol>
  </SurfacePanel>
</template>

<style scoped>
.reputation-ledger-list,
.reputation-ledger-list__header,
.reputation-ledger-list__items,
.reputation-ledger-list__item,
.reputation-ledger-list__item-copy,
.reputation-ledger-list__loading,
.reputation-ledger-list__empty {
  display: grid;
  gap: var(--space-lg);
}

.reputation-ledger-list__header {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 360px);
  align-items: end;
}

.reputation-ledger-list__eyebrow,
.reputation-ledger-list__title,
.reputation-ledger-list__copy,
.reputation-ledger-list__meta,
.reputation-ledger-list__note,
.reputation-ledger-list__empty-title,
.reputation-ledger-list__empty-copy {
  margin: 0;
}

.reputation-ledger-list__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.reputation-ledger-list__title {
  margin-top: var(--space-xs);
  font-size: 24px;
  line-height: 1.08;
}

.reputation-ledger-list__copy,
.reputation-ledger-list__meta,
.reputation-ledger-list__note,
.reputation-ledger-list__empty-copy {
  color: var(--color-muted);
  line-height: 1.6;
}

.reputation-ledger-list__items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.reputation-ledger-list__item {
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.78);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.64);
}

.reputation-ledger-list__item-heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  justify-content: space-between;
}

.reputation-ledger-list__delta {
  font-weight: 700;
}

.reputation-ledger-list__delta--positive {
  color: rgb(22 101 52);
}

.reputation-ledger-list__delta--negative {
  color: rgb(185 28 28);
}

.reputation-ledger-list__empty {
  padding: var(--space-xl);
  border: 1px dashed rgb(207 198 180 / 0.9);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.56);
  text-align: center;
}

.reputation-ledger-list__empty-title {
  font-size: 20px;
  font-weight: 700;
}

@media (width <= 900px) {
  .reputation-ledger-list__header {
    grid-template-columns: 1fr;
  }
}
</style>
