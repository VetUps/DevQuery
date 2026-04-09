<script setup lang="ts">
import { MessageSquareText } from 'lucide-vue-next'

import type { CommentTargetType, CommentThreadItem } from '@/features/comments/api/comments'

interface Props {
  title: string
  targetType: CommentTargetType
  targetId: string
  comments: CommentThreadItem[]
  count?: number
  composerKeyPrefix: string
  activeComposerKey?: string | null
  canComment?: boolean
  isPending?: boolean
  isError?: boolean
  hasMore?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  activeComposerKey: null,
  count: 0,
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
</script>

<template>
  <section
    class="comment-context-block"
    :class="`comment-context-block--${targetType}`"
    :aria-label="title"
  >
    <button
      class="comment-context-block__trigger"
      data-testid="comment-entry-trigger"
      type="button"
      @click="$emit('openThread')"
    >
      <MessageSquareText :size="16" aria-hidden="true" />
      <span class="comment-context-block__count">{{ count }}</span>
      <span class="comment-context-block__sr">{{ title }}</span>
    </button>
  </section>
</template>

<style scoped>
.comment-context-block {
  display: flex;
}

.comment-context-block--question {
  justify-content: flex-start;
}

.comment-context-block--solution {
  justify-content: flex-start;
  padding-top: var(--space-sm);
}

.comment-context-block__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 36px;
  padding: 0 50px;
  border: 1px solid rgb(207 198 180 / 0.78);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.72);
  color: var(--color-text);
}

.comment-context-block__count {
  font-size: 14px;
  font-weight: 600;
}

.comment-context-block__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
