<script setup lang="ts">
import AppButton from '@/shared/ui/AppButton.vue'

const props = defineProps<{
  page: number
  hasNextPage: boolean
  isBusy?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:page', nextPage: number): void
}>()

const hasPreviousPage = computed(() => props.page > 1)

function goToPreviousPage() {
  if (!hasPreviousPage.value || props.isBusy) {
    return
  }
  emit('update:page', props.page - 1)
}

function goToNextPage() {
  if (!props.hasNextPage || props.isBusy) {
    return
  }
  emit('update:page', props.page + 1)
}
</script>

<script lang="ts">
import { computed } from 'vue'
</script>

<template>
  <nav
    class="admin-pagination"
    aria-label="Пагинация"
    data-testid="admin-pagination"
  >
    <AppButton
      class="admin-pagination__control"
      variant="ghost"
      size="compact"
      aria-label="Предыдущая страница"
      :disabled="!hasPreviousPage || isBusy"
      @click="goToPreviousPage"
    >
      <span aria-hidden="true">‹</span>
    </AppButton>

    <p class="admin-pagination__label" :aria-label="`Текущая страница ${page}`">
      {{ page }}
    </p>

    <AppButton
      class="admin-pagination__control"
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
.admin-pagination {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  width: 100%;
  padding-block: var(--space-sm);
  color: var(--color-muted);
}

.admin-pagination__control {
  min-width: 40px;
  padding-inline: var(--space-sm);
  font-size: 1.35rem;
  line-height: 1;
}

.admin-pagination__label {
  min-width: 2.25rem;
  margin: 0;
  color: var(--color-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

@media (width <= 640px) {
  .admin-pagination {
    gap: var(--space-xs);
  }
}
</style>
