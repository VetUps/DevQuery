<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

interface Props {
  open: boolean
  title?: string
  description?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  description: '',
})

const emit = defineEmits<{
  close: []
}>()

function restoreBodyOverflow() {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    emit('close')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof window === 'undefined') {
      return
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeydown)
      document.body.style.overflow = 'hidden'
      return
    }

    window.removeEventListener('keydown', handleKeydown)
    restoreBodyOverflow()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }

  restoreBodyOverflow()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="app-dialog"
      @click.self="$emit('close')"
    >
      <div
        class="app-dialog__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Диалог'"
      >
        <header v-if="title || description" class="app-dialog__header">
          <div>
            <h2 v-if="title" class="app-dialog__title">{{ title }}</h2>
            <p v-if="description" class="app-dialog__description">{{ description }}</p>
          </div>

          <button type="button" class="app-dialog__close" @click="$emit('close')">
            Закрыть
          </button>
        </header>

        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-dialog {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: var(--space-lg);
  background: rgb(31 41 51 / 0.42);
  backdrop-filter: blur(8px);
}

.app-dialog__panel {
  display: grid;
  gap: var(--space-lg);
  width: min(920px, 100%);
  max-height: min(90vh, 920px);
  overflow: auto;
  padding: var(--space-xl);
  border: 1px solid rgb(207 198 180 / 0.82);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.96), rgb(247 243 234 / 0.98));
  box-shadow: 0 28px 60px rgb(31 41 51 / 0.18);
}

.app-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-md);
}

.app-dialog__title,
.app-dialog__description {
  margin: 0;
}

.app-dialog__title {
  font-size: 28px;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.app-dialog__description {
  margin-top: var(--space-xs);
  color: var(--color-muted);
  line-height: 1.6;
}

.app-dialog__close {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.88);
  color: var(--color-text);
  font-weight: 600;
}
</style>
