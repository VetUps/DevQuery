<script setup lang="ts">
import { computed } from 'vue'

import { renderMarkdown } from '@/shared/libs/markdown'

interface Props {
  source: string
}

const props = defineProps<Props>()

const safeHtml = computed(() => renderMarkdown(props.source))
</script>

<template>
  <article
    class="markdown-content"
    v-html="safeHtml"
  />
</template>

<style scoped>
.markdown-content {
  min-width: 0;
  max-width: 100%;
  color: var(--color-text);
  line-height: 1.75;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markdown-content :deep(*:first-child) {
  margin-top: 0;
}

.markdown-content :deep(*:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(p),
.markdown-content :deep(ul),
.markdown-content :deep(ol),
.markdown-content :deep(pre),
.markdown-content :deep(blockquote) {
  max-width: 100%;
  margin: 0 0 var(--space-md);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  max-width: 100%;
  margin: var(--space-lg) 0 var(--space-md);
  line-height: 1.15;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

.markdown-content :deep(h1) {
  font-size: 32px;
}

.markdown-content :deep(h2) {
  font-size: 26px;
}

.markdown-content :deep(h3) {
  font-size: 22px;
}

.markdown-content :deep(a) {
  color: var(--color-accent);
  overflow-wrap: anywhere;
}

.markdown-content :deep(code) {
  padding: 2px 6px;
  border-radius: 8px;
  background: rgb(31 41 51 / 0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95em;
  overflow-wrap: anywhere;
}

.markdown-content :deep(pre) {
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  padding: var(--space-lg);
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: var(--radius-md);
  background: rgb(31 41 51 / 0.94);
  color: #f8fbfc;
  white-space: pre;
}

.markdown-content :deep(pre code) {
  display: block;
  padding: 0;
  background: transparent;
  color: inherit;
  overflow-wrap: normal;
}

.markdown-content :deep(blockquote) {
  padding-left: var(--space-md);
  border-left: 3px solid rgb(14 116 144 / 0.3);
  color: var(--color-muted);
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.3rem;
  overflow-wrap: anywhere;
}
</style>
