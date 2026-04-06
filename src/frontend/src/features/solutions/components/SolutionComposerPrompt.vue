<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

import AppButton from '@/shared/ui/AppButton.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

interface Props {
  title: string
  description: string
  actionLabel: string
  to?: RouteLocationRaw | null
}

const props = withDefaults(defineProps<Props>(), {
  description: "",
  to: null,
})

defineEmits<{
  action: []
}>()
</script>

<template>
  <SurfacePanel class="solution-composer-prompt" padding="lg" variant="muted">
    <div>
      <p class="solution-composer-prompt__eyebrow">Участвуйте в обсуждении</p>
      <h2 class="solution-composer-prompt__title">{{ title }}</h2>
    </div>

    <p class="solution-composer-prompt__description">{{ description }}</p>

    <RouterLink v-if="props.to" :to="props.to">
      <AppButton>{{ actionLabel }}</AppButton>
    </RouterLink>

    <AppButton v-else @click="$emit('action')">
      {{ actionLabel }}
    </AppButton>
  </SurfacePanel>
</template>

<style scoped>
.solution-composer-prompt {
  justify-items: start;
}

.solution-composer-prompt__eyebrow,
.solution-composer-prompt__title,
.solution-composer-prompt__description {
  margin: 0;
}

.solution-composer-prompt__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.solution-composer-prompt__title {
  margin-top: var(--space-xs);
  font-size: 28px;
  line-height: 1.08;
}

.solution-composer-prompt__description {
  max-width: 50ch;
  color: var(--color-muted);
  line-height: 1.6;
}
</style>
