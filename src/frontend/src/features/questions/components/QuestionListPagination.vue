<script setup lang="ts">
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

async function goToPage(nextPage: number) {
  await router.push({
    query: { page: String(nextPage) },
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

const querySummary = computed(() => route.query.page)
</script>

<template>
  <nav class="question-list-pagination" aria-label="Пагинация вопросов">
    <AppButton
      variant="secondary"
      :disabled="!hasPreviousPage || isBusy"
      @click="goToPreviousPage"
    >
      Предыдущая страница
    </AppButton>

    <p class="question-list-pagination__label">
      <span>page {{ page }}</span>
      <span v-if="querySummary" class="question-list-pagination__query">
        query: {{ querySummary }}
      </span>
    </p>

    <AppButton
      variant="secondary"
      :disabled="!hasNextPage || isBusy"
      @click="goToNextPage"
    >
      Следующая страница
    </AppButton>
  </nav>
</template>

<style scoped>
.question-list-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.58);
}

.question-list-pagination__label {
  display: grid;
  gap: 2px;
  margin: 0;
  color: var(--color-muted);
  text-align: center;
}

.question-list-pagination__query {
  font-size: 13px;
}

@media (width <= 640px) {
  .question-list-pagination {
    justify-content: center;
  }
}
</style>
