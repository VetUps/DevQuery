<script setup lang="ts">
import { useToastStore } from '@/shared/stores/toast'

const { toasts, removeToast } = useToastStore()
</script>

<template>
  <section
    v-if="toasts.length > 0"
    class="app-toast-region"
    role="status"
    aria-live="polite"
    aria-atomic="false"
  >
    <article
      v-for="toast in toasts"
      :key="toast.id"
      class="app-toast-region__toast"
      :class="`app-toast-region__toast--${toast.tone}`"
    >
      <p class="app-toast-region__message">{{ toast.message }}</p>

      <button
        type="button"
        class="app-toast-region__close"
        @click="removeToast(toast.id)"
      >
        Закрыть
      </button>
    </article>
  </section>
</template>

<style scoped>
.app-toast-region {
  position: fixed;
  right: var(--space-lg);
  bottom: var(--space-lg);
  z-index: 80;
  display: grid;
  gap: var(--space-sm);
  width: min(360px, calc(100vw - (var(--space-lg) * 2)));
}

.app-toast-region__toast {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-md);
  align-items: start;
  min-width: 0;
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.84);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 18px 40px rgb(31 41 51 / 0.12);
}

.app-toast-region__toast--danger {
  border-color: rgb(180 35 24 / 0.22);
  background: rgb(255 244 242 / 0.98);
}

.app-toast-region__toast--success {
  border-color: rgb(47 133 90 / 0.24);
  background: rgb(244 251 246 / 0.98);
}

.app-toast-region__message {
  margin: 0;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.app-toast-region__close {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

@media (width <= 640px) {
  .app-toast-region {
    right: var(--space-md);
    bottom: var(--space-md);
    width: min(100%, calc(100vw - (var(--space-md) * 2)));
  }
}
</style>
