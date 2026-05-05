<script setup lang="ts">
import { computed } from 'vue'

import {
  normalizeQuestionRevisionError,
  type QuestionRevisionRecord,
} from '@/features/questions/api/questionRevisions'
import { useQuestionRevisionsQuery } from '@/features/questions/queries/useQuestionRevisionsQuery'
import { buildSolutionEditDiff, type SolutionEditDiffChunk } from '@/features/solutions/libs/solution-edit-diff'
import { formatLongDate } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

interface Props {
  open: boolean
  questionId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const revisionsQuery = useQuestionRevisionsQuery(() => props.questionId)

const revisions = computed(() => revisionsQuery.data.value?.results ?? [])
const hasRevisions = computed(() => revisions.value.length > 0)
const errorMessage = computed(() => normalizeQuestionRevisionError(revisionsQuery.error.value))

function closeModal() {
  emit('close')
}

const REVISION_SOURCE_LABELS: Record<string, string> = {
  direct_edit: 'Прямая правка автора',
  proposal_approval: 'Одобренная правка сообщества',
  approved_proposal: 'Одобренная правка сообщества',
}

function sourceLabel(source: string) {
  return REVISION_SOURCE_LABELS[source] ?? 'Правка вопроса'
}

function sourceDescription(revision: QuestionRevisionRecord) {
  if (revision.question_edit) {
    return `Предложение ${revision.question_edit}`
  }

  return 'Без связанного предложения'
}

function formatTags(tags: string[]) {
  if (tags.length === 0) {
    return 'Без тегов'
  }

  return tags.map((tag) => `#${tag}`).join(', ')
}

function titleChanged(revision: QuestionRevisionRecord) {
  return revision.title_before !== revision.title_after
}

function bodyChanged(revision: QuestionRevisionRecord) {
  return revision.body_before !== revision.body_after
}

function tagsChanged(revision: QuestionRevisionRecord) {
  return formatTags(revision.tags_before) !== formatTags(revision.tags_after)
}

function buildTextDiff(before: string, after: string) {
  return buildSolutionEditDiff(before, after)
}

function chunkClasses(chunk: SolutionEditDiffChunk) {
  return ['question-revision-history-modal__chunk', `question-revision-history-modal__chunk--${chunk.kind}`]
}
</script>

<template>
  <AppDialog
    :open="open"
    title="История изменений вопроса"
    description="Хронология прямых правок автора и одобренных предложений сообщества."
    size="wide"
    @close="closeModal"
  >
    <section class="question-revision-history-modal" data-testid="question-revision-history-modal">
      <div v-if="revisionsQuery.isPending.value" class="question-revision-history-modal__state" role="status">
        Загружаем историю изменений…
      </div>

      <InlineFeedbackPanel
        v-else-if="revisionsQuery.isError.value"
        eyebrow="История изменений"
        title="Не удалось загрузить историю"
        :description="errorMessage"
        :show-action="true"
        action-label="Повторить"
        tone="danger"
        data-testid="question-revision-history-error"
        @action="revisionsQuery.refetch()"
      />

      <div v-else-if="!hasRevisions" class="question-revision-history-modal__state" data-testid="question-revision-history-empty">
        <p class="question-revision-history-modal__empty-title">История пока пуста</p>
        <p class="question-revision-history-modal__empty-copy">
          У этого вопроса ещё нет сохранённых правок или одобренных предложений.
        </p>
      </div>

      <ol v-else class="question-revision-history-modal__list" data-testid="question-revision-history-list">
        <li
          v-for="revision in revisions"
          :key="revision.question_revision_id"
          class="question-revision-history-modal__item"
        >
          <article class="question-revision-history-modal__card">
            <header class="question-revision-history-modal__header">
              <div>
                <p class="question-revision-history-modal__eyebrow">{{ sourceLabel(revision.source) }}</p>
                <h3 class="question-revision-history-modal__title">
                  {{ revision.actor_name }} · {{ formatLongDate(revision.created_at) }}
                </h3>
              </div>
              <span class="question-revision-history-modal__source">{{ sourceDescription(revision) }}</span>
            </header>

            <div class="question-revision-history-modal__changes">
              <section class="question-revision-history-modal__change-block">
                <h4 class="question-revision-history-modal__change-title">Заголовок</h4>
                <p v-if="!titleChanged(revision)" class="question-revision-history-modal__unchanged">
                  Без изменений
                </p>
                <div v-else class="question-revision-history-modal__compare">
                  <div class="question-revision-history-modal__compare-column">
                    <span class="question-revision-history-modal__compare-label">До</span>
                    <p class="question-revision-history-modal__text">{{ revision.title_before }}</p>
                  </div>
                  <div class="question-revision-history-modal__compare-column">
                    <span class="question-revision-history-modal__compare-label">После</span>
                    <p class="question-revision-history-modal__text">{{ revision.title_after }}</p>
                  </div>
                </div>
              </section>

