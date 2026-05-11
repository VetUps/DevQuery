<script setup lang="ts">
import cytoscape from 'cytoscape'
import type { CollectionReturnValue, Core, ElementDefinition, EventObject, Stylesheet } from 'cytoscape'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/features/knowledge/api/knowledgeGraph'

interface Emits {
  'node-selected': [conceptId: number]
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

const GRAPH_PADDING = 32
const HIGHLIGHT_CLASSES = [
  'knowledge-node--selected',
  'knowledge-node--neighbour',
  'knowledge-node--dimmed',
  'knowledge-edge--neighbour',
  'knowledge-edge--dimmed',
]
const graphContainer = useTemplateRef<HTMLElement>('graphContainer')
const cyInstance = shallowRef<Core | null>(null)
const graphError = shallowRef('')

const hasNodes = computed(() => props.nodes.length > 0)
const graphSummary = computed(() => `${props.nodes.length} концептов · ${props.edges.length} связей`)
const graphElements = computed<ElementDefinition[]>(() => [
  ...props.nodes.map(mapNodeToElement),
  ...props.edges.map(mapEdgeToElement),
])

const cytoscapeStyles: Stylesheet[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'background-color': '#0e7490',
      color: '#12202a',
      'font-size': 12,
      'font-weight': 700,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': 110,
      width: 'mapData(weight, 0, 5, 34, 78)',
      height: 'mapData(weight, 0, 5, 34, 78)',
      'border-width': 2,
      'border-color': '#ecfeff',
      'overlay-opacity': 0,
    },
  },
  {
    selector: '.knowledge-node--medium',
    style: {
      'background-color': '#0891b2',
    },
  },
  {
    selector: '.knowledge-node--strong',
    style: {
      'background-color': '#0f766e',
      'border-width': 3,
    },
  },
  {
    selector: 'node:selected, .knowledge-node--selected',
    style: {
      'background-color': '#f59e0b',
      'border-color': '#7c2d12',
      'border-width': 5,
      'border-style': 'double',
      'z-index': 20,
    },
  },
  {
    selector: '.knowledge-node--neighbour',
    style: {
      'background-color': '#22c55e',
      'border-color': '#14532d',
      'border-width': 4,
      'border-style': 'solid',
      opacity: 0.96,
      'z-index': 10,
    },
  },
  {
    selector: '.knowledge-node--dimmed',
    style: {
      opacity: 0.28,
      'border-style': 'dotted',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 'mapData(weight, 0, 5, 1, 6)',
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'curve-style': 'bezier',
      opacity: 0.78,
      label: 'data(sharedQuestionLabel)',
      'font-size': 10,
      color: '#475569',
      'text-background-color': '#fffaf0',
      'text-background-opacity': 0.86,
      'text-background-padding': 3,
    },
  },
  {
    selector: '.knowledge-edge--shared-question',
    style: {
      'line-style': 'solid',
    },
  },
  {
    selector: '.knowledge-edge--neighbour',
    style: {
      'line-color': '#16a34a',
      'target-arrow-color': '#16a34a',
      width: 7,
      opacity: 1,
      'line-style': 'solid',
      'z-index': 9,
    },
  },
  {
    selector: '.knowledge-edge--dimmed',
    style: {
      opacity: 0.2,
      'line-style': 'dotted',
    },
  },
]

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function conceptElementId(conceptId: number): string {
  return `concept-${conceptId}`
}

function weightClass(weight: number): string {
  if (weight >= 3) {
    return 'knowledge-node--strong'
  }

  if (weight > 0) {
    return 'knowledge-node--medium'
  }

  return 'knowledge-node--quiet'
}

function mapNodeToElement(node: KnowledgeGraphNode): ElementDefinition {
  const weight = toNumber(node.total_weight)
  const activitySourceCount = node.activity_breakdown.reduce((sum, entry) => sum + entry.source_count, 0)

  return {
    group: 'nodes',
    data: {
      id: conceptElementId(node.concept_id),
      conceptId: node.concept_id,
      label: node.name || node.slug || `Концепт ${node.concept_id}`,
      weight,
      confidence: toNumber(node.confidence),
      sourceCount: node.source_count,
      activitySourceCount,
      relatedQuestionCount: node.related_questions.length,
    },
    classes: `knowledge-node ${weightClass(weight)}`,
  }
}

function mapEdgeToElement(edge: KnowledgeGraphEdge): ElementDefinition {
  return {
    group: 'edges',
    data: {
      id: edge.id,
      source: conceptElementId(edge.source_concept_id),
      target: conceptElementId(edge.target_concept_id),
      weight: toNumber(edge.weight),
      sharedQuestionCount: edge.shared_question_count,
      sharedQuestionLabel: edge.shared_question_count > 0 ? `${edge.shared_question_count}` : '',
      relatedQuestionCount: edge.related_questions.length,
    },
    classes: `knowledge-edge knowledge-edge--${edge.reason.replaceAll('_', '-')}`,
  }
}

function hasElement(element: CollectionReturnValue): boolean {
  return element.nonempty()
}

