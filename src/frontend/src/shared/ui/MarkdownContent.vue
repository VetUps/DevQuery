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

.markdown-content :deep(.markdown-code-block) {
  max-width: 100%;
  margin: 0 0 var(--space-md);
  overflow: hidden;
  border: 1px solid rgb(31 41 51 / 0.12);
  border-radius: var(--radius-md);
  background: rgb(31 41 51 / 0.94);
}

.markdown-content :deep(.markdown-code-block__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px var(--space-md);
  border-bottom: 1px solid rgb(248 251 252 / 0.1);
  background: rgb(18 32 42 / 0.95);
}

.markdown-content :deep(.markdown-code-block__language) {
  color: #99f6e4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.markdown-content :deep(.markdown-code-block__pre) {
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  margin: 0;
  padding: var(--space-lg);
  background: transparent;
  color: #f8fbfc;
  white-space: pre;
}

.markdown-content :deep(.markdown-code-block__pre code) {
  display: block;
  padding: 0;
  background: transparent;
  color: inherit;
  overflow-wrap: normal;
}

.markdown-content :deep(.hljs-keyword),
.markdown-content :deep(.hljs-selector-tag),
.markdown-content :deep(.hljs-title.function_) {
  color: #67e8f9;
}

.markdown-content :deep(.hljs-string),
.markdown-content :deep(.hljs-attr),
.markdown-content :deep(.hljs-symbol) {
  color: #bef264;
}

.markdown-content :deep(.hljs-number),
.markdown-content :deep(.hljs-literal) {
  color: #fbbf24;
}

.markdown-content :deep(.hljs-comment) {
  color: #94a3b8;
  font-style: italic;
}

.markdown-content :deep(.hljs-built_in),
.markdown-content :deep(.hljs-type),
.markdown-content :deep(.hljs-class .hljs-title) {
  color: #f0abfc;
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
