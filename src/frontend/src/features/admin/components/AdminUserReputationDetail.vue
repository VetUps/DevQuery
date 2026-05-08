<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import type { ReputationLevel } from '@/features/users/api/reputation'
import type { AdminUserDetail, AdminUserListRow } from '@/features/admin/api/admin'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import AdminManualOverrideForm from './AdminManualOverrideForm.vue'
import AdminReputationLedger from './AdminReputationLedger.vue'
import AdminUserActivityTimeline from './AdminUserActivityTimeline.vue'

interface Props {
  selectedUser: AdminUserListRow | null
  detail: AdminUserDetail | null
  isLoading: boolean
  error: string
  isOverrideSaving: boolean
  overrideError: string
  overrideSuccess: string
}

type DetailTabId = 'details' | 'ledger' | 'activity'

interface DetailTab {
  id: DetailTabId
  label: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  retry: []
  submitManualOverride: [payload: { manual_reputation_level: ReputationLevel | null; note: string }]
}>()

const tabs: readonly DetailTab[] = [
  { id: 'details', label: 'Детали о пользователе' },
  { id: 'ledger', label: 'Журнал репутации' },
  { id: 'activity', label: 'Журнал событий' },
]

const activeTab = shallowRef<DetailTabId>('details')
const isOverrideDisclosureOpen = shallowRef(false)
const selectedUserId = computed(() => props.selectedUser?.user_id ?? null)

function tabId(tabId: DetailTabId) {
  return `admin-user-detail-tab-${tabId}`
}

function panelId(tabId: DetailTabId) {
  return `admin-user-detail-panel-${tabId}`
}

function isActiveTab(tabId: DetailTabId) {
  return activeTab.value === tabId
}

function selectTab(tabId: DetailTabId) {
  activeTab.value = tabId
}

function syncOverrideDisclosure(event: Event) {
  const target = event.currentTarget as HTMLDetailsElement

  if (target.dataset.userId !== (selectedUserId.value ?? '')) {
    return
  }

  isOverrideDisclosureOpen.value = target.open
}

watch(selectedUserId, () => {
  activeTab.value = 'details'
  isOverrideDisclosureOpen.value = false
})
</script>

<template>
  <section class="admin-detail" data-testid="admin-user-detail" aria-labelledby="admin-user-detail-title">
    <div class="admin-detail__header">
      <div>
        <p class="admin-detail__eyebrow">Детали</p>
        <h2 id="admin-user-detail-title" class="admin-detail__title">Репутация пользователя</h2>
      </div>
      <AppButton v-if="selectedUser" variant="secondary" size="compact" :disabled="isLoading" @click="emit('retry')">
        Обновить
      </AppButton>
    </div>

    <InlineFeedbackPanel
      v-if="!selectedUser"
      data-testid="admin-user-detail-empty"
      title="Выберите пользователя"
      description="Откройте запись из списка, чтобы увидеть репутацию и журнал изменений."
    />

    <template v-else>
      <div class="admin-detail__selected-context" data-testid="admin-user-detail-selected-context">
        <strong>{{ selectedUser.user_name }}</strong>
        <span>{{ selectedUser.user_email }}</span>
      </div>

      <p v-if="isLoading" class="admin-detail__status" data-testid="admin-user-detail-loading" role="status">
        Загружаем детали пользователя…
      </p>

      <InlineFeedbackPanel
        v-else-if="error"
        data-testid="admin-user-detail-error"
        :title="error"
        description="Служебные сведения скрыты. Выбранный пользователь остался видимым."
        tone="danger"
        show-action
        action-label="Повторить загрузку"
        @action="emit('retry')"
      />

      <div class="admin-detail__tabs" data-testid="admin-user-detail-tabs" role="tablist" aria-label="Разделы управления пользователем">
        <button
          v-for="tab in tabs"
          :id="tabId(tab.id)"
          :key="tab.id"
          class="admin-detail__tab"
          :class="{ 'admin-detail__tab--active': isActiveTab(tab.id) }"
          type="button"
          role="tab"
          :aria-selected="isActiveTab(tab.id) ? 'true' : 'false'"
          :aria-controls="panelId(tab.id)"
          :tabindex="isActiveTab(tab.id) ? 0 : -1"
          :data-testid="tabId(tab.id)"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <section
        :id="panelId('details')"
        class="admin-detail__tabpanel"
        data-testid="admin-user-detail-panel-details"
        role="tabpanel"
        :aria-labelledby="tabId('details')"
        :hidden="!isActiveTab('details')"
        tabindex="0"
      >
        <template v-if="detail && !isLoading && !error">
          <dl class="admin-detail__summary" data-testid="admin-user-reputation-summary">
            <div class="admin-detail__summary-item">
              <dt>Email</dt>
              <dd>{{ detail.user_email }}</dd>
            </div>
            <div class="admin-detail__summary-item">
              <dt>Роль</dt>
              <dd>{{ detail.user_role === 'admin' ? 'Администратор' : 'Пользователь' }}</dd>
            </div>
            <div class="admin-detail__summary-item">
              <dt>Очки</dt>
              <dd>{{ detail.reputation.score }}</dd>
            </div>
            <div class="admin-detail__summary-item">
              <dt>Эффективный уровень</dt>
              <dd>{{ detail.reputation.level_label }}</dd>
            </div>
            <div class="admin-detail__summary-item">
              <dt>Уровень по очкам</dt>
              <dd>{{ detail.reputation.manual_level ? detail.reputation.level_label : 'Совпадает с эффективным уровнем' }}</dd>
            </div>
            <div class="admin-detail__summary-item">
              <dt>Ручной уровень</dt>
              <dd>
                {{ detail.reputation.is_manual_override ? detail.reputation.manual_level ?? 'Задан' : 'Не задан' }}
              </dd>
            </div>
            <div class="admin-detail__summary-item">
              <dt>До следующего уровня</dt>
              <dd>
                <span v-if="detail.reputation.next_level_label">
                  {{ detail.reputation.points_to_next_level }} до {{ detail.reputation.next_level_label }}
                </span>
                <span v-else>Максимальный уровень</span>
              </dd>
            </div>
          </dl>

          <details
            :key="selectedUserId ?? 'no-selected-user'"
            class="admin-detail__override-expander"
            data-testid="admin-manual-override-expander"
            :data-user-id="selectedUserId ?? ''"
            :open="isOverrideDisclosureOpen"
            @toggle="syncOverrideDisclosure"
          >
            <summary class="admin-detail__override-summary" data-testid="admin-manual-override-summary">
              <span>Изменить ручной уровень репутации</span>
              <span class="admin-detail__override-summary-hint">Открыть форму аудируемого изменения</span>
            </summary>

            <AdminManualOverrideForm
              :detail="detail"
              :is-saving="isOverrideSaving"
              :error="overrideError"
              :success="overrideSuccess"
              @submit="emit('submitManualOverride', $event)"
            />
          </details>
        </template>
      </section>

      <section
        :id="panelId('ledger')"
        class="admin-detail__tabpanel"
        data-testid="admin-user-detail-panel-ledger"
        role="tabpanel"
        :aria-labelledby="tabId('ledger')"
        :hidden="!isActiveTab('ledger')"
        tabindex="0"
      >
        <AdminReputationLedger v-if="detail && !isLoading && !error" :entries="detail.reputation_ledger" />
      </section>

      <section
        :id="panelId('activity')"
        class="admin-detail__tabpanel"
        data-testid="admin-user-detail-panel-activity"
        role="tabpanel"
        :aria-labelledby="tabId('activity')"
        :hidden="!isActiveTab('activity')"
        tabindex="0"
      >
        <AdminUserActivityTimeline :selected-user="selectedUser" />
      </section>
    </template>
  </section>
