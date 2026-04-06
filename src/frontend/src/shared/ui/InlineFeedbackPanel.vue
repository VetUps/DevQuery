<script setup lang="ts">
import AppButton from '@/shared/ui/AppButton.vue'

withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description?: string
  actionLabel?: string
  showAction?: boolean
  tone?: 'default' | 'danger'
  dataTestid?: string
}>(), {
  eyebrow: '',
  description: '',
  actionLabel: 'Попробовать снова',
  showAction: false,
  tone: 'default',
  dataTestid: undefined,
})

defineEmits<{
  action: []
}>()
</script>

<template>
  <section
    class="inline-feedback-panel"
    :class="`inline-feedback-panel--${tone}`"
    :data-testid="dataTestid"
  >
    <p v-if="eyebrow" class="inline-feedback-panel__eyebrow">{{ eyebrow }}</p>
    <h2 class="inline-feedback-panel__title">{{ title }}</h2>
    <p v-if="description" class="inline-feedback-panel__description">{{ description }}</p>
    <AppButton v-if="showAction" @click="$emit('action')">
      {{ actionLabel }}
    </AppButton>
  </section>
</template>

<style scoped>
.inline-feedback-panel {
  display: grid;
  gap: var(--space-md);
  justify-items: start;
  padding: var(--space-2xl);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.54);
}

.inline-feedback-panel--danger {
  border-color: rgb(194 65 12 / 0.28);
  background: rgb(255 247 244 / 0.72);
}

.inline-feedback-panel__eyebrow,
.inline-feedback-panel__title,
.inline-feedback-panel__description {
  margin: 0;
}

.inline-feedback-panel__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.inline-feedback-panel__title {
  font-size: 28px;
  line-height: 1.1;
}

.inline-feedback-panel__description {
  max-width: 52ch;
  color: var(--color-muted);
  line-height: 1.6;
}

@media (width <= 640px) {
  .inline-feedback-panel {
    padding: var(--space-lg);
  }
}
</style>
