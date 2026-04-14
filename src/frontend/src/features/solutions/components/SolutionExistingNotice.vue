<script setup lang="ts">
import AppButton from '@/shared/ui/AppButton.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

defineEmits<{
  focusSolution: []
}>()
</script>

<template>
  <SurfacePanel class="solution-existing-notice" padding="lg">
    <div>
      <p class="solution-existing-notice__eyebrow">Ваше участие уже опубликовано</p>
      <h2 class="solution-existing-notice__title">Вы уже ответили на этот вопрос</h2>
    </div>

    <p class="solution-existing-notice__description">
      Вместо повторной отправки мы сразу покажем вам уже опубликованное решение ниже.
    </p>

    <AppButton variant="secondary" @click="$emit('focusSolution')">
      Перейти к моему решению
    </AppButton>
  </SurfacePanel>
</template>

<style scoped>
.solution-existing-notice {
  justify-items: start;
}

.solution-existing-notice__eyebrow,
.solution-existing-notice__title,
.solution-existing-notice__description {
  margin: 0;
}

.solution-existing-notice__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.solution-existing-notice__title {
  margin-top: var(--space-xs);
  font-size: 28px;
  line-height: 1.08;
}

.solution-existing-notice__description {
  max-width: 48ch;
  color: var(--color-muted);
  line-height: 1.6;
}
</style>