</template>

<style scoped>
.admin-detail {
  display: grid;
  gap: var(--space-md);
}

.admin-detail__header,
.admin-detail__selected-context {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  justify-content: space-between;
}

.admin-detail__selected-context {
  justify-content: flex-start;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 0.56);
}

.admin-detail__selected-context span,
.admin-detail__status {
  color: var(--color-muted);
}

.admin-detail__eyebrow,
.admin-detail__title,
.admin-detail__status {
  margin: 0;
}

.admin-detail__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-detail__title {
  font-size: 24px;
  line-height: 1.15;
}

.admin-detail__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.5);
}

.admin-detail__tab {
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font-weight: 800;
}

.admin-detail__tab--active {
  border-color: var(--color-accent);
  background: rgb(12 100 125 / 0.12);
  color: var(--color-accent);
}

.admin-detail__tab:focus-visible {
  outline: 3px solid rgb(12 100 125 / 0.28);
  outline-offset: 2px;
}

.admin-detail__tabpanel {
  display: grid;
  gap: var(--space-md);
}

.admin-detail__tabpanel[hidden] {
  display: none;
}

.admin-detail__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
  margin: 0;
}

.admin-detail__summary-item {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.68);
}

.admin-detail__summary-item dt {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}

.admin-detail__summary-item dd {
  margin: 0;
  font-weight: 700;
}

.admin-detail__override-expander {
  overflow: hidden;
  border: 1px solid rgb(12 100 125 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.72);
  box-shadow: 0 14px 32px rgb(15 23 42 / 0.08), 0 2px 6px rgb(15 23 42 / 0.05);
}

.admin-detail__override-summary {
  display: grid;
  gap: var(--space-xs);
  min-height: 48px;
  padding: var(--space-md);
  color: var(--color-accent);
  cursor: pointer;
  font-weight: 800;
  text-wrap: balance;
  transition-property: background-color, color;
  transition-duration: 160ms;
  transition-timing-function: ease;
}

.admin-detail__override-summary:hover {
  background: rgb(12 100 125 / 0.08);
}

.admin-detail__override-summary:focus-visible {
  outline: 3px solid rgb(12 100 125 / 0.28);
  outline-offset: -3px;
}

.admin-detail__override-summary-hint {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 600;
}

.admin-detail__override-expander[open] .admin-detail__override-summary {
  border-bottom: 1px solid rgb(12 100 125 / 0.14);
  background: rgb(12 100 125 / 0.1);
}

.admin-detail__override-expander :deep(.admin-manual-override-form) {
  border: 0;
  border-radius: 0;
  background: rgb(255 255 255 / 0.86);
  box-shadow: none;
}

@media (width <= 720px) {
  .admin-detail__header,
  .admin-detail__selected-context {
    display: grid;
    justify-content: stretch;
  }

  .admin-detail__tabs {
    display: grid;
  }

  .admin-detail__summary {
    grid-template-columns: 1fr;
  }
}
</style>
