<script setup lang="ts">
type MarkdownMode = 'editor' | 'preview'

const mode = defineModel<MarkdownMode>({ required: true })

const options: Array<{ value: MarkdownMode; label: string }> = [
  { value: 'editor', label: 'Редактор' },
  { value: 'preview', label: 'Предпросмотр' },
]
</script>

<template>
  <div class="markdown-mode-toggle" role="tablist" aria-label="Режим редактора">
    <button
      v-for="option in options"
      :key="option.value"
      class="markdown-mode-toggle__button"
      :class="{ 'markdown-mode-toggle__button--active': mode === option.value }"
      :aria-selected="mode === option.value"
      type="button"
      @click="mode = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.markdown-mode-toggle {
  display: inline-grid;
  grid-auto-flow: column;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: 999px;
  background: rgb(31 41 51 / 0.06);
}

.markdown-mode-toggle__button {
  min-height: 38px;
  padding: 0 var(--space-md);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
  font-weight: 600;
}

.markdown-mode-toggle__button--active {
  background: rgb(14 116 144 / 0.14);
  color: var(--color-accent);
}
</style>
