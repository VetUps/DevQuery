<script setup lang="ts">
import { computed, ref } from 'vue'

import type { QuestionEditRecord } from '@/features/questions/api/questionEdits'
import ProfileQuestionEditReviewModal from '@/features/questions/components/ProfileQuestionEditReviewModal.vue'
import { useQuestionReviewQueueQuery } from '@/features/questions/queries/useQuestionReviewQueueQuery'
import { formatDateTime } from '@/shared/libs/formatting'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const questionReviewQueueQuery = useQuestionReviewQueueQuery()
const selectedEdit = ref<QuestionEditRecord | null>(null)
const successMessage = ref('')

const items = computed(() => {
  const queue = questionReviewQueueQuery.data.value ?? []

  return [...queue].sort(
    (left, right) =>
      new Date(right.question_edit_edited_at).getTime() - new Date(left.question_edit_edited_at).getTime(),
  )
})

function openEdit(item: QuestionEditRecord) {
  successMessage.value = ''
  selectedEdit.value = item
}

function handleModerated(approved: boolean) {
  selectedEdit.value = null
  successMessage.value = approved ? 'Правка вопроса одобрена.' : 'Правка вопроса отклонена.'
}
</script>

<template>
  <section class="profile-question-edit-review-queue" data-testid="profile-question-edit-review-queue">
    <header class="profile-question-edit-review-queue__header">
      <div>
        <p class="profile-question-edit-review-queue__eyebrow">Вопросы</p>
        <h2 class="profile-question-edit-review-queue__title">Предложения к вашим вопросам</h2>
      </div>
      <span class="profile-question-edit-review-queue__count" aria-label="Количество ожидающих правок вопросов">
        {{ items.length }} в ожидании
      </span>
    </header>

    <p v-if="successMessage" class="profile-question-edit-review-queue__success" role="status">
      {{ successMessage }}
    </p>

    <InlineFeedbackPanel
      v-if="questionReviewQueueQuery.isError.value"
      eyebrow="Проверка вопросов"
      title="Не удалось загрузить правки вопросов"
      description="Очередь правок к решениям останется доступной. Попробуйте обновить только этот список."
      tone="danger"
      :show-action="true"
      data-testid="question-review-queue-error"
      @action="questionReviewQueueQuery.refetch()"
    />

    <p
      v-else-if="questionReviewQueueQuery.isPending.value && !items.length"
      class="profile-question-edit-review-queue__muted"
      role="status"
    >
      Загружаем предложения к вопросам...
    </p>

    <p v-else-if="!items.length" class="profile-question-edit-review-queue__muted">
      Пока нет предложений к вашим вопросам.
    </p>

    <div v-else class="profile-question-edit-review-queue__list" aria-label="Очередь предложений к вопросам">
      <button
        v-for="item in items"
        :key="item.question_edit_id"
        type="button"
        class="profile-question-edit-review-queue__item"
        :data-testid="`question-review-item-${item.question_edit_id}`"
        @click="openEdit(item)"
      >
        <span class="profile-question-edit-review-queue__item-main">
          <span class="profile-question-edit-review-queue__item-title">{{ item.question_title }}</span>
          <span class="profile-question-edit-review-queue__item-copy">
            Правка от {{ item.edit_author_name }} · {{ formatDateTime(item.question_edit_edited_at) }}
          </span>
        </span>
        <span class="profile-question-edit-review-queue__item-tags" aria-label="Предлагаемые теги">
          <span v-for="tag in item.question_edit_tags_after" :key="tag">#{{ tag }}</span>
        </span>
      </button>
    </div>

    <ProfileQuestionEditReviewModal
      v-if="selectedEdit"
      :open="Boolean(selectedEdit)"
      :edit="selectedEdit"
      @close="selectedEdit = null"
      @moderated="handleModerated"
    />
  </section>
</template>

<style scoped>
.profile-question-edit-review-queue,
.profile-question-edit-review-queue__header,
.profile-question-edit-review-queue__list,
.profile-question-edit-review-queue__item-main {
  display: grid;
  min-width: 0;
}

.profile-question-edit-review-queue {
  gap: var(--space-md);
}

.profile-question-edit-review-queue__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--space-md);
}

.profile-question-edit-review-queue__eyebrow,
.profile-question-edit-review-queue__title,
.profile-question-edit-review-queue__muted,
.profile-question-edit-review-queue__success {
  margin: 0;
}

.profile-question-edit-review-queue__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-question-edit-review-queue__title {
  margin-top: 4px;
  font-size: 24px;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.profile-question-edit-review-queue__count {
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
}

.profile-question-edit-review-queue__success {
  padding: var(--space-md);
  border: 1px solid rgb(47 133 90 / 0.22);
  border-radius: var(--radius-md);
  background: rgb(47 133 90 / 0.08);
  color: #2f855a;
  font-weight: 700;
}

.profile-question-edit-review-queue__muted {
  color: var(--color-muted);
}

.profile-question-edit-review-queue__list {
  gap: var(--space-sm);
}

.profile-question-edit-review-queue__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-md);
  align-items: center;
  min-width: 0;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.78);
  color: var(--color-text);
  text-align: left;
}

.profile-question-edit-review-queue__item:hover,
.profile-question-edit-review-queue__item:focus-visible {
  border-color: rgb(14 116 144 / 0.26);
  background: rgb(14 116 144 / 0.08);
}

.profile-question-edit-review-queue__item-main {
  gap: 4px;
}

.profile-question-edit-review-queue__item-title {
  font-size: 17px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.profile-question-edit-review-queue__item-copy {
  color: var(--color-muted);
  font-size: 13px;
}

.profile-question-edit-review-queue__item-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--space-xs);
}

.profile-question-edit-review-queue__item-tags span {
  padding: 4px 9px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 800;
}

@media (width <= 760px) {
  .profile-question-edit-review-queue__header,
  .profile-question-edit-review-queue__item {
    grid-template-columns: 1fr;
  }

  .profile-question-edit-review-queue__item-tags {
    justify-content: start;
  }
}
</style>
