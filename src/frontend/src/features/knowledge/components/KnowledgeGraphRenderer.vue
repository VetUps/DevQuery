<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, shallowRef, useTemplateRef, watch } from 'vue'

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphSemanticDiagnostics,
  KnowledgeGraphLayoutPosition,
  KnowledgeGraphSemanticEdge,
  KnowledgeGraphSemanticGraphMetadata,
  KnowledgeGraphSemanticGroup,
  KnowledgeGraphNode,
} from '@/features/knowledge/api/knowledgeGraph'
import KnowledgeGraphCanvas from './KnowledgeGraphCanvas.vue'
import KnowledgeGraphSemanticLegend from './KnowledgeGraphSemanticLegend.vue'
import type { KnowledgeGraphConceptStateById } from './knowledgeGraphStatePresentation'
import { getKnowledgeGraphConceptState } from './knowledgeGraphStatePresentation'
import type { KnowledgeGraphProjectionMode } from './knowledgeGraphSemanticProjection'
import { buildKnowledgeGraphSemanticProjection } from './knowledgeGraphSemanticProjection'

interface Emits {
  'node-selected': [conceptId: number]
  'layout-changed': [positions: Record<string, KnowledgeGraphLayoutPosition>]
  'layout-save-requested': []
  'layout-reset-requested': []
  'semantic-visibility-changed': [visible: boolean]
}

