<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import type { AdminUserDetail } from '@/features/admin/api/admin'
import type { ReputationLevel } from '@/features/users/api/reputation'
import AppButton from '@/shared/ui/AppButton.vue'

type OverrideSelection = ReputationLevel | '__clear__'

interface Props {
  detail: AdminUserDetail
  isSaving: boolean
  error: string
  success: string
}

interface SubmitPayload {
  manual_reputation_level: ReputationLevel | null
  note: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  submit: [payload: SubmitPayload]
}>()

const selectedLevel = shallowRef<OverrideSelection>('__clear__')
const note = shallowRef('')
const validationError = shallowRef('')

const levelOptions: Array<{ value: OverrideSelection; label: string }> = [
  { value: '__clear__', label: 'Очистить ручной уровень' },
  { value: 'newcomer', label: 'Новичок' },
  { value: 'participant', label: 'Участник' },
  { value: 'expert', label: 'Эксперт' },
  { value: 'master', label: 'Мастер' },
]

const isValidLevel = computed(() => levelOptions.some((option) => option.value === selectedLevel.value))
const trimmedNote = computed(() => note.value.trim())
const isSubmitDisabled = computed(() => props.isSaving || !props.detail.user_id)
const feedbackMessage = computed(() => validationError.value || props.error || props.success)
const feedbackTone = computed(() => (validationError.value || props.error ? 'danger' : 'success'))

watch(
  () => props.detail.user_id,
  () => {
    selectedLevel.value = props.detail.reputation.manual_level && props.detail.reputation.is_manual_override
      ? props.detail.reputation.manual_level as ReputationLevel
      : '__clear__'
    note.value = ''
    validationError.value = ''
  },
  { immediate: true },
)

function handleSubmit() {
  validationError.value = ''

  if (!isValidLevel.value) {
    validationError.value = 'Выберите корректный уровень репутации.'
    return
  }

  if (!trimmedNote.value) {
    validationError.value = 'Добавьте заметку для аудита изменения.'
    return
  }

  emit('submit', {
    manual_reputation_level: selectedLevel.value === '__clear__' ? null : selectedLevel.value,
    note: trimmedNote.value,
  })
}
</script>

<template>
  <form
    class="admin-manual-override-form"
    data-testid="admin-manual-override-form"
    aria-labelledby="admin-manual-override-title"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <div class="admin-manual-override-form__header">
      <div>
        <p class="admin-manual-override-form__eyebrow">Ручное управление</p>
        <h3 id="admin-manual-override-title" class="admin-manual-override-form__title">Уровень репутации</h3>
      </div>
      <p class="admin-manual-override-form__current" data-testid="admin-manual-override-current">
        Сейчас: {{ detail.reputation.is_manual_override ? detail.reputation.manual_level ?? 'задан' : 'не задан' }}
      </p>
    </div>

    <label class="admin-manual-override-form__field" for="admin-manual-override-level">
      <span>Действие</span>
      <select
        id="admin-manual-override-level"
        v-model="selectedLevel"
        :disabled="isSaving"
        :aria-invalid="validationError && !isValidLevel ? 'true' : 'false'"
        aria-describedby="admin-manual-override-help admin-manual-override-feedback"
        data-testid="admin-manual-override-level"
      >
        <option v-for="option in levelOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <label class="admin-manual-override-form__field" for="admin-manual-override-note">
      <span>Заметка администратора</span>
      <textarea
        id="admin-manual-override-note"
        v-model="note"
        rows="3"
        required
        :disabled="isSaving"
        :aria-invalid="validationError && !trimmedNote ? 'true' : 'false'"
        aria-describedby="admin-manual-override-help admin-manual-override-feedback"
        data-testid="admin-manual-override-note"
      />
    </label>

    <p id="admin-manual-override-help" class="admin-manual-override-form__help">
      Заметка обязательна и будет сохранена в журнале аудита. Очки репутации не меняются локально.
    </p>

    <p
      v-if="feedbackMessage"
      id="admin-manual-override-feedback"
      class="admin-manual-override-form__feedback"
      :class="`admin-manual-override-form__feedback--${feedbackTone}`"
      role="alert"
      data-testid="admin-manual-override-feedback"
    >
      {{ feedbackMessage }}
    </p>

    <div class="admin-manual-override-form__actions">
      <AppButton type="submit" :disabled="isSubmitDisabled" data-testid="admin-manual-override-submit">
        {{ isSaving ? 'Сохраняем…' : 'Сохранить ручной уровень' }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.admin-manual-override-form {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.7);
}

.admin-manual-override-form__header {
  display: flex;
  gap: var(--space-md);
  align-items: start;
  justify-content: space-between;
}

.admin-manual-override-form__eyebrow,
.admin-manual-override-form__title,
.admin-manual-override-form__current,
.admin-manual-override-form__help,
.admin-manual-override-form__feedback {
  margin: 0;
}

.admin-manual-override-form__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-manual-override-form__title {
  font-size: 20px;
  line-height: 1.2;
}

.admin-manual-override-form__current,
.admin-manual-override-form__help {
  color: var(--color-muted);
}

.admin-manual-override-form__field {
  display: grid;
  gap: var(--space-xs);
  font-weight: 700;
}

.admin-manual-override-form__field select,
.admin-manual-override-form__field textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  background: #fff;
  color: var(--color-text);
  font: inherit;
}

.admin-manual-override-form__field textarea {
  resize: vertical;
}

.admin-manual-override-form__feedback {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-weight: 700;
}

.admin-manual-override-form__feedback--danger {
  background: rgb(254 226 226 / 0.72);
  color: #991b1b;
}

.admin-manual-override-form__feedback--success {
  background: rgb(220 252 231 / 0.72);
  color: #166534;
}

.admin-manual-override-form__actions {
  display: flex;
  justify-content: flex-start;
}

@media (width <= 720px) {
  .admin-manual-override-form__header {
    display: grid;
  }
}
</style>
