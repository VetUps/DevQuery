<script setup lang="ts">
import { ref, watch } from 'vue'

import type { CommentTargetType, CommentThreadItem } from '@/features/comments/api/comments'
import CommentComposer from '@/features/comments/components/CommentComposer.vue'
import CommentThreadItemComponent from '@/features/comments/components/CommentThreadItem.vue'
import { useCreateCommentMutation } from '@/features/comments/mutations/useCreateCommentMutation'
import {
  extractCommentFieldErrors,
  normalizeCommentSubmitError,
} from '@/features/comments/libs/comment-form-errors'
import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  title: string
  targetType: CommentTargetType
  targetId: string
  comments: CommentThreadItem[]
  composerKeyPrefix: string
  activeComposerKey?: string | null
  canComment?: boolean
  isPending?: boolean
  isError?: boolean
  hasMore?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  activeComposerKey: null,
  canComment: false,
  isPending: false,
  isError: false,
  hasMore: false,
})

const emit = defineEmits<{
  retry: []
  requestComposer: [key: string | null]
  openThread: []
  commentSubmitted: [commentId: string]
}>()

const createCommentMutation = useCreateCommentMutation()
const fieldError = ref('')
const summary = ref('')

const rootComposerKey = `${props.composerKeyPrefix}:root`

watch(
  () => props.activeComposerKey,
  (nextKey) => {
    if (nextKey !== rootComposerKey) {
      fieldError.value = ''
      summary.value = ''
    }
  },
)

async function handleRootSubmit(body: string) {
  fieldError.value = ''
  summary.value = ''

  try {
    const createdComment = await createCommentMutation.mutateAsync({
      target_type: props.targetType,
      target_id: props.targetId,
      body,
    })

    emit('requestComposer', null)
    emit('commentSubmitted', createdComment.comment_id)
  } catch (error) {
    const nextFieldErrors = extractCommentFieldErrors(error)

    fieldError.value = nextFieldErrors.body
    summary.value = normalizeCommentSubmitError(error)
  }
}
</script>

<template>
  <section class="comment-context-block">
    <div class="comment-context-block__header">
      <h3 class="comment-context-block__title">{{ title }}</h3>

      <AppButton
        v-if="canComment"
        variant="secondary"
        @click="$emit('requestComposer', activeComposerKey === rootComposerKey ? null : rootComposerKey)"
      >
        {{ activeComposerKey === rootComposerKey ? 'Скрыть форму' : 'Комментировать' }}
      </AppButton>
    </div>

    <CommentComposer
      v-if="canComment && activeComposerKey === rootComposerKey"
      heading="Новый комментарий"
      :pending="createCommentMutation.isPending.value"
      :summary="summary"
      :field-error="fieldError"
      :auto-focus="true"
      @cancel="$emit('requestComposer', null)"
      @submit="handleRootSubmit"
    />

    <p v-if="isPending" class="comment-context-block__muted">
      Загружаем комментарии…
    </p>

    <div v-else-if="isError" class="comment-context-block__feedback">
      <p class="comment-context-block__muted">Не удалось загрузить данные. Попробуйте снова.</p>
      <AppButton variant="secondary" @click="$emit('retry')">
        Попробовать снова
      </AppButton>
    </div>

    <div v-else-if="comments.length === 0" class="comment-context-block__feedback">
      <p class="comment-context-block__muted">Комментариев пока нет.</p>
    </div>

    <div v-else class="comment-context-block__list">
      <CommentThreadItemComponent
        v-for="comment in comments"
        :key="comment.comment_id"
        :comment="comment"
        :target-type="targetType"
        :target-id="targetId"
        :can-reply="canComment"
        :reply-composer-open="activeComposerKey === `${composerKeyPrefix}:reply:${comment.comment_id}`"
        @request-composer="$emit('requestComposer', $event ? `${composerKeyPrefix}:${$event}` : null)"
        @submitted="$emit('commentSubmitted', $event)"
      />
    </div>

    <button
      class="comment-context-block__more"
      type="button"
      :disabled="!hasMore"
      @click="$emit('openThread')"
    >
      Показать ещё
    </button>
  </section>
</template>

<style scoped>
.comment-context-block {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.62);
}

.comment-context-block__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.comment-context-block__feedback,
.comment-context-block__list {
  display: grid;
  gap: var(--space-sm);
}

.comment-context-block__title,
.comment-context-block__muted {
  margin: 0;
}

.comment-context-block__title {
  font-size: 18px;
  line-height: 1.2;
}

.comment-context-block__muted {
  color: var(--color-muted);
  font-size: 14px;
}

.comment-context-block__more {
  justify-self: start;
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text);
}

.comment-context-block__more:disabled {
  cursor: default;
  opacity: 0.55;
}
</style>
