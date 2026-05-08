<script setup lang="ts">
import { computed } from 'vue'

import { formatReputationDelta, formatReputationReason, type ReputationLedgerEntry } from '@/features/users/api/reputation'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const props = defineProps<{
  entries: readonly ReputationLedgerEntry[]
}>()

const visibleEntries = computed(() => props.entries.slice(0, 25))

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <section class="admin-ledger" data-testid="admin-reputation-ledger" aria-labelledby="admin-reputation-ledger-title">
    <h3 id="admin-reputation-ledger-title" class="admin-ledger__title">Журнал репутации</h3>

    <InlineFeedbackPanel
      v-if="visibleEntries.length === 0"
      data-testid="admin-reputation-ledger-empty"
      title="Журнал репутации пуст"
      description="Для выбранного пользователя пока нет записей репутации."
    />

    <ol v-else class="admin-ledger__list" aria-label="Последние записи репутации">
      <li v-for="entry in visibleEntries" :key="entry.id" class="admin-ledger__entry">
        <div class="admin-ledger__entry-main">
          <span class="admin-ledger__delta">{{ formatReputationDelta(entry.amount) }}</span>
          <span class="admin-ledger__reason">{{ formatReputationReason(entry.reason) }}</span>
        </div>
        <p v-if="entry.note" class="admin-ledger__note">{{ entry.note }}</p>
        <p class="admin-ledger__meta">
          {{ formatDate(entry.created_at) }}<span v-if="entry.actor_name"> · {{ entry.actor_name }}</span>
        </p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.admin-ledger {
  display: grid;
  gap: var(--space-md);
}

.admin-ledger__title,
.admin-ledger__note,
.admin-ledger__meta {
  margin: 0;
}

.admin-ledger__title {
  font-size: 20px;
  line-height: 1.2;
}

.admin-ledger__list {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: 0;
  list-style: none;
}

.admin-ledger__entry {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.62);
}

.admin-ledger__entry-main {
  display: flex;
  gap: var(--space-sm);
  align-items: baseline;
}

.admin-ledger__delta {
  color: var(--color-accent);
  font-weight: 800;
}

.admin-ledger__reason {
  font-weight: 700;
}

.admin-ledger__note,
.admin-ledger__meta {
  color: var(--color-muted);
  line-height: 1.5;
}
</style>
