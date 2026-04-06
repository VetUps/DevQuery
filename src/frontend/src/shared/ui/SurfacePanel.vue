<script setup lang="ts">
interface Props {
  variant?: 'default' | 'muted' | 'accent'
  padding?: 'md' | 'lg' | 'xl'
}

withDefaults(defineProps<Props>(), {
  variant: 'default',
  padding: 'xl',
})
</script>

<template>
  <section
    class="surface-panel"
    :class="[`surface-panel--${variant}`, `surface-panel--padding-${padding}`]"
  >
    <slot />
  </section>
</template>

<style scoped>
.surface-panel {
  display: grid;
  gap: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.82);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 45px rgb(69 58 38 / 0.06);
}

.surface-panel--default {
  background: rgb(255 255 255 / 0.7);
}

.surface-panel--muted {
  background: rgb(228 222 208 / 0.36);
}

.surface-panel--accent {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.86), rgb(247 243 234 / 0.95)),
    linear-gradient(140deg, rgb(14 116 144 / 0.06), transparent);
}

.surface-panel--padding-md {
  padding: var(--space-lg);
}

.surface-panel--padding-lg {
  padding: var(--space-xl);
}

.surface-panel--padding-xl {
  padding: var(--space-2xl);
}

@media (width <= 640px) {
  .surface-panel--padding-lg,
  .surface-panel--padding-xl {
    padding: var(--space-lg);
  }
}
</style>
