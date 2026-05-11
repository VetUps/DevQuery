<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/features/knowledge/api/knowledgeGraph'
import KnowledgeGraphCanvas from './KnowledgeGraphCanvas.vue'

interface Emits {
  'node-selected': [conceptId: number]
  'focus-selected-concept': []
}

const props = withDefaults(defineProps<{
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  selectedConceptId?: number | null
  neighbourConceptIds?: number[]
  neighbourEdgeIds?: string[]
}>(), {
  selectedConceptId: null,
  neighbourConceptIds: () => [],
  neighbourEdgeIds: () => [],
})

const emit = defineEmits<Emits>()

const graphCanvasRef = useTemplateRef<InstanceType<typeof KnowledgeGraphCanvas>>('graphCanvas')
const isFullscreenOpen = shallowRef(false)

const hasNodes = computed(() => props.nodes.length > 0)
const graphSummary = computed(() => `${props.nodes.length} концептов · ${props.edges.length} связей`)
const selectedNode = computed(() => {
  if (props.selectedConceptId === null || props.selectedConceptId === undefined) {
    return null
  }

  return props.nodes.find((node) => node.concept_id === props.selectedConceptId) ?? null
})

function conceptLabel(node: KnowledgeGraphNode): string {
  return node.name || node.slug || `Концепт ${node.concept_id}`
}

function emitNodeSelected(conceptId: number): void {
  if (Number.isFinite(conceptId)) {
    emit('node-selected', conceptId)
  }
}

function isConceptSelected(conceptId: number): boolean {
  return props.selectedConceptId === conceptId
}

function resetGraphView(): void {
  graphCanvasRef.value?.resetView()
}

function zoomGraphIn(): void {
  graphCanvasRef.value?.zoomIn()
}

function zoomGraphOut(): void {
  graphCanvasRef.value?.zoomOut()
}

function openFullscreenGraph(): void {
  isFullscreenOpen.value = true
}

function closeFullscreenGraph(): void {
  isFullscreenOpen.value = false
}

function focusSelectedConcept(): void {
  if (!selectedNode.value) {
    return
  }

  closeFullscreenGraph()
  emit('focus-selected-concept')
}
</script>

