<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/shared/ui/AppButton.vue'

const props = defineProps<{
  page: number
  hasNextPage: boolean
  isBusy?: boolean
}>()

const route = useRoute()
const router = useRouter()

const hasPreviousPage = computed(() => props.page > 1)

function normalizeTags(rawTags: unknown) {
  const values = Array.isArray(rawTags) ? rawTags : [rawTags]
  const normalizedTags = values
    .map((tag) => String(tag ?? '').trim().toLowerCase())
    .filter((tag) => tag.length > 0)

  return [...new Set(normalizedTags)]
}

async function goToPage(nextPage: number) {
  const query = { ...route.query }
  const activeTags = normalizeTags(route.query.tag)

  if (activeTags.length > 0) {
    query.tag = activeTags
  } else {
    delete query.tag
  }

  if (nextPage > 1) {
    query.page = String(nextPage)
  } else {
    delete query.page
  }

  await router.push({
    query,
  })
}

async function goToPreviousPage() {
  if (!hasPreviousPage.value || props.isBusy) {
    return
  }

  await goToPage(props.page - 1)
}

async function goToNextPage() {
  if (!props.hasNextPage || props.isBusy) {
    return
  }

  await goToPage(props.page + 1)
}
</script>

<template>
  <nav
    class="question-list-pagination"
    aria-label="Пагинация вопросов"
    data-testid="question-list-pagination"
  >
    <AppButton
      class="question-list-pagination__control"
      variant="ghost"
      size="compact"
      aria-label="Предыдущая страница"
      :disabled="!hasPreviousPage || isBusy"
      @click="goToPreviousPage"
    >
      <span aria-hidden="true">‹</span>
    </AppButton>

    <p class="question-list-pagination__label" :aria-label="`Текущая страница ${page}`">
      {{ page }}
    </p>

    <AppButton
      class="question-list-pagination__control"
      variant="ghost"
      size="compact"
      aria-label="Следующая страница"
      :disabled="!hasNextPage || isBusy"
      @click="goToNextPage"
    >
      <span aria-hidden="true">›</span>
    </AppButton>
  </nav>
</template>

<style scoped>
.question-list-pagination {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  width: 100%;
  padding-block: var(--space-sm);
  color: var(--color-muted);
}

.question-list-pagination__control {
  min-width: 40px;
  padding-inline: var(--space-sm);
  font-size: 1.35rem;
  line-height: 1;
}

.question-list-pagination__label {
  min-width: 2.25rem;
  margin: 0;
  color: var(--color-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

@media (width <= 640px) {
  .question-list-pagination {
    gap: var(--space-xs);
  }
}
</style>