              <section class="question-revision-history-modal__change-block">
                <h4 class="question-revision-history-modal__change-title">Тело вопроса</h4>
                <p v-if="!bodyChanged(revision)" class="question-revision-history-modal__unchanged">
                  Без изменений
                </p>
                <div v-else class="question-revision-history-modal__compare question-revision-history-modal__compare--body">
                  <div class="question-revision-history-modal__compare-column">
                    <span class="question-revision-history-modal__compare-label">До</span>
                    <pre class="question-revision-history-modal__body"><span
                      v-for="(chunk, index) in buildTextDiff(revision.body_before, revision.body_after).before"
                      :key="`body-before-${revision.question_revision_id}-${index}`"
                      :class="chunkClasses(chunk)"
                    >{{ chunk.value }}</span></pre>
                  </div>
                  <div class="question-revision-history-modal__compare-column">
                    <span class="question-revision-history-modal__compare-label">После</span>
                    <pre class="question-revision-history-modal__body"><span
                      v-for="(chunk, index) in buildTextDiff(revision.body_before, revision.body_after).after"
                      :key="`body-after-${revision.question_revision_id}-${index}`"
                      :class="chunkClasses(chunk)"
                    >{{ chunk.value }}</span></pre>
                  </div>
                </div>
              </section>

              <section class="question-revision-history-modal__change-block">
                <h4 class="question-revision-history-modal__change-title">Теги</h4>
                <p v-if="!tagsChanged(revision)" class="question-revision-history-modal__unchanged">
                  Без изменений
                </p>
                <div v-else class="question-revision-history-modal__compare">
                  <div class="question-revision-history-modal__compare-column">
                    <span class="question-revision-history-modal__compare-label">До</span>
                    <p class="question-revision-history-modal__text">{{ formatTags(revision.tags_before) }}</p>
                  </div>
                  <div class="question-revision-history-modal__compare-column">
                    <span class="question-revision-history-modal__compare-label">После</span>
                    <p class="question-revision-history-modal__text">{{ formatTags(revision.tags_after) }}</p>
                  </div>
                </div>
              </section>
            </div>
          </article>
        </li>
      </ol>

      <footer class="question-revision-history-modal__footer">
        <AppButton type="button" variant="secondary" @click="closeModal">Закрыть историю</AppButton>
      </footer>
    </section>
  </AppDialog>
</template>

<style scoped>
.question-revision-history-modal,
.question-revision-history-modal__list,
.question-revision-history-modal__card,
.question-revision-history-modal__changes,
.question-revision-history-modal__change-block,
.question-revision-history-modal__state {
  display: grid;
  gap: var(--space-lg);
  min-width: 0;
}

.question-revision-history-modal__state {
  padding: var(--space-xl);
  border: 1px dashed rgb(207 198 180 / 0.9);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.62);
  color: var(--color-muted);
  text-align: center;
}

.question-revision-history-modal__empty-title,
.question-revision-history-modal__empty-copy,
.question-revision-history-modal__eyebrow,
.question-revision-history-modal__title,
.question-revision-history-modal__source,
.question-revision-history-modal__change-title,
.question-revision-history-modal__unchanged,
.question-revision-history-modal__text {
  margin: 0;
}

.question-revision-history-modal__empty-title {
  color: var(--color-text);
  font-size: 20px;
  font-weight: 700;
}

.question-revision-history-modal__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.question-revision-history-modal__card {
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.78);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.72);
}

.question-revision-history-modal__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: start;
  justify-content: space-between;
  min-width: 0;
}

.question-revision-history-modal__header > div {
  min-width: 0;
}

.question-revision-history-modal__eyebrow,
.question-revision-history-modal__source,
.question-revision-history-modal__compare-label {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.question-revision-history-modal__title {
  margin-top: var(--space-xs);
  font-size: 20px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.question-revision-history-modal__source {
  padding: 8px 10px;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
}

.question-revision-history-modal__change-block {
  gap: var(--space-sm);
}

.question-revision-history-modal__change-title {
  font-size: 16px;
}

.question-revision-history-modal__unchanged {
  color: var(--color-muted);
}

.question-revision-history-modal__compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
  min-width: 0;
}

.question-revision-history-modal__compare-column {
  display: grid;
  gap: var(--space-xs);
  min-width: 0;
}

.question-revision-history-modal__text,
.question-revision-history-modal__body {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.62);
  border-radius: var(--radius-md);
  background: rgb(247 243 234 / 0.7);
  overflow-wrap: anywhere;
}

.question-revision-history-modal__body {
  min-height: 140px;
  margin: 0;
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.question-revision-history-modal__chunk--added {
  background: rgb(47 133 90 / 0.16);
}

.question-revision-history-modal__chunk--removed {
  background: rgb(180 35 24 / 0.14);
}

.question-revision-history-modal__footer {
  display: flex;
  justify-content: flex-end;
}

@media (width <= 900px) {
  .question-revision-history-modal__compare {
    grid-template-columns: 1fr;
  }
}
</style>
