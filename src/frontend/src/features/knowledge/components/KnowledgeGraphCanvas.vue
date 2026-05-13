<script setup lang="ts">
import cytoscape from 'cytoscape'
import type { CollectionReturnValue, Core, ElementDefinition, EventObject, Stylesheet } from 'cytoscape'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphLayoutPosition,
  KnowledgeGraphNode,
  KnowledgeGraphSemanticEdge,
  KnowledgeGraphSemanticGroup,
} from '@/features/knowledge/api/knowledgeGraph'
import type { KnowledgeGraphConceptStateById } from './knowledgeGraphStatePresentation'
import { getKnowledgeGraphConceptState } from './knowledgeGraphStatePresentation'

interface Emits {
  'node-selected': [conceptId: number]
  'layout-changed': [positions: Record<string, KnowledgeGraphLayoutPosition>]
}

const props = withDefaults(defineProps<{
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  semanticEdges?: KnowledgeGraphSemanticEdge[]
  semanticGroups?: KnowledgeGraphSemanticGroup[]
  showSemanticEdges?: boolean
  showSemanticClusters?: boolean
  selectedConceptId?: number | null
  neighbourConceptIds?: number[]
  neighbourEdgeIds?: string[]
  surfaceClass?: string
  layoutPositions?: Record<string, KnowledgeGraphLayoutPosition>
  isLayoutEditable?: boolean
  conceptStates?: KnowledgeGraphConceptStateById
}>(), {
  selectedConceptId: null,
  semanticEdges: () => [],
  semanticGroups: () => [],
  showSemanticEdges: false,
  showSemanticClusters: false,
  neighbourConceptIds: () => [],
  neighbourEdgeIds: () => [],
  surfaceClass: '',
  layoutPositions: () => ({}),
  isLayoutEditable: false,
  conceptStates: () => ({}),
})

const emit = defineEmits<Emits>()

const GRAPH_PADDING = 32
const HIGHLIGHT_CLASSES = [
  'knowledge-node--selected',
  'knowledge-node--neighbour',
  'knowledge-node--dimmed',
  'knowledge-edge--neighbour',
  'knowledge-edge--semantic-highlight',
  'knowledge-edge--dimmed',
]
const graphContainer = useTemplateRef<HTMLElement>('graphContainer')
const cyInstance = shallowRef<Core | null>(null)
const graphError = shallowRef('')

const hasNodes = computed(() => props.nodes.length > 0)
const visibleSemanticEdges = computed(() => (props.showSemanticEdges ? props.semanticEdges : []))
const visibleSemanticClusters = computed(() => (props.showSemanticClusters ? props.semanticGroups.filter(hasVisibleClusterMembers) : []))
const semanticClusterIdByConceptId = computed(() => {
  const clusterByConceptId = new Map<number, string>()
  const visibleNodeIds = new Set(props.nodes.map((node) => node.concept_id))

  visibleSemanticClusters.value.forEach((group) => {
    const clusterId = semanticClusterElementId(group.group_key)

    group.members.forEach((member) => {
      if (visibleNodeIds.has(member.concept_id) && !clusterByConceptId.has(member.concept_id)) {
        clusterByConceptId.set(member.concept_id, clusterId)
      }
    })
  })

  return clusterByConceptId
})
const graphSummary = computed(() => {
  const semanticCopy = visibleSemanticEdges.value.length > 0 ? `, ${visibleSemanticEdges.value.length} семантических соседей` : ''
  const clusterCopy = visibleSemanticClusters.value.length > 0 ? `, ${visibleSemanticClusters.value.length} семантических кластеров` : ''

  return `${props.nodes.length} концептов, ${props.edges.length} структурных связей${semanticCopy}${clusterCopy}`
})
const graphElements = computed<ElementDefinition[]>(() => [
  ...visibleSemanticClusters.value.map(mapSemanticClusterToElement),
  ...props.nodes.map(mapNodeToElement),
  ...props.edges.map(mapEdgeToElement),
  ...visibleSemanticEdges.value.map(mapSemanticEdgeToElement),
])
const hasLayoutPositions = computed(() => Object.keys(props.layoutPositions).length > 0)

