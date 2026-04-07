<script setup lang="ts">
import { computed } from 'vue'

import { buildSolutionEditDiff } from '@/features/solutions/lib/solution-edit-diff'

interface Props {
  before: string
  after: string
}

const props = defineProps<Props>()

const diff = computed(() => buildSolutionEditDiff(props.before, props.after))
</script>

<template>
  <div class="solution-edit-compare-pane">
    <section class="solution-edit-compare-pane__column">
      <header class="solution-edit-compare-pane__header">
        <p class="solution-edit-compare-pane__eyebrow">Оригинал</p>
        <h3 class="solution-edit-compare-pane__title">Текущая версия</h3>
      </header>

      <pre class="solution-edit-compare-pane__surface"><span
        v-for="(chunk, index) in diff.before"
        :key="`before-${index}`"
        :class="[
          'solution-edit-compare-pane__chunk',
          `solution-edit-compare-pane__chunk--${chunk.kind}`,
        ]"
      >{{ chunk.value }}</span></pre>
    </section>

    <section class="solution-edit-compare-pane__column">
      <header class="solution-edit-compare-pane__header">
        <p class="solution-edit-compare-pane__eyebrow">Предлагаемая версия</p>
        <h3 class="solution-edit-compare-pane__title">После правки</h3>
      </header>

      <pre class="solution-edit-compare-pane__surface"><span
        v-for="(chunk, index) in diff.after"
        :key="`after-${index}`"
        :class="[
          'solution-edit-compare-pane__chunk',
          `solution-edit-compare-pane__chunk--${chunk.kind}`,
        ]"
      >{{ chunk.value }}</span></pre>
    </section>
  </div>
</template>

<style scoped>
.solution-edit-compare-pane {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
}

.solution-edit-compare-pane__column,
.solution-edit-compare-pane__header {
  display: grid;
  gap: var(--space-xs);
}

.solution-edit-compare-pane__eyebrow,
.solution-edit-compare-pane__title {
  margin: 0;
}

.solution-edit-compare-pane__eyebrow {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.solution-edit-compare-pane__title {
  font-size: 18px;
  line-height: 1.15;
}

.solution-edit-compare-pane__surface {
  min-height: 220px;
  margin: 0;
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.84);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.solution-edit-compare-pane__chunk--added {
  background: rgb(47 133 90 / 0.14);
}

.solution-edit-compare-pane__chunk--removed {
  background: rgb(180 35 24 / 0.12);
}

@media (width <= 900px) {
  .solution-edit-compare-pane {
    grid-template-columns: 1fr;
  }
}
</style>
