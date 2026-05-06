<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { QuestionEditRecord } from '@/features/questions/api/questionEdits'
import { normalizeQuestionEditModerationError } from '@/features/questions/libs/question-edit-errors'
import { useModerateQuestionEditMutation } from '@/features/questions/mutations/useModerateQuestionEditMutation'
import SolutionEditComparePane from '@/features/solutions/components/SolutionEditComparePane.vue'
import { formatDateTime } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

type ModerationAction = 'approve' | 'disapprove' | null

const props = defineProps<{
  open: boolean
  edit: QuestionEditRecord | null
}>()

const emit = defineEmits<{
  close: []
  moderated: [approved: boolean]
}>()

const moderateQuestionEditMutation = useModerateQuestionEditMutation()
const activeAction = ref<ModerationAction>(null)
const summary = ref('')

const isModerating = computed(() => Boolean(activeAction.value) || moderateQuestionEditMutation.isPending.value)
const addedTags = computed(() => {
  if (!props.edit) {
    return []
  }

  const before = new Set(props.edit.question_edit_tags_before)
  return props.edit.question_edit_tags_after.filter((tag) => !before.has(tag))
})
const removedTags = computed(() => {
  if (!props.edit) {
    return []
  }

  const after = new Set(props.edit.question_edit_tags_after)
  return props.edit.question_edit_tags_before.filter((tag) => !after.has(tag))
})
const unchangedTags = computed(() => {
  if (!props.edit) {
    return []
  }

  const after = new Set(props.edit.question_edit_tags_after)
  return props.edit.question_edit_tags_before.filter((tag) => after.has(tag))
})

watch(
  () => [props.open, props.edit?.question_edit_id],
  () => {
    activeAction.value = null
    summary.value = ''
  },
)