function syncHighlightClasses(): void {
  const cy = cyInstance.value

  if (!cy) {
    return
  }

  cy.elements().removeClass(HIGHLIGHT_CLASSES.join(' '))

  if (props.selectedConceptId === null || props.selectedConceptId === undefined) {
    return
  }

  const selectedNode = cy.getElementById(conceptElementId(props.selectedConceptId))

  if (!hasElement(selectedNode)) {
    return
  }

  const neighbourConceptIds = new Set(props.neighbourConceptIds.map(conceptElementId))
  const neighbourEdgeIds = new Set(props.neighbourEdgeIds)
  const highlightedNodeIds = new Set([selectedNode.id(), ...neighbourConceptIds])

  selectedNode.addClass('knowledge-node--selected')

  for (const nodeId of neighbourConceptIds) {
    const node = cy.getElementById(nodeId)

    if (hasElement(node)) {
      node.addClass('knowledge-node--neighbour')
    }
  }

  for (const edgeId of neighbourEdgeIds) {
    const edge = cy.getElementById(edgeId)

    if (hasElement(edge)) {
      edge.addClass('knowledge-edge--neighbour')
    }
  }

  cy.nodes().forEach((node) => {
    if (!highlightedNodeIds.has(node.id())) {
      node.addClass('knowledge-node--dimmed')
    }
  })

  cy.edges().forEach((edge) => {
    if (!neighbourEdgeIds.has(edge.id())) {
      edge.addClass('knowledge-edge--dimmed')
    }
  })
}

function handleNodeTap(event: EventObject): void {
  const conceptId = event.target.data('conceptId')

  if (typeof conceptId === 'number' && Number.isFinite(conceptId)) {
    emit('node-selected', conceptId)
  }
}

function runLayout(): void {
  cyInstance.value?.layout({ name: 'grid', fit: true, padding: GRAPH_PADDING }).run()
}

function updateGraphElements(): void {
  const cy = cyInstance.value

  if (!cy) {
    return
  }

  cy.elements().remove()
  cy.add(graphElements.value)
  syncHighlightClasses()
  runLayout()
}

function createGraph(): void {
  if (!graphContainer.value || !hasNodes.value || cyInstance.value) {
    return
  }

  graphError.value = ''

  try {
    const cy = cytoscape({
      container: graphContainer.value,
      elements: graphElements.value,
      style: cytoscapeStyles,
      layout: { name: 'grid', fit: true, padding: GRAPH_PADDING },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      selectionType: 'single',
    })

    cy.on('tap', 'node', handleNodeTap)
    cyInstance.value = cy
    syncHighlightClasses()
  } catch {
    graphError.value = 'Не удалось отобразить интерактивный граф. Список концептов остаётся доступен.'
  }
}

function destroyGraph(): void {
  cyInstance.value?.destroy()
  cyInstance.value = null
}

async function syncGraph(): Promise<void> {
  await nextTick()

  if (!hasNodes.value) {
    destroyGraph()
    return
  }

  if (!cyInstance.value) {
    createGraph()
    return
  }

  updateGraphElements()
}

function fitGraph(): void {
  cyInstance.value?.fit(undefined, GRAPH_PADDING)
}

function resetGraphView(): void {
  const cy = cyInstance.value

  if (!cy) {
    return
  }

  cy.zoom(1)
  cy.pan({ x: 0, y: 0 })
}

onMounted(() => {
  void syncGraph()
})

watch(graphElements, () => {
  void syncGraph()
})

watch(
  () => [props.selectedConceptId, props.neighbourConceptIds, props.neighbourEdgeIds] as const,
  () => {
    syncHighlightClasses()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  destroyGraph()
})
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

      <div v-if="hasNodes" class="knowledge-graph-renderer__controls" aria-label="Управление графом знаний">
        <button
          class="knowledge-graph-renderer__control"
          type="button"
          data-testid="knowledge-graph-fit-control"
          @click="fitGraph"
        >
          Фокусировать граф
        </button>
        <button
          class="knowledge-graph-renderer__control"
          type="button"
          data-testid="knowledge-graph-reset-control"
          @click="resetGraphView"
        >
          Сбросить масштаб
        </button>
      </div>
    </div>

    <p
      v-if="graphError"
      class="knowledge-graph-renderer__fallback"
      data-testid="knowledge-graph-renderer-unavailable"
    >
      {{ graphError }}
    </p>

    <p
      v-else-if="!hasNodes"
      class="knowledge-graph-renderer__fallback"
      data-testid="knowledge-graph-renderer-empty"
    >
      Граф знаний пока пуст. После появления концептов здесь будет доступна интерактивная карта связей.
    </p>

    <div
      v-show="hasNodes && !graphError"
      ref="graphContainer"
      class="knowledge-graph-renderer__surface"
      data-testid="knowledge-graph-canvas"
      role="img"
      :aria-label="`Интерактивный граф знаний: ${graphSummary}`"
    />
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
.knowledge-graph-renderer__fallback {
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
.knowledge-graph-renderer__fallback {
  color: var(--color-muted);
}

.knowledge-graph-renderer__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.knowledge-graph-renderer__control {
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.68);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.knowledge-graph-renderer__control:hover {
  background: rgb(255 255 255 / 0.9);
}

.knowledge-graph-renderer__surface {
  min-height: 420px;
  overflow: hidden;
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top left, rgb(14 116 144 / 0.13), transparent 28rem),
    rgb(255 255 255 / 0.72);
}

.knowledge-graph-renderer__fallback {
  padding: var(--space-lg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.58);
}
</style>