<template>
  <section class="knowledge-graph-renderer" data-testid="knowledge-graph-renderer">
    <div class="knowledge-graph-renderer__header">
      <div>
        <p class="knowledge-graph-renderer__eyebrow">Интерактивный граф</p>
        <h3 class="knowledge-graph-renderer__title">Топология концептов</h3>
        <p class="knowledge-graph-renderer__summary" data-testid="knowledge-graph-renderer-summary">
          {{ graphSummary }}
        </p>
      </div>
    </div>

    <div
      v-if="hasNodes"
      class="knowledge-graph-renderer__selector"
      data-testid="knowledge-graph-concept-selector"
      role="group"
      aria-label="Выбор концепта на графе знаний"
    >
      <div class="knowledge-graph-renderer__selector-heading">
        <p class="knowledge-graph-renderer__selector-title">Концепты</p>
        <span class="knowledge-graph-renderer__selector-count">{{ props.nodes.length }}</span>
      </div>
      <div class="knowledge-graph-renderer__selector-list">
        <button
          v-for="node in props.nodes"
          :key="node.concept_id"
          class="knowledge-graph-renderer__concept-option"
          :class="{ 'knowledge-graph-renderer__concept-option--selected': isConceptSelected(node.concept_id) }"
          type="button"
          :data-testid="`knowledge-graph-concept-option-${node.concept_id}`"
          :data-concept-id="node.concept_id"
          :aria-pressed="isConceptSelected(node.concept_id)"
          :aria-label="`Выбрать концепт ${conceptLabel(node)}`"
          @click="emitNodeSelected(node.concept_id)"
        >
          <span class="knowledge-graph-renderer__concept-name">
            {{ conceptLabel(node) }}
          </span>
          <span class="knowledge-graph-renderer__concept-meta">
            {{ node.source_count }} · вес {{ node.total_weight }} · {{ node.related_questions.length }} вопр.
          </span>
        </button>
      </div>
    </div>

    <div v-if="hasNodes" class="knowledge-graph-renderer__viewport-toolbar" data-testid="knowledge-graph-viewport-toolbar">
      <p class="knowledge-graph-renderer__toolbar-label">Управление масштабом</p>
      <div class="knowledge-graph-renderer__controls" aria-label="Управление масштабом графа знаний">
        <button
          class="knowledge-graph-renderer__control knowledge-graph-renderer__control--reset"
          type="button"
          data-testid="knowledge-graph-reset-control"
          @click="resetGraphView"
        >
          Сбросить масштаб
        </button>
        <button
          class="knowledge-graph-renderer__control knowledge-graph-renderer__control--icon"
          type="button"
          data-testid="knowledge-graph-zoom-in-control"
          aria-label="Приблизить граф"
          @click="zoomGraphIn"
        >
          +
        </button>
        <button
          class="knowledge-graph-renderer__control knowledge-graph-renderer__control--icon"
          type="button"
          data-testid="knowledge-graph-zoom-out-control"
          aria-label="Отдалить граф"
          @click="zoomGraphOut"
        >
          −
        </button>
        <button
          class="knowledge-graph-renderer__control knowledge-graph-renderer__control--fullscreen"
          type="button"
          data-testid="knowledge-graph-fullscreen-control"
          @click="openFullscreenGraph"
        >
          На весь экран
        </button>
      </div>
    </div>

    <KnowledgeGraphCanvas
      ref="graphCanvas"
      :nodes="props.nodes"
      :edges="props.edges"
      :selected-concept-id="props.selectedConceptId"
      :neighbour-concept-ids="props.neighbourConceptIds"
      :neighbour-edge-ids="props.neighbourEdgeIds"
      @node-selected="emitNodeSelected"
    />

    <div
      v-if="isFullscreenOpen"
      class="knowledge-graph-renderer__modal-backdrop"
      data-testid="knowledge-graph-fullscreen-modal"
      role="presentation"
      @click.self="closeFullscreenGraph"
    >
      <section
        class="knowledge-graph-renderer__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-graph-fullscreen-title"
      >
        <header class="knowledge-graph-renderer__modal-header">
          <div>
            <p class="knowledge-graph-renderer__eyebrow">Большой граф</p>
            <h3 id="knowledge-graph-fullscreen-title">Топология концептов на весь экран</h3>
            <p class="knowledge-graph-renderer__summary">{{ graphSummary }}</p>
          </div>
          <button
            class="knowledge-graph-renderer__modal-close"
            type="button"
            data-testid="knowledge-graph-fullscreen-close"
            aria-label="Закрыть большой граф"
            @click="closeFullscreenGraph"
          >
            ×
          </button>
        </header>

        <KnowledgeGraphCanvas
          :nodes="props.nodes"
          :edges="props.edges"
          :selected-concept-id="props.selectedConceptId"
          :neighbour-concept-ids="props.neighbourConceptIds"
          :neighbour-edge-ids="props.neighbourEdgeIds"
          surface-class="knowledge-graph-renderer__modal-canvas"
          @node-selected="emitNodeSelected"
        />

        <footer class="knowledge-graph-renderer__modal-footer" data-testid="knowledge-graph-fullscreen-selection">
          <div v-if="selectedNode" class="knowledge-graph-renderer__modal-selection">
            <div>
              <p class="knowledge-graph-renderer__toolbar-label">Выбранный концепт</p>
              <strong>{{ conceptLabel(selectedNode) }}</strong>
              <span>
                {{ selectedNode.source_count }} сигналов · вес {{ selectedNode.total_weight }} ·
                {{ selectedNode.related_questions.length }} вопросов
              </span>
            </div>
            <button
              class="knowledge-graph-renderer__control knowledge-graph-renderer__control--reset"
              type="button"
              data-testid="knowledge-graph-focus-selected-control"
              @click="focusSelectedConcept"
            >
              Перейти к концепту
            </button>
          </div>
          <p v-else class="knowledge-graph-renderer__modal-help">
            Выберите узел на большом графе — здесь появится переход к панели концепта на странице.
          </p>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.knowledge-graph-renderer {
  display: grid;
  gap: var(--space-lg);
}

.knowledge-graph-renderer__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
}

.knowledge-graph-renderer__eyebrow,
.knowledge-graph-renderer__title,
.knowledge-graph-renderer__summary,
.knowledge-graph-renderer__modal-help {
  margin: 0;
}

.knowledge-graph-renderer__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.knowledge-graph-renderer__title {
  margin-top: var(--space-xs);
}

.knowledge-graph-renderer__summary,
.knowledge-graph-renderer__modal-help {
  color: var(--color-muted);
}

.knowledge-graph-renderer__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.knowledge-graph-renderer__viewport-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.14);
  border-radius: calc(var(--radius-md) + var(--space-sm));
  background: linear-gradient(135deg, rgb(236 254 255 / 0.76), rgb(255 255 255 / 0.72));
  box-shadow: 0 10px 28px rgb(15 23 42 / 0.07);
}

