<script setup lang="ts">
import { computed, watch } from 'vue'

import type { AdminUserListRow } from '@/features/admin/api/admin'
import { useAdminReputationLedger } from '@/features/admin/composables/useAdminReputationLedger'
import { formatReputationDelta, formatReputationReason } from '@/features/users/api/reputation'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import AdminCardExpander from './AdminCardExpander.vue'
import AdminPagination from './AdminPagination.vue'

const props = defineProps<{
  selectedUser: AdminUserListRow | null
}>()

const ledger = useAdminReputationLedger()
const selectedUserId = computed(() => props.selectedUser?.user_id ?? null)

watch(selectedUserId, (userId) => {
  ledger.setSelectedUserId(userId)
  if (userId) {
    void ledger.loadLedger()
  }
}, { immediate: true })

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function parseNote(note: string) {
  return note.split('. ').map((s, i, arr) => (i === arr.length - 1 ? s : s + '.')).filter(Boolean)
}
</script>

<template>
  <section class="admin-ledger" data-testid="admin-reputation-ledger" aria-labelledby="admin-reputation-ledger-title">
    <div class="admin-ledger__header">
      <h3 id="admin-reputation-ledger-title" class="admin-ledger__title">Журнал репутации</h3>
      <AppButton
        v-if="selectedUser"
        variant="secondary"
        size="compact"
        :disabled="ledger.isLoading.value"
        @click="ledger.retry"
      >
        Обновить журнал
      </AppButton>
    </div>

    <p v-if="ledger.isLoading.value" class="admin-ledger__status" role="status">
      Загружаем журнал репутации…
    </p>

    <InlineFeedbackPanel
      v-else-if="ledger.error.value"
      data-testid="admin-reputation-ledger-error"
      :title="ledger.safeErrorMessage.value"
      description="Служебные подробности скрыты."
      tone="danger"
      show-action
      action-label="Повторить загрузку"
      @action="ledger.retry"
    />

    <InlineFeedbackPanel
      v-else-if="ledger.entries.value.length === 0"
      data-testid="admin-reputation-ledger-empty"
      title="Журнал репутации пуст"
      description="Для выбранного пользователя пока нет записей репутации."
    />

    <template v-else>
      <p class="admin-ledger__status">
        Показана страница {{ ledger.page.value }}. Всего записей: {{ ledger.count.value }}.
      </p>
      <ol class="admin-ledger__list" aria-label="Записи репутации">
        <li v-for="entry in ledger.entries.value" :key="entry.id" class="admin-ledger__entry">
        <AdminCardExpander :base-height="110">
          <div class="admin-ledger__entry-inner">
            <div class="admin-ledger__entry-header">
              <div class="admin-ledger__entry-main">
                <span class="admin-ledger__delta">{{ formatReputationDelta(entry.amount) }}</span>
                <span class="admin-ledger__reason">{{ formatReputationReason(entry.reason) }}</span>
              </div>
              <time :datetime="entry.created_at" class="admin-ledger__meta">
                {{ formatDate(entry.created_at) }}<span v-if="entry.actor_name"> · {{ entry.actor_name }}</span>
              </time>
            </div>
            <div v-if="entry.note" class="admin-ledger__note">
              <span v-for="(line, index) in parseNote(entry.note)" :key="index" class="admin-ledger__note-line">
                {{ line }}
              </span>
            </div>
          </div>
        </AdminCardExpander>
      </li>
      </ol>
      
      <AdminPagination
        v-if="ledger.count.value > 10"
        :page="ledger.page.value"
        :has-next-page="ledger.hasNextPage.value"
        :is-busy="ledger.isLoading.value"
        @update:page="ledger.setPage"
      />
    </template>
  </section>
</template>

<style scoped>
.admin-ledger {
  display: grid;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.admin-ledger__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-ledger__status {
  margin: 0;
  color: var(--color-muted);
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
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.62);
}

.admin-ledger__entry-inner {
  display: grid;
  gap: var(--space-xs);
}

.admin-ledger__entry-header {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  justify-content: space-between;
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

.admin-ledger__note {
  display: grid;
  gap: 4px;
  color: var(--color-muted);
  line-height: 1.5;
}

.admin-ledger__note-line {
  display: block;
}

.admin-ledger__meta {
  color: var(--color-muted);
  line-height: 1.5;
}

@media (width <= 720px) {
  .admin-ledger__entry-header {
    display: grid;
    justify-content: stretch;
  }
}
</style>
