<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { SolutionEditRecord } from '@/features/solutions/api/solutionEdits'
import SolutionEditComparePane from '@/features/solutions/components/SolutionEditComparePane.vue'
import { normalizeSolutionEditModerationError } from '@/features/solutions/libs/solution-edit-errors'
import {
  formatSolutionEditStatus,
  resolveSolutionEditStatusTone,
} from '@/features/solutions/libs/solution-edit-status'
import { useModerateSolutionEditMutation } from '@/features/solutions/mutations/useModerateSolutionEditMutation'
import { formatDateTime } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

type ModerationAction = 'approve' | 'disapprove' | null

const props = withDefaults(defineProps<{
  open: boolean
  edit: SolutionEditRecord | null
  readonly?: boolean
}>(), {
  readonly: false,
})

const emit = defineEmits<{
  close: []
  moderated: [approved: boolean]
}>()

const moderateSolutionEditMutation = useModerateSolutionEditMutation()
const activeAction = ref<ModerationAction>(null)
const summary = ref('')

const canModerate = computed(() => !props.readonly && props.edit?.solution_edit_is_approved === null)
const modalTitle = computed(() => props.readonly ? 'История правки' : 'Проверка правки')
const modalDescription = computed(() => (
  props.readonly
    ? 'Сравните версии решения и посмотрите, какие изменения уже были обработаны.'
    : 'Сравните исходное решение с предложенной правкой и решите, что делать дальше.'
))
const statusLabel = computed(() => formatSolutionEditStatus(props.edit?.solution_edit_is_approved ?? null))
const statusTone = computed(() => resolveSolutionEditStatusTone(props.edit?.solution_edit_is_approved ?? null))

watch(
  () => [props.open, props.edit?.solution_edit_id],
  () => {
    activeAction.value = null
    summary.value = ''
  },
)

async function handleModeration(approve: boolean) {
  if (!props.edit || props.readonly) {
    return
  }

  activeAction.value = approve ? 'approve' : 'disapprove'
  summary.value = ''

  try {
    await moderateSolutionEditMutation.mutateAsync({
      solutionEditId: props.edit.solution_edit_id,
      solutionId: props.edit.solution_id,
      questionId: props.edit.solution_question_id,
      approve,
    })

    emit('moderated', approve)
  } catch (error) {
    summary.value = normalizeSolutionEditModerationError(error)
  } finally {
    activeAction.value = null
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    size="wide"
    :title="modalTitle"
    :description="modalDescription"
    @close="$emit('close')"
  >
    <div v-if="edit" class="profile-edit-review-modal">
      <p v-if="summary" class="profile-edit-review-modal__summary">{{ summary }}</p>

      <div class="profile-edit-review-modal__meta">
        <SurfacePanel padding="lg" variant="muted">
          <div class="profile-edit-review-modal__meta-copy">
            <p class="profile-edit-review-modal__eyebrow">{{ edit.solution_question_title }}</p>
            <h3 class="profile-edit-review-modal__title">
              {{ readonly ? 'Зафиксированная правка' : `Правка от ${edit.edit_author_name}` }}
            </h3>
            <p class="profile-edit-review-modal__excerpt">{{ edit.solution_excerpt }}</p>
          </div>
        </SurfacePanel>

        <div class="profile-edit-review-modal__facts">
          <div class="profile-edit-review-modal__fact">
            <span class="profile-edit-review-modal__fact-label">Автор</span>
            <strong>{{ edit.edit_author_name }}</strong>
          </div>
          <div class="profile-edit-review-modal__fact">
            <span class="profile-edit-review-modal__fact-label">Дата</span>
            <time :datetime="edit.solution_edit_edited_at">
              {{ formatDateTime(edit.solution_edit_edited_at) }}
            </time>
          </div>
          <div class="profile-edit-review-modal__fact">
            <span class="profile-edit-review-modal__fact-label">Статус</span>
            <span
              class="profile-edit-review-modal__status"
              :class="`profile-edit-review-modal__status--${statusTone}`"
            >
              {{ statusLabel }}
            </span>
          </div>
        </div>
      </div>

      <SolutionEditComparePane
        :before="edit.solution_edit_body_before"
        :after="edit.solution_edit_body_after"
      />

      <div v-if="canModerate" class="profile-edit-review-modal__footer">
        <p class="profile-edit-review-modal__hint">
          Решение обновится только после одобрения. Отклонённая правка останется в приватной истории автора решения.
        </p>

        <div class="profile-edit-review-modal__actions">
          <AppButton
            type="button"
            variant="ghost"
            :disabled="Boolean(activeAction)"
            @click="handleModeration(false)"
          >
            {{ activeAction === 'disapprove' ? 'Отклоняем...' : 'Отклонить' }}
          </AppButton>
          <AppButton
            type="button"
            :disabled="Boolean(activeAction)"
            @click="handleModeration(true)"
          >
            {{ activeAction === 'approve' ? 'Одобряем...' : 'Одобрить' }}
          </AppButton>
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.profile-edit-review-modal,
.profile-edit-review-modal__meta,
.profile-edit-review-modal__meta-copy,
.profile-edit-review-modal__facts {
  display: grid;
  min-width: 0;
}

.profile-edit-review-modal {
  gap: var(--space-lg);
}

.profile-edit-review-modal__summary,
.profile-edit-review-modal__eyebrow,
.profile-edit-review-modal__title,
.profile-edit-review-modal__excerpt,
.profile-edit-review-modal__hint,
.profile-edit-review-modal__fact {
  margin: 0;
  overflow-wrap: anywhere;
}

.profile-edit-review-modal__summary {
  padding: var(--space-md);
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(180 35 24 / 0.08);
  color: #B42318;
}

.profile-edit-review-modal__meta {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: var(--space-lg);
}

.profile-edit-review-modal__meta-copy {
  gap: var(--space-xs);
}

.profile-edit-review-modal__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-edit-review-modal__title {
  font-size: 24px;
  line-height: 1.08;
}

.profile-edit-review-modal__excerpt,
.profile-edit-review-modal__fact-label,
.profile-edit-review-modal__hint {
  color: var(--color-muted);
}

.profile-edit-review-modal__facts {
  gap: var(--space-sm);
  align-content: start;
}

.profile-edit-review-modal__fact {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.78);
}

.profile-edit-review-modal__fact-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.profile-edit-review-modal__status {
  justify-self: start;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.profile-edit-review-modal__status--pending {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.profile-edit-review-modal__status--approved {
  background: rgb(47 133 90 / 0.12);
  color: #2F855A;
}

.profile-edit-review-modal__status--rejected {
  background: rgb(180 35 24 / 0.12);
  color: #B42318;
}

.profile-edit-review-modal__footer,
.profile-edit-review-modal__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.profile-edit-review-modal__hint {
  max-width: 52ch;
  line-height: 1.6;
}

@media (width <= 900px) {
  .profile-edit-review-modal__meta {
    grid-template-columns: 1fr;
  }
}
</style>
