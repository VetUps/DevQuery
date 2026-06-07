<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import AppButton from '@/shared/ui/AppButton.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

interface Props {
  title: string
  description?: string
  actionLabel: string
  to?: RouteLocationRaw | null
  blocked?: boolean
  blockedReason?: string
  progressHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  description: "",
  to: null,
  blocked: false,
  blockedReason: '',
  progressHint: '',
})

const buttonText = computed(() => (props.blocked ? 'Ответ временно недоступен' : props.actionLabel))

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

    <p
      v-if="props.blockedReason"
      class="solution-composer-prompt__blocked"
      data-testid="solution-composer-blocked-reason"
    >
      {{ props.blockedReason }}
    </p>

    <p
      v-if="props.progressHint"
      class="solution-composer-prompt__progress"
      data-testid="solution-composer-progress-hint"
    >
      {{ props.progressHint }}
    </p>

    <RouterLink v-if="props.to" :to="props.to">
      <AppButton>{{ actionLabel }}</AppButton>
    </RouterLink>

    <AppButton v-else :disabled="props.blocked" @click="$emit('action')">
      {{ buttonText }}
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

.solution-composer-prompt__blocked,
.solution-composer-prompt__progress {
  margin: 0;
  max-width: 54ch;
  line-height: 1.6;
}

.solution-composer-prompt__blocked {
  color: #8F1D14;
}

.solution-composer-prompt__progress {
  color: var(--color-muted);
}
</style>
