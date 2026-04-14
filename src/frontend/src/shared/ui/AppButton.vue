<script setup lang="ts">
interface Props {
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  block?: boolean
}

withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  disabled: false,
  block: false,
})
</script>

<template>
  <button
    class="app-button"
    :class="[`app-button--${variant}`, { 'app-button--block': block }]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: 44px;
  padding: 0 var(--space-lg);
  border: 1px solid transparent;
  border-radius: 999px;
  font-weight: 600;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.app-button--block {
  width: 100%;
}

.app-button--primary {
  background: var(--color-accent);
  color: #f8fbfc;
}

.app-button--primary:hover:enabled {
  background: #0c647d;
}

.app-button--secondary {
  background: rgb(255 255 255 / 0.58);
  border-color: var(--color-border);
  color: var(--color-text);
}

.app-button--secondary:hover:enabled {
  background: rgb(255 255 255 / 0.82);
}

.app-button--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--color-text);
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
