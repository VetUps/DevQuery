<script setup lang="ts">
const props = withDefaults(defineProps<{
  semanticEdgeCount: number
  showSemanticEdges: boolean
  isOwner?: boolean
}>(), {
  isOwner: false,
})

const emit = defineEmits<{
  'semantic-visibility-changed': [visible: boolean]
}>()

function toggleSemanticEdges(): void {
  emit('semantic-visibility-changed', !props.showSemanticEdges)
}
</script>

<template>
  <aside
    class="knowledge-graph-semantic-legend"
    data-testid="knowledge-graph-semantic-legend"
    aria-label="Легенда структурных и семантических связей графа знаний"
  >
    <div class="knowledge-graph-semantic-legend__copy">
      <p class="knowledge-graph-semantic-legend__eyebrow">Легенда связей</p>
      <ul class="knowledge-graph-semantic-legend__items">
        <li class="knowledge-graph-semantic-legend__item">
          <span class="knowledge-graph-semantic-legend__badge knowledge-graph-semantic-legend__badge--structural" aria-hidden="true">—</span>
          <span><strong>Структурные связи</strong> — сплошная линия между концептами с общими вопросами. Они всегда остаются на графе.</span>
        </li>
        <li class="knowledge-graph-semantic-legend__item">
          <span class="knowledge-graph-semantic-legend__badge knowledge-graph-semantic-legend__badge--semantic" aria-hidden="true">⋯</span>
          <span><strong>Семантические соседи</strong> — пунктирная линия похожих тем владельца. Это приватный слой, отдельный от структурных связей.</span>
        </li>
      </ul>
      <p
        class="knowledge-graph-semantic-legend__status"
        data-testid="knowledge-graph-semantic-count"
      >
        <template v-if="props.isOwner && props.semanticEdgeCount > 0">
          Семантических соседей: {{ props.semanticEdgeCount }}. Слой {{ props.showSemanticEdges ? 'показан' : 'скрыт' }}.
        </template>
        <template v-else-if="props.isOwner">
          Семантические соседи пока не найдены. Структурный граф доступен без изменений.
        </template>
        <template v-else>
          Публичный просмотр показывает только структурные связи.
        </template>
      </p>
    </div>

    <button
      v-if="props.isOwner && props.semanticEdgeCount > 0"
      class="knowledge-graph-semantic-legend__toggle"
      type="button"
      data-testid="knowledge-graph-semantic-toggle"
      :aria-pressed="props.showSemanticEdges"
      @click="toggleSemanticEdges"
    >
      {{ props.showSemanticEdges ? 'Скрыть семантический слой' : 'Показать семантический слой' }}
    </button>
  </aside>
</template>

<style scoped>
.knowledge-graph-semantic-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-md);
  border: 1px solid rgb(124 58 237 / 0.18);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgb(245 243 255 / 0.86), rgb(255 255 255 / 0.72));
}

.knowledge-graph-semantic-legend__copy {
  display: grid;
  min-width: min(100%, 520px);
  gap: var(--space-sm);
}

.knowledge-graph-semantic-legend__eyebrow,
.knowledge-graph-semantic-legend__status,
.knowledge-graph-semantic-legend__help {
  margin: 0;
}

.knowledge-graph-semantic-legend__eyebrow {
  color: #6d28d9;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.knowledge-graph-semantic-legend__items {
  display: grid;
  gap: var(--space-xs);
  padding: 0;
  margin: 0;
  list-style: none;
}

.knowledge-graph-semantic-legend__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-sm);
  align-items: start;
  color: var(--color-text);
  line-height: 1.55;
}

.knowledge-graph-semantic-legend__badge {
  display: inline-grid;
  min-width: 34px;
  min-height: 24px;
  place-items: center;
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
}

.knowledge-graph-semantic-legend__badge--structural {
  border: 2px solid #64748b;
  background: rgb(241 245 249 / 0.92);
  color: #334155;
}

.knowledge-graph-semantic-legend__badge--semantic {
  border: 2px dashed #7c3aed;
  background: rgb(237 233 254 / 0.92);
  color: #5b21b6;
}

.knowledge-graph-semantic-legend__status,
.knowledge-graph-semantic-legend__help {
  color: var(--color-muted);
  font-size: 13px;
}

.knowledge-graph-semantic-legend__toggle {
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid rgb(124 58 237 / 0.28);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.82);
  color: #5b21b6;
  cursor: pointer;
  font: inherit;
  font-weight: 900;
  box-shadow: 0 8px 18px rgb(88 28 135 / 0.08);
}

.knowledge-graph-semantic-legend__toggle:hover,
.knowledge-graph-semantic-legend__toggle:focus-visible {
  border-color: rgb(124 58 237 / 0.52);
  outline: 3px solid rgb(124 58 237 / 0.18);
  outline-offset: 2px;
}
</style>
