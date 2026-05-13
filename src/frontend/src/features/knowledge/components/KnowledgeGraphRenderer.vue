<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphLayoutPosition,
  KnowledgeGraphSemanticEdge,
  KnowledgeGraphNode,
} from '@/features/knowledge/api/knowledgeGraph'
import KnowledgeGraphCanvas from './KnowledgeGraphCanvas.vue'
import KnowledgeGraphSemanticLegend from './KnowledgeGraphSemanticLegend.vue'
import type { KnowledgeGraphConceptStateById } from './knowledgeGraphStatePresentation'
import { getKnowledgeGraphConceptState } from './knowledgeGraphStatePresentation'

interface Emits {
  'node-selected': [conceptId: number]
  'layout-changed': [positions: Record<string, KnowledgeGraphLayoutPosition>]
  'layout-save-requested': []
  'layout-reset-requested': []
  'semantic-visibility-changed': [visible: boolean]
}

const props = withDefaults(defineProps<{
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  semanticEdges?: KnowledgeGraphSemanticEdge[]
  showSemanticEdges?: boolean
  selectedConceptId?: number | null
  neighbourConceptIds?: number[]
  neighbourEdgeIds?: string[]
  layoutPositions?: Record<string, KnowledgeGraphLayoutPosition>
  isOwner?: boolean
  isLayoutDirty?: boolean
  isLayoutSaving?: boolean
  isLayoutResetting?: boolean
  conceptStates?: KnowledgeGraphConceptStateById
}>(), {
  selectedConceptId: null,
  neighbourConceptIds: () => [],
  neighbourEdgeIds: () => [],
  semanticEdges: () => [],
  showSemanticEdges: false,
  layoutPositions: () => ({}),
  isOwner: false,
  isLayoutDirty: false,
  isLayoutSaving: false,
  isLayoutResetting: false,
  conceptStates: () => ({}),
})

const emit = defineEmits<Emits>()

const graphCanvasRef = useTemplateRef<InstanceType<typeof KnowledgeGraphCanvas>>('graphCanvas')
const isFullscreenOpen = shallowRef(false)

const hasNodes = computed(() => props.nodes.length > 0)
const hasOwnerSemanticEdges = computed(() => props.isOwner && props.semanticEdges.length > 0)
const canShowSemanticOverlay = computed(() => hasOwnerSemanticEdges.value && props.showSemanticEdges)
const graphSummary = computed(() => {
  const semanticCopy = hasOwnerSemanticEdges.value
    ? ` · ${props.semanticEdges.length} семантических соседей${canShowSemanticOverlay.value ? '' : ' скрыто'}`
    : ''

  return `${props.nodes.length} концептов · ${props.edges.length} связей${semanticCopy}`
})
const isLayoutActionDisabled = computed(() => !props.isLayoutDirty || props.isLayoutSaving || props.isLayoutResetting)

function conceptLabel(node: KnowledgeGraphNode): string {
  return node.name || node.slug || `Концепт ${node.concept_id}`
}

function conceptState(node: KnowledgeGraphNode) {
  return getKnowledgeGraphConceptState(props.conceptStates, node.concept_id)
}

