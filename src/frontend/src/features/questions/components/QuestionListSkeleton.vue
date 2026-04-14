<script setup lang="ts">
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'
</script>

<template>
  <div class="question-list-skeleton" data-testid="question-list-skeleton">
    <article
      v-for="item in 3"
      :key="item"
      class="question-list-skeleton__card"
    >
      <span class="question-list-skeleton__pill skeleton" />
      <span class="question-list-skeleton__meta skeleton" />
      <ContentSkeleton :lines="2" />
    </article>
  </div>
</template>

<style scoped>
.question-list-skeleton {
  display: grid;
  gap: var(--space-lg);
}

.question-list-skeleton__card {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-xl);
  border: 1px solid rgb(207 198 180 / 0.7);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.72);
}

.question-list-skeleton__pill,
.question-list-skeleton__meta {
  display: inline-flex;
  height: 14px;
  border-radius: 999px;
}

.question-list-skeleton__pill {
  width: 116px;
  height: 32px;
}

.question-list-skeleton__meta {
  width: 180px;
}

.skeleton {
  background:
    linear-gradient(90deg, rgb(228 222 208 / 0.45), rgb(255 255 255 / 0.86), rgb(228 222 208 / 0.45));
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.3s linear infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -40% 0;
  }
}
</style>
