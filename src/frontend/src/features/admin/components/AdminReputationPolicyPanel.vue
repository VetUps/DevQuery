<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { onMounted } from 'vue'

import { useAdminReputationPolicyConfig } from '@/features/admin/composables/useAdminReputationPolicyConfig'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const policyConfig = useAdminReputationPolicyConfig()

onMounted(() => {
  void policyConfig.loadConfig()
})
</script>

<template>
  <SurfacePanel class="admin-policy-panel" padding="lg" data-testid="admin-policy-panel">
    <div class="admin-policy-panel__header">
      <p class="admin-policy-panel__eyebrow">Политика репутации</p>
      <h2 class="admin-policy-panel__title">Защитное окно для новичков</h2>
      <p class="admin-policy-panel__description">
        Настройте, сколько часов после публикации вопрос защищён от ответов пользователей без достаточной репутации.
      </p>
    </div>

    <InlineFeedbackPanel
      v-if="policyConfig.isLoading.value && !policyConfig.isLoaded.value"
      data-testid="admin-policy-loading"
      title="Загружаем настройки"
      description="Получаем актуальное значение из административного API."
    />

    <InlineFeedbackPanel
      v-else-if="policyConfig.loadError.value && !policyConfig.isLoaded.value"
      data-testid="admin-policy-load-error"
      title="Не удалось загрузить политику"
      :description="policyConfig.loadError.value"
      action-label="Повторить"
      show-action
      tone="danger"
      @action="policyConfig.loadConfig"
    />

    <form v-else class="admin-policy-panel__form" data-testid="admin-policy-form" @submit.prevent="policyConfig.saveConfig">
      <div class="admin-policy-panel__summary" data-testid="admin-policy-current-value">
        <span class="admin-policy-panel__summary-label">Текущее значение</span>
        <strong>{{ policyConfig.currentHours.value }} ч.</strong>
      </div>

      <div class="admin-policy-panel__field">
        <label class="admin-policy-panel__label" for="admin-policy-hours-input">
          Длительность защитного окна, часы
        </label>
        <input
          id="admin-policy-hours-input"
          v-model="policyConfig.editableHours.value"
          class="admin-policy-panel__input"
          data-testid="admin-policy-hours-input"
          type="number"
          inputmode="numeric"
          min="1"
          :max="policyConfig.maxHours.value"
          step="1"
          :aria-invalid="Boolean(policyConfig.fieldError.value)"
          :aria-describedby="policyConfig.fieldError.value ? 'admin-policy-field-error' : 'admin-policy-help'"
        >
        <p id="admin-policy-help" class="admin-policy-panel__help">
          Допустимый диапазон: от 1 до {{ policyConfig.maxHours.value }} ч. Порог репутации в этом разделе не изменяется.
        </p>
        <p
          v-if="policyConfig.fieldError.value"
          id="admin-policy-field-error"
          class="admin-policy-panel__field-error"
          data-testid="admin-policy-field-error"
          role="alert"
        >
          {{ policyConfig.fieldError.value }}
        </p>
      </div>

      <div class="admin-policy-panel__actions">
        <AppButton
          data-testid="admin-policy-save"
          type="submit"
          :disabled="!policyConfig.canSave.value"
        >
          {{ policyConfig.isSaving.value ? 'Сохраняем…' : 'Сохранить' }}
        </AppButton>
        <span
          v-if="policyConfig.isSaving.value"
          class="admin-policy-panel__status"
          data-testid="admin-policy-saving"
          aria-live="polite"
        >
          Сохранение выполняется…
        </span>
        <span
          v-else-if="policyConfig.hasUnchangedValue.value && !policyConfig.fieldError.value"
          class="admin-policy-panel__status"
          data-testid="admin-policy-unchanged"
        >
          Значение совпадает с сохранённым.
        </span>
      </div>

      <p
        v-if="policyConfig.saveError.value"
        class="admin-policy-panel__save-error"
        data-testid="admin-policy-save-error"
        role="alert"
      >
        {{ policyConfig.saveError.value }}
      </p>
      <p
        v-if="policyConfig.saveSuccess.value"
        class="admin-policy-panel__save-success"
        data-testid="admin-policy-save-success"
        aria-live="polite"
      >
        {{ policyConfig.saveSuccess.value }}
      </p>
    </form>
  </SurfacePanel>
</template>

<style scoped>
.admin-policy-panel,
.admin-policy-panel__form,
.admin-policy-panel__field {
  display: grid;
  gap: var(--space-md);
}

.admin-policy-panel__header,
.admin-policy-panel__summary {
  display: grid;
  gap: var(--space-sm);
}

.admin-policy-panel__eyebrow,
.admin-policy-panel__title,
.admin-policy-panel__description,
.admin-policy-panel__summary-label,
.admin-policy-panel__help,
.admin-policy-panel__field-error,
.admin-policy-panel__save-error,
.admin-policy-panel__save-success {
  margin: 0;
}

.admin-policy-panel__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-policy-panel__title {
  font-size: 24px;
  line-height: 1.15;
}

.admin-policy-panel__description,
.admin-policy-panel__help,
.admin-policy-panel__status {
  color: var(--color-muted);
  line-height: 1.6;
}

.admin-policy-panel__summary {
  width: fit-content;
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(14 116 144 / 0.07);
}

.admin-policy-panel__summary-label,
.admin-policy-panel__label {
  font-weight: 700;
}

.admin-policy-panel__input {
  width: min(100%, 260px);
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.78);
  color: var(--color-text);
  font: inherit;
}

.admin-policy-panel__input:focus-visible {
  outline: 3px solid rgb(14 116 144 / 0.24);
  outline-offset: 2px;
}

.admin-policy-panel__input[aria-invalid='true'] {
  border-color: rgb(194 65 12 / 0.64);
}

.admin-policy-panel__field-error,
.admin-policy-panel__save-error {
  color: #9a3412;
  font-weight: 600;
}

.admin-policy-panel__save-success {
  color: #166534;
  font-weight: 600;
}

.admin-policy-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: center;
}
</style>
