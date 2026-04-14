<script setup lang="ts">
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

defineProps<{
  totalQuestions: number
}>()
</script>

<template>
  <SurfacePanel class="public-discovery-intro" variant="muted" padding="lg">
    <div class="public-discovery-intro__copy">
      <p class="public-discovery-intro__eyebrow">Публичная лента</p>
      <h2 class="public-discovery-intro__title">Читать, а потом отвечать</h2>
      <p class="public-discovery-intro__description">
        Сначала откройте похожие обсуждения, а уже затем добавляйте свой вопрос или решение.
      </p>
    </div>

    <div class="public-discovery-intro__meta">
      <p class="public-discovery-intro__count">
        Сейчас в ленте <strong>{{ totalQuestions }}</strong> вопросов.
      </p>
    </div>
  </SurfacePanel>
</template>

<style scoped>
.public-discovery-intro,
.public-discovery-intro__copy,
.public-discovery-intro__meta {
  display: grid;
  gap: var(--space-sm);
}

.public-discovery-intro__eyebrow,
.public-discovery-intro__title,
.public-discovery-intro__description,
.public-discovery-intro__count {
  margin: 0;
}

.public-discovery-intro__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.public-discovery-intro__title {
  font-size: 24px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.public-discovery-intro__description,
.public-discovery-intro__count {
  color: var(--color-muted);
  line-height: 1.6;
}

strong {
  color: var(--color-text);
}
</style>
