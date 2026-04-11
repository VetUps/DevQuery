<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import SolutionEditComparePane from '@/features/solutions/components/SolutionEditComparePane.vue'
import {
  formatSolutionEditStatus,
  resolveSolutionEditStatusTone,
} from '@/features/solutions/libs/solution-edit-status'
import { usePublicSolutionEditHistoryQuery } from '@/features/solutions/queries/usePublicSolutionEditHistoryQuery'
import { formatDateTime } from '@/shared/libs/formatting'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const props = defineProps<{
  open: boolean
  solutionId: string
}>()

defineEmits<{
  close: []
}>()

const selectedEditId = ref('')
const publicHistoryQuery = usePublicSolutionEditHistoryQuery(
  computed(() => props.solutionId),
  computed(() => props.open),
)

const historyItems = computed(() => publicHistoryQuery.data.value ?? [])
const selectedEdit = computed(() => (
  historyItems.value.find((item) => item.solution_edit_id === selectedEditId.value) ??
  historyItems.value[0] ??
  null
))

watch(
  () => [props.open, historyItems.value[0]?.solution_edit_id],
  () => {
    if (!props.open) {
      selectedEditId.value = ''
      return
    }

    if (!selectedEditId.value && historyItems.value[0]) {
      selectedEditId.value = historyItems.value[0].solution_edit_id
    }
  },
)
</script>

<template>
  <AppDialog
    :open="open"
    size="wide"
    title="История изменений"
    description="Здесь собраны только одобренные изменения этого решения."
    @close="$emit('close')"
  >
    <InlineFeedbackPanel
      v-if="publicHistoryQuery.isError.value"
      eyebrow="История изменений"
      title="Не удалось загрузить историю"
      description="Попробуйте запросить данные ещё раз."
      tone="danger"
      :show-action="true"
      data-testid="public-history-error"
      @action="publicHistoryQuery.refetch()"
    />

    <p v-else-if="publicHistoryQuery.isPending.value && !historyItems.length" class="public-solution-edit-history-modal__muted">
      Загружаем историю изменений...
    </p>

    <p v-else-if="!historyItems.length" class="public-solution-edit-history-modal__muted">
      У этого решения пока нет одобренных изменений.
    </p>

    <div v-else-if="selectedEdit" class="public-solution-edit-history-modal">
      <aside class="public-solution-edit-history-modal__list">
        <button
          v-for="item in historyItems"
          :key="item.solution_edit_id"
          type="button"
          class="public-solution-edit-history-modal__item"
          :class="{
            'public-solution-edit-history-modal__item--active':
              item.solution_edit_id === selectedEdit.solution_edit_id,
          }"
          :data-testid="`public-history-item-${item.solution_edit_id}`"
          @click="selectedEditId = item.solution_edit_id"
        >
          <strong>{{ item.edit_author_name }}</strong>
          <time :datetime="item.solution_edit_edited_at">
            {{ formatDateTime(item.solution_edit_edited_at) }}
          </time>
          <span
            class="public-solution-edit-history-modal__status"
            :class="`public-solution-edit-history-modal__status--${resolveSolutionEditStatusTone(item.solution_edit_is_approved)}`"
          >
            {{ formatSolutionEditStatus(item.solution_edit_is_approved) }}
          </span>
        </button>
      </aside>

      <div class="public-solution-edit-history-modal__content">
        <SurfacePanel padding="lg" variant="muted">
          <div class="public-solution-edit-history-modal__copy">
            <p class="public-solution-edit-history-modal__eyebrow">
              {{ selectedEdit.solution_question_title }}
            </p>
            <h3 class="public-solution-edit-history-modal__title">
              Изменение от {{ selectedEdit.edit_author_name }}
            </h3>
            <p class="public-solution-edit-history-modal__excerpt">
              {{ selectedEdit.solution_excerpt }}
            </p>
          </div>
        </SurfacePanel>

        <SolutionEditComparePane
          :before="selectedEdit.solution_edit_body_before"
          :after="selectedEdit.solution_edit_body_after"
        />
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.public-solution-edit-history-modal,
.public-solution-edit-history-modal__list,
.public-solution-edit-history-modal__content,
.public-solution-edit-history-modal__copy {
  display: grid;
  min-width: 0;
}

.public-solution-edit-history-modal {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-lg);
}

.public-solution-edit-history-modal__list,
.public-solution-edit-history-modal__content,
.public-solution-edit-history-modal__copy {
  gap: var(--space-sm);
}

.public-solution-edit-history-modal__list {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}

.public-solution-edit-history-modal__item {
  display: grid;
  gap: 4px;
  justify-items: start;
  width: 100%;
  flex: 0 1 240px;
  min-height: 92px;
  align-content: start;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.76);
  text-align: left;
}

.public-solution-edit-history-modal__item strong,
.public-solution-edit-history-modal__item time {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-solution-edit-history-modal__item time,
.public-solution-edit-history-modal__muted,
.public-solution-edit-history-modal__excerpt {
  color: var(--color-muted);
}

.public-solution-edit-history-modal__item--active {
  border-color: rgb(14 116 144 / 0.22);
  background: rgb(14 116 144 / 0.08);
}

.public-solution-edit-history-modal__status {
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.public-solution-edit-history-modal__status--pending {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.public-solution-edit-history-modal__status--approved {
  background: rgb(47 133 90 / 0.12);
  color: #2F855A;
}

.public-solution-edit-history-modal__status--rejected {
  background: rgb(180 35 24 / 0.12);
  color: #B42318;
}

.public-solution-edit-history-modal__eyebrow,
.public-solution-edit-history-modal__title,
.public-solution-edit-history-modal__excerpt,
.public-solution-edit-history-modal__muted {
  margin: 0;
  overflow-wrap: anywhere;
}

.public-solution-edit-history-modal__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.public-solution-edit-history-modal__title {
  font-size: 24px;
  line-height: 1.08;
}

@media (width <= 900px) {
  .public-solution-edit-history-modal {
    grid-template-columns: 1fr;
  }

  .public-solution-edit-history-modal__list {
    display: grid;
    grid-template-columns: 1fr;
  }

  .public-solution-edit-history-modal__item {
    flex-basis: auto;
  }
}
</style>
