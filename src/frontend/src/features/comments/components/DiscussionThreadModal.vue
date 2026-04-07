<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { CommentTargetType } from '@/features/comments/api/comments'
import CommentComposer from '@/features/comments/components/CommentComposer.vue'
import CommentThreadItem from '@/features/comments/components/CommentThreadItem.vue'
import { useCreateCommentMutation } from '@/features/comments/mutations/useCreateCommentMutation'
import { useCommentThreadQuery } from '@/features/comments/queries/useCommentThreadQuery'
import {
  extractCommentFieldErrors,
  normalizeCommentSubmitError,
} from '@/features/comments/lib/comment-form-errors'
import AppButton from '@/shared/ui/AppButton.vue'
import AppDialog from '@/shared/ui/AppDialog.vue'
import MarkdownContent from '@/shared/ui/MarkdownContent.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

interface Props {
  open: boolean
  title: string
  targetType: CommentTargetType
  targetId: string
  contextEyebrow: string
  contextTitle: string
  contextBody: string
  canComment?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canComment: false,
})

const emit = defineEmits<{
  close: []
}>()

const commentThreadQuery = useCommentThreadQuery(() => props.targetType, () => props.targetId)
const createCommentMutation = useCreateCommentMutation()

const activeComposerKey = ref<string | null>(null)
const highlightedCommentId = ref<string | null>(null)
const fieldError = ref('')
const summary = ref('')

let clearHighlightTimer: ReturnType<typeof setTimeout> | null = null

function clearHighlight() {
  if (clearHighlightTimer) {
    clearTimeout(clearHighlightTimer)
    clearHighlightTimer = null
  }

  highlightedCommentId.value = null
}

async function highlightComment(commentId: string) {
  highlightedCommentId.value = commentId
  await nextTick()

  document.getElementById(`comment-${commentId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })

  clearHighlight()
  clearHighlightTimer = setTimeout(() => {
    highlightedCommentId.value = null
  }, 2400)
}

async function handleRootSubmit(body: string) {
  fieldError.value = ''
  summary.value = ''

  try {
    const createdComment = await createCommentMutation.mutateAsync({
      target_type: props.targetType,
      target_id: props.targetId,
      body,
    })

    activeComposerKey.value = null
    await commentThreadQuery.refetch()
    await highlightComment(createdComment.comment_id)
  } catch (error) {
    const nextFieldErrors = extractCommentFieldErrors(error)

    fieldError.value = nextFieldErrors.body
    summary.value = normalizeCommentSubmitError(error)
  }
}

async function handleCommentSubmitted(commentId: string) {
  await commentThreadQuery.refetch()
  await highlightComment(commentId)
}

function handleClose() {
  activeComposerKey.value = null
  fieldError.value = ''
  summary.value = ''
  clearHighlight()
  emit('close')
}

onBeforeUnmount(() => {
  clearHighlight()
})

watch(activeComposerKey, (nextKey) => {
  if (nextKey !== 'root') {
    fieldError.value = ''
    summary.value = ''
  }
})
</script>

<template>
  <AppDialog
    :open="open"
    :title="title"
    description="Здесь видна полная дискуссия по выбранному контексту."
    @close="handleClose"
  >
    <div class="discussion-thread-modal">
      <SurfacePanel padding="lg" variant="accent">
        <div class="discussion-thread-modal__context-copy">
          <p class="discussion-thread-modal__eyebrow">{{ contextEyebrow }}</p>
          <h3 class="discussion-thread-modal__context-title">{{ contextTitle }}</h3>
        </div>

        <MarkdownContent :source="contextBody" />
      </SurfacePanel>

      <section class="discussion-thread-modal__thread">
        <div class="discussion-thread-modal__thread-header">
          <div>
            <p class="discussion-thread-modal__eyebrow">Полная дискуссия</p>
            <h3 class="discussion-thread-modal__section-title">Все комментарии</h3>
          </div>

          <AppButton
            v-if="canComment"
            variant="secondary"
            @click="activeComposerKey = activeComposerKey === 'root' ? null : 'root'"
          >
            {{ activeComposerKey === 'root' ? 'Скрыть форму' : 'Комментировать' }}
          </AppButton>
        </div>

        <CommentComposer
          v-if="canComment && activeComposerKey === 'root'"
          heading="Новый комментарий"
          :pending="createCommentMutation.isPending.value"
          :summary="summary"
          :field-error="fieldError"
          :auto-focus="true"
          @cancel="activeComposerKey = null"
          @submit="handleRootSubmit"
        />

        <p v-if="commentThreadQuery.isPending.value" class="discussion-thread-modal__muted">
          Загружаем полную дискуссию…
        </p>

        <div v-else-if="commentThreadQuery.isError.value" class="discussion-thread-modal__feedback">
          <p class="discussion-thread-modal__muted">Не удалось загрузить данные. Попробуйте снова.</p>
          <AppButton variant="secondary" @click="commentThreadQuery.refetch()">
            Попробовать снова
          </AppButton>
        </div>

        <p v-else-if="(commentThreadQuery.data.value ?? []).length === 0" class="discussion-thread-modal__muted">
          Комментариев пока нет.
        </p>

        <div v-else class="discussion-thread-modal__list">
          <CommentThreadItem
            v-for="comment in commentThreadQuery.data.value"
            :key="comment.comment_id"
            :comment="comment"
            :target-type="targetType"
            :target-id="targetId"
            :can-reply="canComment"
            :reply-composer-open="activeComposerKey === `reply:${comment.comment_id}`"
            :highlighted-comment-id="highlightedCommentId"
            @request-composer="activeComposerKey = $event"
            @submitted="handleCommentSubmitted"
          />
        </div>
      </section>
    </div>
  </AppDialog>
</template>

<style scoped>
.discussion-thread-modal,
.discussion-thread-modal__thread,
.discussion-thread-modal__feedback,
.discussion-thread-modal__list {
  display: grid;
  gap: var(--space-lg);
}

.discussion-thread-modal__thread-header {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-md);
}

.discussion-thread-modal__context-copy {
  display: grid;
  gap: var(--space-xs);
}

.discussion-thread-modal__eyebrow,
.discussion-thread-modal__context-title,
.discussion-thread-modal__section-title,
.discussion-thread-modal__muted {
  margin: 0;
}

.discussion-thread-modal__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.discussion-thread-modal__context-title,
.discussion-thread-modal__section-title {
  font-size: 24px;
  line-height: 1.1;
}

.discussion-thread-modal__muted {
  color: var(--color-muted);
  line-height: 1.6;
}
</style>