function conceptStateAriaLabel(node: KnowledgeGraphNode): string {
  const state = conceptState(node)

  return `Выбрать концепт ${conceptLabel(node)}. Состояние: ${state.label}. ${state.description}`
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

function emitLayoutChanged(positions: Record<string, KnowledgeGraphLayoutPosition>): void {
  emit('layout-changed', positions)
}

function requestLayoutSave(): void {
  emit('layout-save-requested')
}

function requestLayoutReset(): void {
  emit('layout-reset-requested')
}

function emitSemanticVisibilityChanged(visible: boolean): void {
  emit('semantic-visibility-changed', visible)
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
          :aria-label="conceptStateAriaLabel(node)"
          @click="emitNodeSelected(node.concept_id)"
        >
          <span class="knowledge-graph-renderer__concept-name">
            {{ conceptLabel(node) }}
          </span>
          <span
            class="knowledge-graph-renderer__concept-state"
            :class="`knowledge-graph-renderer__concept-state--${conceptState(node).classSuffix}`"
            :data-testid="`knowledge-graph-concept-state-${node.concept_id}`"
            :data-state="conceptState(node).state"
            :title="conceptState(node).description"
          >
            <span aria-hidden="true">{{ conceptState(node).symbol }}</span>
            <span>{{ conceptState(node).label }}</span>
          </span>
          <span class="knowledge-graph-renderer__concept-meta">
            {{ node.source_count }} · вес {{ node.total_weight }} · {{ node.related_questions.length }} вопр.
          </span>
        </button>
      </div>
    </div>

    <KnowledgeGraphSemanticLegend
      v-if="hasNodes"
      :semantic-edge-count="props.isOwner ? props.semanticEdges.length : 0"
      :show-semantic-edges="canShowSemanticOverlay"
      :is-owner="props.isOwner"
      @semantic-visibility-changed="emitSemanticVisibilityChanged"
    />

    <div v-if="hasNodes" class="knowledge-graph-renderer__viewport-toolbar" data-testid="knowledge-graph-viewport-toolbar">
      <p class="knowledge-graph-renderer__toolbar-label">Управление графом</p>
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
          v-if="props.isOwner"
          class="knowledge-graph-renderer__control knowledge-graph-renderer__control--reset"
          type="button"
          data-testid="knowledge-graph-layout-save-control"
          :disabled="isLayoutActionDisabled"
          @click="requestLayoutSave"
        >
          {{ props.isLayoutSaving ? 'Сохраняем…' : 'Сохранить' }}
        </button>
        <button
          v-if="props.isOwner"
          class="knowledge-graph-renderer__control knowledge-graph-renderer__control--reset"
          type="button"
          data-testid="knowledge-graph-layout-reset-control"
          :disabled="isLayoutActionDisabled"
          @click="requestLayoutReset"
        >
          {{ props.isLayoutResetting ? 'Сбрасываем…' : 'Сбросить' }}
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
      :semantic-edges="props.semanticEdges"
      :show-semantic-edges="canShowSemanticOverlay"
      :selected-concept-id="props.selectedConceptId"
      :neighbour-concept-ids="props.neighbourConceptIds"
      :neighbour-edge-ids="props.neighbourEdgeIds"
      :layout-positions="props.layoutPositions"
      :is-layout-editable="props.isOwner"
      :concept-states="props.conceptStates"
      @node-selected="emitNodeSelected"
      @layout-changed="emitLayoutChanged"
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
          <div class="knowledge-graph-renderer__modal-actions">
            <button
              v-if="props.isOwner"
              class="knowledge-graph-renderer__control knowledge-graph-renderer__control--reset"
              type="button"
              data-testid="knowledge-graph-modal-layout-save-control"
              :disabled="isLayoutActionDisabled"
              @click="requestLayoutSave"
            >
              {{ props.isLayoutSaving ? 'Сохраняем…' : 'Сохранить' }}
            </button>
            <button
              v-if="props.isOwner"
              class="knowledge-graph-renderer__control knowledge-graph-renderer__control--reset"
              type="button"
              data-testid="knowledge-graph-modal-layout-reset-control"
              :disabled="isLayoutActionDisabled"
              @click="requestLayoutReset"
            >
              {{ props.isLayoutResetting ? 'Сбрасываем…' : 'Сбросить' }}
            </button>
            <button
              class="knowledge-graph-renderer__modal-close"
              type="button"
              data-testid="knowledge-graph-fullscreen-close"
              aria-label="Закрыть большой граф"
              @click="closeFullscreenGraph"
            >
              ×
            </button>
          </div>
        </header>

        <KnowledgeGraphCanvas
          :nodes="props.nodes"
          :edges="props.edges"
          :semantic-edges="props.semanticEdges"
          :show-semantic-edges="canShowSemanticOverlay"
          :selected-concept-id="props.selectedConceptId"
          :neighbour-concept-ids="props.neighbourConceptIds"
          :neighbour-edge-ids="props.neighbourEdgeIds"
          :layout-positions="props.layoutPositions"
          :is-layout-editable="props.isOwner"
          :concept-states="props.conceptStates"
          surface-class="knowledge-graph-renderer__modal-canvas"
          @node-selected="emitNodeSelected"
          @layout-changed="emitLayoutChanged"
        />
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
.knowledge-graph-renderer__summary {
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

.knowledge-graph-renderer__summary {
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

.knowledge-graph-renderer__control:hover:not(:disabled),
.knowledge-graph-renderer__control:focus-visible:not(:disabled),
.knowledge-graph-renderer__modal-close:hover,
.knowledge-graph-renderer__modal-close:focus-visible {
  border-color: rgb(14 116 144 / 0.5);
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 12px 24px rgb(15 23 42 / 0.1);
}

.knowledge-graph-renderer__control:disabled {
  cursor: not-allowed;
  opacity: 0.46;
  transform: none;
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
  max-width: 280px;
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

.knowledge-graph-renderer__concept-state {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border: 1px solid rgb(100 116 139 / 0.28);
  border-radius: 999px;
  background: rgb(248 250 252 / 0.9);
  color: #334155;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;
}

.knowledge-graph-renderer__concept-state--strong {
  border-style: double;
  border-color: rgb(15 118 110 / 0.44);
  background: rgb(204 251 241 / 0.78);
}

.knowledge-graph-renderer__concept-state--growing {
  border-color: rgb(14 165 233 / 0.42);
  background: rgb(224 242 254 / 0.82);
}

.knowledge-graph-renderer__concept-state--weak {
  border-style: dashed;
  border-color: rgb(217 119 6 / 0.46);
  background: rgb(254 243 199 / 0.84);
}

.knowledge-graph-renderer__concept-state--stale {
  border-style: dotted;
  border-color: rgb(126 34 206 / 0.38);
  background: rgb(243 232 255 / 0.76);
}

.knowledge-graph-renderer__concept-state--isolated {
  border-radius: 8px;
  border-color: rgb(71 85 105 / 0.38);
  background: rgb(241 245 249 / 0.9);
}

.knowledge-graph-renderer__concept-state--unknown {
  border-style: dashed;
  color: var(--color-muted);
}

.knowledge-graph-renderer__modal-backdrop {
  position: fixed;
  z-index: 60;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-xs);
  background: rgb(15 23 42 / 0.48);
}

.knowledge-graph-renderer__modal {
  display: grid;
  width: min(1480px, 98vw);
  height: 96vh;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--space-sm);
  overflow: hidden;
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: calc(var(--radius-lg) + var(--space-sm));
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 30px 90px rgb(15 23 42 / 0.3);
}

.knowledge-graph-renderer__modal-header,
.knowledge-graph-renderer__modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
}

.knowledge-graph-renderer__modal-actions {
  align-items: center;
  justify-content: flex-end;
}

.knowledge-graph-renderer__modal-close {
  padding: 0;
  font-size: 24px;
  line-height: 1;
}

:deep(.knowledge-graph-renderer__modal-canvas) {
  height: 100%;
  min-height: 680px;
}

@media (width <= 720px) {
  .knowledge-graph-renderer__modal-backdrop {
    align-items: stretch;
    padding: var(--space-sm);
  }

  .knowledge-graph-renderer__modal {
    width: 100%;
    height: 100%;
  }

  :deep(.knowledge-graph-renderer__modal-canvas) {
    min-height: 60vh;
  }
}
</style>