const props = withDefaults(defineProps<{
  projectionMode?: KnowledgeGraphProjectionMode
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  semanticEdges?: KnowledgeGraphSemanticEdge[]
  semanticGroups?: KnowledgeGraphSemanticGroup[]
  semanticGraph?: KnowledgeGraphSemanticGraphMetadata
  semanticDiagnostics?: KnowledgeGraphSemanticDiagnostics
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
  projectionMode: 'structural',
  selectedConceptId: null,
  neighbourConceptIds: () => [],
  neighbourEdgeIds: () => [],
  semanticEdges: () => [],
  semanticGroups: () => [],
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
const selectedSemanticAreaKey = shallowRef<string | null>(null)

const hasNodes = computed(() => props.nodes.length > 0)
const semanticProjection = computed(() => buildKnowledgeGraphSemanticProjection(
  props.semanticGroups,
  props.nodes,
  props.semanticGraph,
))
const isSemanticProjectionMode = computed(() => props.projectionMode === 'semantic')
const hasOwnerSemanticEdges = computed(() => props.isOwner && props.semanticEdges.length > 0)
const canShowSemanticOverlay = computed(() => hasOwnerSemanticEdges.value && props.showSemanticEdges)
const canShowSemanticClusters = computed(() => props.isOwner && isSemanticProjectionMode.value && semanticProjection.value.areas.length > 0)
const graphSummary = computed(() => {
  const semanticModeCopy = isSemanticProjectionMode.value
    ? ` · семантическая проекция: ${semanticProjection.value.visibleGroupCount} групп`
    : ''
  const semanticCopy = hasOwnerSemanticEdges.value
    ? ` · ${props.semanticEdges.length} семантических соседей${canShowSemanticOverlay.value ? '' : ' скрыто'}`
    : ''

  return `${props.nodes.length} концептов · ${props.edges.length} связей${semanticCopy}${semanticModeCopy}`
})
const isLayoutActionDisabled = computed(() => !props.isLayoutDirty || props.isLayoutSaving || props.isLayoutResetting)
const selectedSemanticArea = computed(() => semanticProjection.value.areas.find((area) => area.key === selectedSemanticAreaKey.value) ?? null)

watch(
  () => semanticProjection.value.areas.map((area) => area.key).join('\u001f'),
  () => {
    if (!selectedSemanticAreaKey.value) {
      return
    }

    const stillVisible = semanticProjection.value.areas.some((area) => area.key === selectedSemanticAreaKey.value)
    if (!stillVisible) {
      selectedSemanticAreaKey.value = null
    }
  },
)

function conceptLabel(node: KnowledgeGraphNode): string {
  return node.name || node.slug || `Концепт ${node.concept_id}`
}

function conceptState(node: KnowledgeGraphNode) {
  return getKnowledgeGraphConceptState(props.conceptStates, node.concept_id)
}

function conceptStateAriaLabel(node: KnowledgeGraphNode): string {
  const state = conceptState(node)
  const action = isConceptSelected(node.concept_id) ? 'Снять выделение с концепта' : 'Выбрать концепт'

  return `${action} ${conceptLabel(node)}. Состояние: ${state.label}. ${state.description}`
}

function emitNodeSelected(conceptId: number): void {
  if (Number.isFinite(conceptId)) {
    emit('node-selected', conceptId)
  }
}

function isConceptSelected(conceptId: number): boolean {
  return props.selectedConceptId === conceptId
}

function isSemanticAreaSelected(areaKey: string): boolean {
  return selectedSemanticAreaKey.value === areaKey
}

function selectSemanticArea(areaKey: string): void {
  selectedSemanticAreaKey.value = areaKey
}

function emitSemanticMemberSelected(conceptId: number, isVisible: boolean): void {
  if (isVisible) {
    emitNodeSelected(conceptId)
  }
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

    <section
      v-if="isSemanticProjectionMode && props.isOwner"
      class="knowledge-graph-renderer__semantic-projection"
      data-testid="knowledge-graph-semantic-projection"
      :data-mode="props.projectionMode"
      :data-state="semanticProjection.state"
      :data-selected-group-key="selectedSemanticArea?.key ?? ''"
      :data-selected-concept-id="props.selectedConceptId ?? ''"
      aria-labelledby="knowledge-graph-semantic-projection-title"
    >
      <header class="knowledge-graph-renderer__semantic-header">
        <div>
          <p class="knowledge-graph-renderer__eyebrow">Семантическая проекция</p>
          <h4 id="knowledge-graph-semantic-projection-title" class="knowledge-graph-renderer__semantic-title">
            Группы знаний как области графа
          </h4>
        </div>
        <div class="knowledge-graph-renderer__semantic-stats" aria-label="Сводка семантической проекции">
          <span data-testid="knowledge-graph-semantic-mode">{{ props.projectionMode }}</span>
          <span data-testid="knowledge-graph-semantic-group-count">{{ semanticProjection.visibleGroupCount }} групп</span>
          <span data-testid="knowledge-graph-semantic-member-count">{{ semanticProjection.visibleMemberCount }} участников</span>
          <span data-testid="knowledge-graph-semantic-lifecycle-counts">
            active {{ semanticProjection.lifecycleCounts.active }} · stale {{ semanticProjection.lifecycleCounts.stale }}
          </span>
        </div>
      </header>

      <p
        class="knowledge-graph-renderer__semantic-state"
        data-testid="knowledge-graph-semantic-state"
        :data-status="semanticProjection.status"
        :data-reason="semanticProjection.reasonCode"
        :data-phase="semanticProjection.phase"
      >
        {{ semanticProjection.stateCopy }}
      </p>

      <div
        v-if="semanticProjection.areas.length > 0"
        class="knowledge-graph-renderer__semantic-areas"
        data-testid="knowledge-graph-semantic-areas"
        role="list"
        aria-label="Семантические области графа знаний"
      >
        <article
          v-for="area in semanticProjection.areas"
          :key="area.key"
          class="knowledge-graph-renderer__semantic-area"
          :class="[
            `knowledge-graph-renderer__semantic-area--${area.lifecycleStatus}`,
            { 'knowledge-graph-renderer__semantic-area--selected': isSemanticAreaSelected(area.key) },
          ]"
          :data-testid="`knowledge-graph-semantic-area-${area.key}`"
          :data-lifecycle="area.lifecycleStatus"
          :data-selected="isSemanticAreaSelected(area.key) ? 'true' : 'false'"
          role="listitem"
          :aria-label="area.ariaLabel"
        >
          <button
            class="knowledge-graph-renderer__semantic-area-toggle"
            type="button"
            :data-testid="`knowledge-graph-semantic-area-toggle-${area.key}`"
            :aria-expanded="isSemanticAreaSelected(area.key)"
            :aria-controls="`knowledge-graph-semantic-area-details-${area.key}`"
            :aria-pressed="isSemanticAreaSelected(area.key)"
            @click="selectSemanticArea(area.key)"
          >
            <span class="knowledge-graph-renderer__semantic-area-header">
              <span class="knowledge-graph-renderer__semantic-area-title">{{ area.label }}</span>
              <span
                class="knowledge-graph-renderer__semantic-badge"
                :data-testid="`knowledge-graph-semantic-area-lifecycle-${area.key}`"
              >
                {{ area.lifecycleLabel }}
              </span>
            </span>
            <span class="knowledge-graph-renderer__semantic-area-description">{{ area.description }}</span>
            <span class="knowledge-graph-renderer__semantic-meta">
              {{ area.visibleMemberCount }} из {{ area.memberCount }} видимых концептов
              <span v-if="area.hiddenMemberCount > 0"> · {{ area.hiddenMemberCount }} скрыто фильтрами</span>
            </span>
          </button>
          <div
            v-if="isSemanticAreaSelected(area.key)"
            :id="`knowledge-graph-semantic-area-details-${area.key}`"
            class="knowledge-graph-renderer__semantic-area-details"
            :data-testid="`knowledge-graph-semantic-area-details-${area.key}`"
            :data-visible-member-count="area.visibleMemberCount"
            :data-hidden-member-count="area.hiddenMemberCount"
          >
            <ul class="knowledge-graph-renderer__semantic-members" :data-testid="`knowledge-graph-semantic-area-members-${area.key}`">
              <li
                v-for="member in area.members"
                :key="member.conceptId"
                :class="{ 'knowledge-graph-renderer__semantic-member--hidden': !member.visible }"
              >
                <button
                  v-if="member.visible"
                  class="knowledge-graph-renderer__semantic-member-action"
                  type="button"
                  :data-testid="`knowledge-graph-semantic-member-${area.key}-${member.conceptId}`"
                  :data-concept-id="member.conceptId"
                  :aria-label="`Открыть детали концепта ${member.label} из группы ${area.label}`"
                  @click="emitSemanticMemberSelected(member.conceptId, member.visible)"
                >
                  <span>#{{ member.rank }}</span>
                  <span>{{ member.label }}</span>
                  <small>открыть детали</small>
                </button>
                <span
                  v-else
                  class="knowledge-graph-renderer__semantic-member-static"
                  :data-testid="`knowledge-graph-semantic-member-${area.key}-${member.conceptId}`"
                  :data-concept-id="member.conceptId"
                  data-actionable="false"
                  aria-disabled="true"
                >
                  <span>#{{ member.rank }}</span>
                  <span>{{ member.label }}</span>
                  <small>скрыт фильтрами</small>
                </span>
              </li>
            </ul>
          </div>
        </article>
      </div>
    </section>

    <KnowledgeGraphCanvas
      ref="graphCanvas"
      :nodes="props.nodes"
      :edges="props.edges"
      :semantic-edges="props.semanticEdges"
      :semantic-groups="props.semanticGroups"
      :show-semantic-edges="canShowSemanticOverlay"
      :show-semantic-clusters="canShowSemanticClusters"
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
          :semantic-groups="props.semanticGroups"
          :show-semantic-edges="canShowSemanticOverlay"
          :show-semantic-clusters="canShowSemanticClusters"
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

.knowledge-graph-renderer__semantic-projection {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid rgb(124 58 237 / 0.18);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgb(245 243 255 / 0.78), rgb(255 255 255 / 0.76));
  box-shadow: 0 14px 34px rgb(15 23 42 / 0.07);
}

.knowledge-graph-renderer__semantic-header,
.knowledge-graph-renderer__semantic-area-header,
.knowledge-graph-renderer__semantic-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  justify-content: space-between;
}