.knowledge-graph-renderer__toolbar-label {
  margin: 0;
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.knowledge-graph-renderer__control,
.knowledge-graph-renderer__modal-close {
  min-width: 40px;
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.24);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.78);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  box-shadow: 0 8px 18px rgb(15 23 42 / 0.06);
  transition-duration: 160ms;
  transition-property: background-color, border-color, box-shadow, transform;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.knowledge-graph-renderer__control:hover,
.knowledge-graph-renderer__control:focus-visible,
.knowledge-graph-renderer__modal-close:hover,
.knowledge-graph-renderer__modal-close:focus-visible {
  border-color: rgb(14 116 144 / 0.5);
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 12px 24px rgb(15 23 42 / 0.1);
}

.knowledge-graph-renderer__control:active,
.knowledge-graph-renderer__modal-close:active {
  transform: scale(0.96);
}

.knowledge-graph-renderer__control--icon {
  width: 40px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.knowledge-graph-renderer__control--reset,
.knowledge-graph-renderer__control--fullscreen {
  min-width: max-content;
}

.knowledge-graph-renderer__selector {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid rgb(14 116 144 / 0.12);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.42);
}

.knowledge-graph-renderer__selector-heading {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  justify-content: space-between;
}

.knowledge-graph-renderer__selector-title {
  margin: 0;
  color: var(--color-muted);
  font-size: 14px;
  font-weight: 800;
}

.knowledge-graph-renderer__selector-count {
  display: inline-grid;
  min-width: 28px;
  min-height: 28px;
  place-items: center;
  padding: 0 var(--space-xs);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.knowledge-graph-renderer__selector-list {
  display: flex;
  max-height: 148px;
  flex-wrap: wrap;
  gap: var(--space-xs);
  overflow: auto;
  padding: 2px;
  scrollbar-gutter: stable;
}

.knowledge-graph-renderer__concept-option {
  display: inline-flex;
  min-height: 40px;
  max-width: 210px;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid rgb(14 116 144 / 0.2);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.76);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  box-shadow: 0 6px 14px rgb(15 23 42 / 0.04);
  transition-duration: 160ms;
  transition-property: background-color, border-color, box-shadow, transform;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.knowledge-graph-renderer__concept-option:hover,
.knowledge-graph-renderer__concept-option--selected {
  border-color: rgb(14 116 144 / 0.55);
  background: rgb(236 254 255 / 0.92);
  box-shadow: 0 10px 20px rgb(15 23 42 / 0.08);
}

.knowledge-graph-renderer__concept-option:active {
  transform: scale(0.96);
}

.knowledge-graph-renderer__concept-option:focus-visible {
  outline: 3px solid rgb(14 116 144 / 0.4);
  outline-offset: 2px;
}

.knowledge-graph-renderer__concept-name {
  overflow: hidden;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-graph-renderer__concept-meta {
  color: var(--color-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.knowledge-graph-renderer__modal-backdrop {
  position: fixed;
  z-index: 60;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-md);
  background: rgb(15 23 42 / 0.48);
}

.knowledge-graph-renderer__modal {
  display: grid;
  width: min(1120px, 96vw);
  max-height: 92vh;
  gap: var(--space-md);
  overflow: auto;
  padding: var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: calc(var(--radius-lg) + var(--space-sm));
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 30px 90px rgb(15 23 42 / 0.3);
}

.knowledge-graph-renderer__modal-header,
.knowledge-graph-renderer__modal-selection {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
}

.knowledge-graph-renderer__modal-close {
  padding: 0;
  font-size: 24px;
  line-height: 1;
}

.knowledge-graph-renderer__modal-footer {
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.14);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgb(236 254 255 / 0.7), rgb(255 255 255 / 0.78));
}

.knowledge-graph-renderer__modal-selection > div {
  display: grid;
  gap: 2px;
}

.knowledge-graph-renderer__modal-selection strong {
  font-size: 20px;
}

.knowledge-graph-renderer__modal-selection span {
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}

:deep(.knowledge-graph-renderer__modal-canvas) {
  min-height: min(62vh, 620px);
}

@media (width <= 720px) {
  .knowledge-graph-renderer__modal-backdrop {
    align-items: stretch;
    padding: var(--space-sm);
  }

  .knowledge-graph-renderer__modal {
    width: 100%;
    max-height: 100%;
  }
}
</style>
