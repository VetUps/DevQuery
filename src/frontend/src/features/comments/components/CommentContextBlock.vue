<script setup lang="ts">
import type { CommentListItem } from '@/features/comments/api/comments'
import { formatLongDate } from '@/shared/lib/formatting'
import AppButton from '@/shared/ui/AppButton.vue'

defineProps<{
  title: string
  comments: CommentListItem[]
  isPending?: boolean
  isError?: boolean
  hasMore?: boolean
}>()

defineEmits<{
  retry: []
}>()
</script>

<template>
  <section class="comment-context-block">
    <div class="comment-context-block__header">
      <h3 class="comment-context-block__title">{{ title }}</h3>
      <span class="comment-context-block__subtitle">Первые 3 корневых комментария</span>
    </div>

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
      <article
        v-for="comment in comments"
        :key="comment.comment_id"
        class="comment-context-block__item"
      >
        <div class="comment-context-block__item-meta">
          <strong>{{ comment.user_name }}</strong>
          <span>{{ formatLongDate(comment.created_at) }}</span>
        </div>
        <p class="comment-context-block__body">{{ comment.body }}</p>
      </article>
    </div>

    <button
      class="comment-context-block__more"
      type="button"
      :disabled="!hasMore"
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

.comment-context-block__header,
.comment-context-block__feedback,
.comment-context-block__list {
  display: grid;
  gap: var(--space-sm);
}

.comment-context-block__title,
.comment-context-block__subtitle,
.comment-context-block__muted,
.comment-context-block__body {
  margin: 0;
}

.comment-context-block__title {
  font-size: 18px;
  line-height: 1.2;
}

.comment-context-block__subtitle,
.comment-context-block__muted {
  color: var(--color-muted);
  font-size: 14px;
}

.comment-context-block__item {
  display: grid;
  gap: var(--space-xs);
  padding-top: var(--space-md);
  border-top: 1px solid rgb(207 198 180 / 0.62);
}

.comment-context-block__item:first-child {
  padding-top: 0;
  border-top: 0;
}

.comment-context-block__item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  color: var(--color-muted);
  font-size: 14px;
}

.comment-context-block__body {
  line-height: 1.6;
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
