<script setup lang="ts">
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

defineProps<Props>()

defineEmits<{
  retry: []
  submitManualOverride: [payload: { manual_reputation_level: ReputationLevel | null; note: string }]
}>()
</script>

<template>
  <section class="admin-detail" data-testid="admin-user-detail" aria-labelledby="admin-user-detail-title">
    <div class="admin-detail__header">
      <div>
        <p class="admin-detail__eyebrow">Детали</p>
        <h2 id="admin-user-detail-title" class="admin-detail__title">Репутация пользователя</h2>
      </div>
      <AppButton v-if="selectedUser" variant="secondary" size="compact" :disabled="isLoading" @click="$emit('retry')">
        Обновить
      </AppButton>
    </div>

    <InlineFeedbackPanel
      v-if="!selectedUser"
      data-testid="admin-user-detail-empty"
      title="Выберите пользователя"
      description="Откройте запись из списка, чтобы увидеть репутацию и журнал изменений."
    />

    <div v-else class="admin-detail__selected-context" data-testid="admin-user-detail-selected-context">
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
      @action="$emit('retry')"
    />

    <template v-else-if="detail">
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

      <AdminManualOverrideForm
        :detail="detail"
        :is-saving="isOverrideSaving"
        :error="overrideError"
        :success="overrideSuccess"
        @submit="$emit('submitManualOverride', $event)"
      />

      <AdminReputationLedger :entries="detail.reputation_ledger" />
    </template>

    <AdminUserActivityTimeline :selected-user="selectedUser" />
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

@media (width <= 720px) {
  .admin-detail__header,
  .admin-detail__selected-context {
    display: grid;
    justify-content: stretch;
  }

  .admin-detail__summary {
    grid-template-columns: 1fr;
  }
}
</style>