async function handleModeration(approve: boolean) {
  if (!props.edit) {
    return
  }

  activeAction.value = approve ? 'approve' : 'disapprove'
  summary.value = ''

  try {
    await moderateQuestionEditMutation.mutateAsync({
      questionEditId: props.edit.question_edit_id,
      questionId: props.edit.question,
      approve,
    })

    emit('moderated', approve)
  } catch (error) {
    summary.value = normalizeQuestionEditModerationError(error)
  } finally {
    activeAction.value = null
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    size="wide"
    title="Проверка правки вопроса"
    description="Сравните исходный вопрос с предложением сообщества и выберите, применять ли изменения."
    @close="emit('close')"
  >
    <div v-if="edit" class="profile-question-edit-review-modal">
      <p v-if="summary" class="profile-question-edit-review-modal__summary" role="alert">
        {{ summary }}
      </p>

      <div class="profile-question-edit-review-modal__meta">
        <SurfacePanel padding="lg" variant="muted">
          <div class="profile-question-edit-review-modal__meta-copy">
            <p class="profile-question-edit-review-modal__eyebrow">{{ edit.question_title }}</p>
            <h3 class="profile-question-edit-review-modal__title">
              Правка вопроса от {{ edit.edit_author_name }}
            </h3>
            <p class="profile-question-edit-review-modal__copy">
              Автор предложения: {{ edit.edit_author_name }} · {{ formatDateTime(edit.question_edit_edited_at) }}
            </p>
          </div>
        </SurfacePanel>

        <div class="profile-question-edit-review-modal__facts">
          <div class="profile-question-edit-review-modal__fact">
            <span>Вопрос</span>
            <strong>{{ edit.question }}</strong>
          </div>
          <div class="profile-question-edit-review-modal__fact">
            <span>Статус</span>
            <strong>Ожидает проверки</strong>
          </div>
        </div>
      </div>

      <section class="profile-question-edit-review-modal__title-grid" aria-label="Сравнение заголовка вопроса">
        <div>
          <p class="profile-question-edit-review-modal__eyebrow">Старый заголовок</p>
          <h3>{{ edit.question_edit_title_before }}</h3>
        </div>
        <div>
          <p class="profile-question-edit-review-modal__eyebrow">Новый заголовок</p>
          <h3>{{ edit.question_edit_title_after }}</h3>
        </div>
      </section>

      <SolutionEditComparePane
        :before="edit.question_edit_body_before"
        :after="edit.question_edit_body_after"
      />

      <section class="profile-question-edit-review-modal__tags" aria-label="Сравнение тегов вопроса">
        <div>
          <p class="profile-question-edit-review-modal__eyebrow">Добавятся</p>
          <p v-if="!addedTags.length" class="profile-question-edit-review-modal__copy">Новых тегов нет.</p>
          <span v-for="tag in addedTags" :key="`added-${tag}`" class="profile-question-edit-review-modal__tag profile-question-edit-review-modal__tag--added">
            + #{{ tag }}
          </span>
        </div>
        <div>
          <p class="profile-question-edit-review-modal__eyebrow">Удалятся</p>
          <p v-if="!removedTags.length" class="profile-question-edit-review-modal__copy">Удалённых тегов нет.</p>
          <span v-for="tag in removedTags" :key="`removed-${tag}`" class="profile-question-edit-review-modal__tag profile-question-edit-review-modal__tag--removed">
            - #{{ tag }}
          </span>
        </div>
        <div>
          <p class="profile-question-edit-review-modal__eyebrow">Останутся</p>
          <p v-if="!unchangedTags.length" class="profile-question-edit-review-modal__copy">Общих тегов нет.</p>
          <span v-for="tag in unchangedTags" :key="`same-${tag}`" class="profile-question-edit-review-modal__tag">
            #{{ tag }}
          </span>
        </div>
      </section>

      <div class="profile-question-edit-review-modal__footer">
        <p class="profile-question-edit-review-modal__hint">
          Одобрение применит заголовок, текст и теги вопроса через backend lifecycle. Отклонение не изменит вопрос.
        </p>

        <div class="profile-question-edit-review-modal__actions">
          <AppButton type="button" variant="ghost" :disabled="isModerating" @click="handleModeration(false)">
            {{ activeAction === 'disapprove' ? 'Отклоняем...' : 'Отклонить' }}
          </AppButton>
          <AppButton type="button" :disabled="isModerating" @click="handleModeration(true)">
            {{ activeAction === 'approve' ? 'Одобряем...' : 'Одобрить' }}
          </AppButton>
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.profile-question-edit-review-modal,
.profile-question-edit-review-modal__meta,
.profile-question-edit-review-modal__meta-copy,
.profile-question-edit-review-modal__facts,
.profile-question-edit-review-modal__title-grid,
.profile-question-edit-review-modal__tags {
  display: grid;
  min-width: 0;
}

.profile-question-edit-review-modal {
  gap: var(--space-lg);
}

.profile-question-edit-review-modal__summary,
.profile-question-edit-review-modal__eyebrow,
.profile-question-edit-review-modal__title,
.profile-question-edit-review-modal__copy,
.profile-question-edit-review-modal__hint,
.profile-question-edit-review-modal__title-grid h3 {
  margin: 0;
  overflow-wrap: anywhere;
}

.profile-question-edit-review-modal__summary {
  padding: var(--space-md);
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: var(--radius-md);
  background: rgb(180 35 24 / 0.08);
  color: #b42318;
}

.profile-question-edit-review-modal__meta,
.profile-question-edit-review-modal__title-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-lg);
}

.profile-question-edit-review-modal__meta-copy,
.profile-question-edit-review-modal__facts {
  gap: var(--space-sm);
}

.profile-question-edit-review-modal__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-question-edit-review-modal__title,
.profile-question-edit-review-modal__title-grid h3 {
  font-size: 22px;
  line-height: 1.1;
}

.profile-question-edit-review-modal__copy,
.profile-question-edit-review-modal__hint,
.profile-question-edit-review-modal__fact span {
  color: var(--color-muted);
}

.profile-question-edit-review-modal__fact,
.profile-question-edit-review-modal__title-grid > div,
.profile-question-edit-review-modal__tags > div {
  display: grid;
  align-content: start;
  gap: var(--space-sm);
  min-width: 0;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.78);
}

.profile-question-edit-review-modal__tags {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.profile-question-edit-review-modal__tag {
  justify-self: start;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
}

.profile-question-edit-review-modal__tag--added {
  background: rgb(47 133 90 / 0.12);
  color: #2f855a;
}

.profile-question-edit-review-modal__tag--removed {
  background: rgb(180 35 24 / 0.12);
  color: #b42318;
}

.profile-question-edit-review-modal__footer,
.profile-question-edit-review-modal__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.profile-question-edit-review-modal__hint {
  max-width: 58ch;
  line-height: 1.6;
}

@media (width <= 900px) {
  .profile-question-edit-review-modal__meta,
  .profile-question-edit-review-modal__title-grid,
  .profile-question-edit-review-modal__tags {
    grid-template-columns: 1fr;
  }
}
</style>
