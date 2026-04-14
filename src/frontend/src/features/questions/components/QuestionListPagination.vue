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
  const query = { ...route.query }

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
  <nav class="question-list-pagination" aria-label="Пагинация вопросов">
    <AppButton
      variant="secondary"
      :disabled="!hasPreviousPage || isBusy"
      @click="goToPreviousPage"
    >
      Предыдущая страница
    </AppButton>

    <p class="question-list-pagination__label">
      <span>Страница {{ page }}</span>
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

@media (width <= 640px) {
  .question-list-pagination {
    justify-content: center;
  }
}
</style>