const cytoscapeStyles: Stylesheet[] = [
  {
    selector: '.knowledge-semantic-cluster',
    style: {
      label: 'data(label)',
      'background-color': '#ecfeff',
      'background-opacity': 0.34,
      'border-color': '#0891b2',
      'border-width': 3,
      'border-style': 'solid',
      'border-opacity': 0.72,
      shape: 'round-rectangle',
      padding: 34,
      color: '#155e75',
      'font-size': 14,
      'font-weight': 800,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': -34,
      'text-wrap': 'wrap',
      'text-max-width': 220,
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.88,
      'text-background-padding': 5,
      'text-border-color': '#99f6e4',
      'text-border-opacity': 0.9,
      'text-border-width': 1,
      'z-compound-depth': 'bottom',
      'overlay-opacity': 0,
    },
  },
  {
    selector: '.knowledge-semantic-cluster--stale',
    style: {
      'background-color': '#faf5ff',
      'border-color': '#7e22ce',
      'border-style': 'dashed',
      color: '#581c87',
    },
  },
  {
    selector: '.knowledge-semantic-cluster--active',
    style: {
      'background-color': '#f0fdfa',
      'border-color': '#0f766e',
      color: '#134e4a',
    },
  },
  {
    selector: '.knowledge-semantic-cluster--archived',
    style: {
      'background-color': '#f8fafc',
      'border-color': '#64748b',
      'border-style': 'dotted',
      color: '#334155',
    },
  },
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
    selector: '.knowledge-node--state-strong',
    style: {
      'background-color': '#0f766e',
      'border-color': '#134e4a',
      'border-style': 'double',
      'border-width': 5,
      shape: 'round-rectangle',
    },
  },
  {
    selector: '.knowledge-node--state-growing',
    style: {
      'background-color': '#0284c7',
      'border-color': '#075985',
      'border-style': 'solid',
      'border-width': 4,
      shape: 'ellipse',
    },
  },
  {
    selector: '.knowledge-node--state-weak',
    style: {
      'background-color': '#d97706',
      'border-color': '#78350f',
      'border-style': 'dashed',
      'border-width': 4,
      shape: 'diamond',
    },
  },
  {
    selector: '.knowledge-node--state-stale',
    style: {
      'background-color': '#7e22ce',
      'border-color': '#581c87',
      'border-style': 'dotted',
      'border-width': 4,
      shape: 'hexagon',
    },
  },
  {
    selector: '.knowledge-node--state-isolated',
    style: {
      'background-color': '#64748b',
      'border-color': '#334155',
      'border-style': 'dashed',
      'border-width': 3,
      shape: 'tag',
    },
  },
  {
    selector: '.knowledge-node--state-unknown',
    style: {
      'background-color': '#94a3b8',
      'border-color': '#475569',
      'border-style': 'dashed',
      'border-width': 2,
      shape: 'ellipse',
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
    selector: '.knowledge-edge--semantic-neighbour',
    style: {
      'line-color': '#7c3aed',
      'target-arrow-color': '#7c3aed',
      'line-style': 'dashed',
      width: 'mapData(weight, 0, 5, 1, 4)',
      opacity: 0.72,
      label: 'data(semanticLabel)',
      color: '#5b21b6',
      'text-background-color': '#f5f3ff',
    },
  },
  {
    selector: '.knowledge-edge--semantic-highlight',
    style: {
      'line-color': '#6d28d9',
      'target-arrow-color': '#6d28d9',
      width: 6,
      opacity: 1,
      'line-style': 'dashed',
      'z-index': 8,
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

function semanticEdgeElementId(edgeId: string): string {
  return `semantic-${edgeId}`
}

function semanticClusterElementId(groupKey: string): string {
  return `semantic-cluster-${groupKey}`
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

function conceptLabel(node: KnowledgeGraphNode): string {
  return node.name || node.slug || `Концепт ${node.concept_id}`
}

function hasVisibleClusterMembers(group: KnowledgeGraphSemanticGroup): boolean {
  const visibleNodeIds = new Set(props.nodes.map((node) => node.concept_id))

  return group.members.some((member) => visibleNodeIds.has(member.concept_id))
}

function semanticClusterLabel(group: KnowledgeGraphSemanticGroup): string {
  return group.label || group.group_key || 'Семантический кластер'
}

function mapSemanticClusterToElement(group: KnowledgeGraphSemanticGroup): ElementDefinition {
  const visibleMemberCount = group.members.filter((member) => props.nodes.some((node) => node.concept_id === member.concept_id)).length

  return {
    group: 'nodes',
    data: {
      id: semanticClusterElementId(group.group_key),
      label: semanticClusterLabel(group),
      semanticClusterKey: group.group_key,
      semanticClusterLabel: semanticClusterLabel(group),
      lifecycleStatus: group.lifecycle_status,
      visibleMemberCount,
      memberCount: group.member_count,
      isSemanticCluster: true,
      accessibleLabel: `Семантический кластер ${semanticClusterLabel(group)}. Видимых концептов: ${visibleMemberCount} из ${group.member_count}.`,
    },
    classes: `knowledge-semantic-cluster knowledge-semantic-cluster--${group.lifecycle_status}`,
  }
}

function fallbackPosition(index: number): KnowledgeGraphLayoutPosition {
  const columns = Math.max(1, Math.ceil(Math.sqrt(props.nodes.length)))

  return {
    x: (index % columns) * 180,
    y: Math.floor(index / columns) * 140,
  }
}

function mapNodeToElement(node: KnowledgeGraphNode, index: number): ElementDefinition {
  const weight = toNumber(node.total_weight)
  const activitySourceCount = node.activity_breakdown.reduce((sum, entry) => sum + entry.source_count, 0)
  const statePresentation = getKnowledgeGraphConceptState(props.conceptStates, node.concept_id)
  const visibleLabel = `${statePresentation.symbol} ${conceptLabel(node)}`

  const position = props.layoutPositions[String(node.concept_id)]
  const element: ElementDefinition = {
    group: 'nodes',
    data: {
      id: conceptElementId(node.concept_id),
      conceptId: node.concept_id,
      label: visibleLabel,
      accessibleLabel: `${conceptLabel(node)}. Состояние: ${statePresentation.label}. ${statePresentation.description}`,
      semanticState: statePresentation.state,
      stateLabel: statePresentation.label,
      stateSymbol: statePresentation.symbol,
      stateDescription: statePresentation.description,
      weight,
      confidence: toNumber(node.confidence),
      sourceCount: node.source_count,
      activitySourceCount,
      relatedQuestionCount: node.related_questions.length,
      parent: semanticClusterIdByConceptId.value.get(node.concept_id),
    },
    classes: `knowledge-node ${weightClass(weight)} knowledge-node--state-${statePresentation.classSuffix}`,
  }

  if (hasLayoutPositions.value) {
    element.position = position ?? fallbackPosition(index)
  }

  return element
}

function mapEdgeToElement(edge: KnowledgeGraphEdge): ElementDefinition {
  return {
    group: 'edges',
    data: {
      id: edge.id,
      source: conceptElementId(edge.source_concept_id),
      target: conceptElementId(edge.target_concept_id),
      weight: toNumber(edge.weight),
      edgeKind: 'structural_shared_question',
      accessibleLabel: `Структурная связь: ${edge.shared_question_count} общих вопросов`,
      sharedQuestionCount: edge.shared_question_count,
      sharedQuestionLabel: edge.shared_question_count > 0 ? `${edge.shared_question_count}` : '',
      relatedQuestionCount: edge.related_questions.length,
    },
    classes: `knowledge-edge knowledge-edge--${edge.reason.replaceAll('_', '-')}`,
  }
}

function mapSemanticEdgeToElement(edge: KnowledgeGraphSemanticEdge): ElementDefinition {
  const similarity = toNumber(edge.similarity_score)
  const confidence = toNumber(edge.confidence)

  return {
    group: 'edges',
    data: {
      id: semanticEdgeElementId(edge.id),
      source: conceptElementId(edge.source_concept_id),
      target: conceptElementId(edge.target_concept_id),
      weight: toNumber(edge.weight),
      edgeKind: 'semantic_neighbour',
      semanticReason: edge.reason,
      similarity,
      confidence,
      rank: edge.rank,
      semanticLabel: `${Math.round(similarity * 100)}%`,
      accessibleLabel: `Семантический сосед: похожесть ${Math.round(similarity * 100)}%, уверенность ${Math.round(confidence * 100)}%. Пунктирная приватная связь владельца.`,
    },
    classes: 'knowledge-edge knowledge-edge--semantic-neighbour',
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

  if (props.showSemanticEdges) {
    props.semanticEdges.forEach((edge) => {
      if (edge.source_concept_id === props.selectedConceptId) {
        neighbourConceptIds.add(conceptElementId(edge.target_concept_id))
        neighbourEdgeIds.add(semanticEdgeElementId(edge.id))
      }

      if (edge.target_concept_id === props.selectedConceptId) {
        neighbourConceptIds.add(conceptElementId(edge.source_concept_id))
        neighbourEdgeIds.add(semanticEdgeElementId(edge.id))
      }
    })
  }

  const highlightedNodeIds = new Set([selectedNode.id(), ...neighbourConceptIds])
  const selectedClusterId = selectedNode.data('parent')
  if (typeof selectedClusterId === 'string' && selectedClusterId) {
    highlightedNodeIds.add(selectedClusterId)
  }

  selectedNode.addClass('knowledge-node--selected')

  for (const nodeId of neighbourConceptIds) {
    const node = cy.getElementById(nodeId)

    if (hasElement(node)) {
      node.addClass('knowledge-node--neighbour')
      const neighbourClusterId = node.data('parent')
      if (typeof neighbourClusterId === 'string' && neighbourClusterId) {
        highlightedNodeIds.add(neighbourClusterId)
      }
    }
  }

  for (const edgeId of neighbourEdgeIds) {
    const edge = cy.getElementById(edgeId)

    if (hasElement(edge)) {
      edge.addClass(edgeId.startsWith('semantic-') ? 'knowledge-edge--semantic-highlight' : 'knowledge-edge--neighbour')
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

function emitNodeSelected(conceptId: number): void {
  if (Number.isFinite(conceptId)) {
    emit('node-selected', conceptId)
  }
}

function handleNodeTap(event: EventObject): void {
  const conceptId = event.target.data('conceptId')

  if (typeof conceptId === 'number') {
    emitNodeSelected(conceptId)
  }
}

function runLayout(): void {
  const layoutName = hasLayoutPositions.value ? 'preset' : 'grid'

  cyInstance.value?.layout({ name: layoutName, fit: true, padding: GRAPH_PADDING }).run()
}

function syncGrabState(): void {
  cyInstance.value?.autoungrabify(!props.isLayoutEditable)
}

function collectCurrentPositions(): Record<string, KnowledgeGraphLayoutPosition> {
  const positions: Record<string, KnowledgeGraphLayoutPosition> = {}
  const cy = cyInstance.value

  if (!cy) {
    return positions
  }

  cy.nodes().forEach((node) => {
    const conceptId = node.data('conceptId')
    const position = node.position()

    if (typeof conceptId === 'number') {
      positions[String(conceptId)] = {
        x: position.x,
        y: position.y,
      }
    }
  })

  return positions
}

function handleNodeDragFree(): void {
  emit('layout-changed', collectCurrentPositions())
}

function updateGraphElements(): void {
  const cy = cyInstance.value

  if (!cy) {
    return
  }

  cy.elements().remove()
  cy.add(graphElements.value)
  syncGrabState()
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
      layout: { name: hasLayoutPositions.value ? 'preset' : 'grid', fit: true, padding: GRAPH_PADDING },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      selectionType: 'single',
    })

    cy.on('tap', 'node', handleNodeTap)
    cy.on('dragfree', 'node', handleNodeDragFree)
    cyInstance.value = cy
    syncGrabState()
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

function resetView(): void {
  const cy = cyInstance.value

  if (!cy) {
    return
  }

  cy.zoom(1)
  cy.pan({ x: 0, y: 0 })
  cy.fit(undefined, GRAPH_PADDING)
}

function zoomBy(factor: number): void {
  const cy = cyInstance.value

  if (!cy) {
    return
  }

  const currentZoom = cy.zoom()
  const nextZoom = (typeof currentZoom === 'number' && Number.isFinite(currentZoom) ? currentZoom : 1) * factor

  cy.zoom(nextZoom)
}

function zoomIn(): void {
  zoomBy(1.18)
}

function zoomOut(): void {
  zoomBy(0.85)
}

onMounted(() => {
  void syncGraph()
})

watch(graphElements, () => {
  void syncGraph()
})

watch(
  () => [props.selectedConceptId, props.neighbourConceptIds, props.neighbourEdgeIds, props.showSemanticEdges, props.semanticEdges] as const,
  () => {
    syncHighlightClasses()
  },
  { deep: true },
)

watch(
  () => props.isLayoutEditable,
  () => {
    syncGrabState()
  },
)

onBeforeUnmount(() => {
  destroyGraph()
})

defineExpose({
  collectCurrentPositions,
  resetView,
  zoomIn,
  zoomOut,
})
</script>

<template>
  <p
    v-if="graphError"
    class="knowledge-graph-canvas__fallback"
    data-testid="knowledge-graph-renderer-unavailable"
  >
    {{ graphError }}
  </p>

  <p
    v-else-if="!hasNodes"
    class="knowledge-graph-canvas__fallback"
    data-testid="knowledge-graph-renderer-empty"
  >
    Граф знаний пока пуст. После появления концептов здесь будет доступна интерактивная карта связей.
  </p>

  <div
    v-show="hasNodes && !graphError"
    ref="graphContainer"
    class="knowledge-graph-canvas__surface"
    :class="surfaceClass"
    data-testid="knowledge-graph-canvas"
    role="img"
    :aria-label="`Интерактивный граф знаний: ${graphSummary}`"
  />
</template>

<style scoped>
.knowledge-graph-canvas__surface {
  min-height: 420px;
  overflow: hidden;
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top left, rgb(14 116 144 / 0.13), transparent 28rem),
    rgb(255 255 255 / 0.72);
}

.knowledge-graph-canvas__fallback {
  padding: var(--space-lg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  margin: 0;
  background: rgb(255 255 255 / 0.58);
  color: var(--color-muted);
}
</style>
