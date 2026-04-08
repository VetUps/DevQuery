<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type {
  CommentListItem,
  CommentTargetType,
  CommentThreadItem as CommentThreadEntry,
} from '@/features/comments/api/comments'
import CommentComposer from '@/features/comments/components/CommentComposer.vue'
import { useCreateCommentMutation } from '@/features/comments/mutations/useCreateCommentMutation'
import {
  extractCommentFieldErrors,
  normalizeCommentSubmitError,
} from '@/features/comments/libs/comment-form-errors'
import { formatLongDate } from '@/shared/libs/formatting'

interface Props {
  comment: CommentThreadEntry | CommentListItem
  targetType: CommentTargetType
  targetId: string
  canReply?: boolean
  replyComposerOpen?: boolean
  highlightedCommentId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  canReply: false,
  replyComposerOpen: false,
  highlightedCommentId: null,
})

const emit = defineEmits<{
  requestComposer: [key: string | null]
  submitted: [commentId: string]
}>()

const createCommentMutation = useCreateCommentMutation()
const fieldError = ref('')
const summary = ref('')
const areRepliesVisible = ref(false)

const replies = computed(() => ('replies' in props.comment ? props.comment.replies ?? [] : []))
const hasReplies = computed(() => replies.value.length > 0)
const isHighlighted = computed(() => props.highlightedCommentId === props.comment.comment_id)
const replyComposerKey = computed(() => `reply:${props.comment.comment_id}`)
const hasHighlightedReply = computed(() => replies.value.some((reply) => reply.comment_id === props.highlightedCommentId))

watch(
  () => props.replyComposerOpen,
  (isOpen) => {
    if (!isOpen) {
      fieldError.value = ''
      summary.value = ''
    }
  },
)

watch(
  hasHighlightedReply,
  (nextHasHighlightedReply) => {
    if (nextHasHighlightedReply) {
      areRepliesVisible.value = true
    }
  },
  { immediate: true },
)

async function handleReplySubmit(body: string) {
  fieldError.value = ''
  summary.value = ''

  try {
    const createdComment = await createCommentMutation.mutateAsync({
      target_type: props.targetType,
      target_id: props.targetId,
      parent_id: props.comment.comment_id,
      body,
    })

    areRepliesVisible.value = true
    emit('requestComposer', null)
    emit('submitted', createdComment.comment_id)
  } catch (error) {
    const nextFieldErrors = extractCommentFieldErrors(error)

    fieldError.value = nextFieldErrors.body
    summary.value = normalizeCommentSubmitError(error)
  }
}
</script>

<template>
  <article
    :id="`comment-${comment.comment_id}`"
    class="comment-thread-item"
    :class="{ 'comment-thread-item--highlighted': isHighlighted }"
  >
    <div class="comment-thread-item__meta">
      <strong>{{ comment.user_name }}</strong>
      <span>{{ formatLongDate(comment.created_at) }}</span>
    </div>

    <p class="comment-thread-item__body">{{ comment.body }}</p>

    <div v-if="canReply || hasReplies" class="comment-thread-item__actions">
      <button
        v-if="canReply"
        type="button"
        class="comment-thread-item__action"
        @click="$emit('requestComposer', replyComposerOpen ? null : replyComposerKey)"
      >
        {{ replyComposerOpen ? 'Скрыть форму' : 'Ответить' }}
      </button>

      <button
        v-if="hasReplies"
        type="button"
        class="comment-thread-item__action comment-thread-item__action--muted"
        @click="areRepliesVisible = !areRepliesVisible"
      >
        {{ areRepliesVisible ? 'Скрыть ответы' : `Показать ответы (${replies.length})` }}
      </button>
    </div>

    <CommentComposer
      v-if="replyComposerOpen"
      heading="Ответ на комментарий"
      placeholder="Добавьте короткий ответ по существу."
      submit-label="Отправить комментарий"
      :pending="createCommentMutation.isPending.value"
      :summary="summary"
      :field-error="fieldError"
      :auto-focus="true"
      @cancel="$emit('requestComposer', null)"
      @submit="handleReplySubmit"
    />

    <div v-if="hasReplies && areRepliesVisible" class="comment-thread-item__replies">
      <CommentThreadItem
        v-for="reply in replies"
        :key="reply.comment_id"
        :comment="reply"
        :target-type="targetType"
        :target-id="targetId"
        :highlighted-comment-id="highlightedCommentId"
        @request-composer="$emit('requestComposer', $event)"
        @submitted="$emit('submitted', $event)"
      />
    </div>
  </article>
</template>

<style scoped>
.comment-thread-item {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.62);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.72);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.comment-thread-item--highlighted {
  border-color: rgb(14 116 144 / 0.28);
  box-shadow: 0 0 0 4px rgb(14 116 144 / 0.08);
}

.comment-thread-item__meta,
.comment-thread-item__actions,
.comment-thread-item__replies {
  display: grid;
  gap: var(--space-xs);
}

.comment-thread-item__meta {
  color: var(--color-muted);
  font-size: 14px;
}

.comment-thread-item__body {
  margin: 0;
  line-height: 1.6;
}

.comment-thread-item__action {
  justify-self: start;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.comment-thread-item__action--muted {
  color: var(--color-text);
}

.comment-thread-item__replies {
  margin-left: var(--space-lg);
  padding-left: var(--space-md);
  border-left: 2px solid rgb(207 198 180 / 0.54);
}
</style>