.knowledge-graph-renderer__semantic-title,
.knowledge-graph-renderer__semantic-area-title,
.knowledge-graph-renderer__semantic-area-description,
.knowledge-graph-renderer__semantic-area p,
.knowledge-graph-renderer__semantic-state {
  margin: 0;
}

.knowledge-graph-renderer__semantic-stats span,
.knowledge-graph-renderer__semantic-badge {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 var(--space-sm);
  border: 1px solid rgb(124 58 237 / 0.22);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.82);
  color: rgb(91 33 182);
  font-size: 12px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.knowledge-graph-renderer__semantic-state,
.knowledge-graph-renderer__semantic-meta {
  color: var(--color-muted);
}

.knowledge-graph-renderer__semantic-areas {
  display: grid;
  gap: var(--space-sm);
}

.knowledge-graph-renderer__semantic-area {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid rgb(100 116 139 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.78);
}

.knowledge-graph-renderer__semantic-area-toggle {
  display: grid;
  width: 100%;
  gap: var(--space-sm);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.knowledge-graph-renderer__semantic-area-toggle:focus-visible,
.knowledge-graph-renderer__semantic-member-action:focus-visible {
  outline: 3px solid rgb(124 58 237 / 0.38);
  outline-offset: 3px;
}

.knowledge-graph-renderer__semantic-area-title {
  font-size: 16px;
  font-weight: 900;
}

.knowledge-graph-renderer__semantic-area-description {
  display: block;
}

.knowledge-graph-renderer__semantic-area--selected {
  border-color: rgb(124 58 237 / 0.48);
  box-shadow: 0 12px 26px rgb(88 28 135 / 0.1);
}

.knowledge-graph-renderer__semantic-area-details {
  display: grid;
  gap: var(--space-xs);
}

.knowledge-graph-renderer__semantic-area--active {
  border-color: rgb(15 118 110 / 0.28);
}

.knowledge-graph-renderer__semantic-area--stale {
  border-style: dashed;
  border-color: rgb(217 119 6 / 0.34);
}

.knowledge-graph-renderer__semantic-members {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding: 0;
  margin: 0;
  list-style: none;
}

.knowledge-graph-renderer__semantic-member-action,
.knowledge-graph-renderer__semantic-member-static {
  display: inline-flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) var(--space-sm);
  border: 0;
  border-radius: 999px;
  background: rgb(248 250 252 / 0.92);
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.knowledge-graph-renderer__semantic-member-action {
  cursor: pointer;
  transition-duration: 160ms;
  transition-property: background-color, box-shadow, transform;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.knowledge-graph-renderer__semantic-member-action:hover {
  background: rgb(237 233 254 / 0.94);
  box-shadow: 0 8px 18px rgb(88 28 135 / 0.1);
}

.knowledge-graph-renderer__semantic-member-action:active {
  transform: scale(0.96);
}

.knowledge-graph-renderer__semantic-members small {
  color: var(--color-muted);
  font-weight: 700;
}

.knowledge-graph-renderer__semantic-member--hidden {
  opacity: 0.62;
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
