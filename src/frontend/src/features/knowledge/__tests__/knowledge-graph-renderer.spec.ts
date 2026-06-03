import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphSemanticEdge,
  KnowledgeGraphSemanticGraphMetadata,
  KnowledgeGraphSemanticGroup,
} from '@/features/knowledge/api/knowledgeGraph'
import type { KnowledgeGraphConceptStateById } from '@/features/knowledge/components/knowledgeGraphStatePresentation'
import KnowledgeGraphRenderer from '@/features/knowledge/components/KnowledgeGraphRenderer.vue'

type CytoscapeElementInput = {
  group?: 'nodes' | 'edges'
  data?: Record<string, unknown>
  classes?: string
  position?: { x: number; y: number }
}

type CytoscapeOptions = {
  container?: HTMLElement
  elements?: CytoscapeElementInput[]
  style?: unknown[]
  layout?: { name: string }
  userZoomingEnabled?: boolean
  userPanningEnabled?: boolean
  selectionType?: string
}

type TapHandler = (event: { target: { data: (key: string) => unknown } }) => void

type MockElement = {
  group?: 'nodes' | 'edges'
  dataStore: Record<string, unknown>
  classes: Set<string>
  positionStore: { x: number; y: number }
  id: ReturnType<typeof vi.fn<() => string>>
  data: ReturnType<typeof vi.fn<(key: string) => unknown>>
  position: ReturnType<typeof vi.fn<() => { x: number; y: number }>>
  addClass: ReturnType<typeof vi.fn<(classes: string) => void>>
  removeClass: ReturnType<typeof vi.fn<(classes: string) => void>>
  nonempty: ReturnType<typeof vi.fn<() => boolean>>
}

type MockCollection = {
  remove: ReturnType<typeof vi.fn<() => void>>
  removeClass: ReturnType<typeof vi.fn<(classes: string) => void>>
  forEach: ReturnType<typeof vi.fn<(callback: (element: MockElement) => void) => void>>
  nonempty: ReturnType<typeof vi.fn<() => boolean>>
}

function createMockElement(input: CytoscapeElementInput): MockElement {
  const element = {
    group: input.group,
    dataStore: input.data ?? {},
    positionStore: input.position ?? { x: 0, y: 0 },
    classes: new Set((input.classes ?? '').split(' ').filter(Boolean)),
    id: vi.fn(() => String(input.data?.id ?? '')),
    data: vi.fn((key: string) => input.data?.[key]),
    position: vi.fn(() => element.positionStore),
    addClass: vi.fn((classes: string) => {
      for (const className of classes.split(' ').filter(Boolean)) {
        element.classes.add(className)
      }
    }),
    removeClass: vi.fn((classes: string) => {
      for (const className of classes.split(' ').filter(Boolean)) {
        element.classes.delete(className)
      }
    }),
    nonempty: vi.fn(() => true),
  }

  return element
}

function createEmptyElement(id: string): MockElement {
  const element = createMockElement({ data: { id }, classes: '' })
  element.nonempty.mockReturnValue(false)
  element.addClass.mockImplementation(() => undefined)
  element.removeClass.mockImplementation(() => undefined)

  return element
}

function createCollection(elements: MockElement[], removeElements?: () => void): MockCollection {
  return {
    remove: vi.fn(() => {
      removeElements?.()
    }),
    removeClass: vi.fn((classes: string) => {
      for (const element of elements) {
        element.removeClass(classes)
      }
    }),
    forEach: vi.fn((callback: (element: MockElement) => void) => {
      elements.forEach(callback)
    }),
    nonempty: vi.fn(() => elements.length > 0),
  }
}

const cytoscapeMock = vi.hoisted(() => {
  const instances: Array<{
    fit: ReturnType<typeof vi.fn>
    zoom: ReturnType<typeof vi.fn>
    pan: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    elements: ReturnType<typeof vi.fn>
    nodes: ReturnType<typeof vi.fn>
    edges: ReturnType<typeof vi.fn>
    getElementById: ReturnType<typeof vi.fn>
    layout: ReturnType<typeof vi.fn>
    autoungrabify: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    handlers: Record<string, TapHandler>
    elementsById: Map<string, MockElement>
    options: CytoscapeOptions
  }> = []
  const constructor = vi.fn((options: CytoscapeOptions) => {
    const elementStore: MockElement[] = []
    const elementsById = new Map<string, MockElement>()
    let zoomLevel = 1
    let panPosition = { x: 0, y: 0 }
    const addElements = (elements: CytoscapeElementInput[] = []) => {
      for (const elementInput of elements) {
        const element = createMockElement(elementInput)
        elementStore.push(element)
        elementsById.set(element.id(), element)
      }
    }
    const removeElements = () => {
      elementStore.length = 0
      elementsById.clear()
    }

    addElements(options.elements)

    const instance = {
      fit: vi.fn(),
      zoom: vi.fn((nextZoom?: number) => {
        if (typeof nextZoom === 'number') {
          zoomLevel = nextZoom
          return undefined
        }

        return zoomLevel
      }),
      pan: vi.fn((nextPan?: { x: number; y: number }) => {
        if (nextPan) {
          panPosition = { ...nextPan }
          return undefined
        }

        return { ...panPosition }
      }),
      destroy: vi.fn(),
      add: vi.fn((elements: CytoscapeElementInput[]) => {
        addElements(elements)
      }),
      elements: vi.fn(() => createCollection(elementStore, removeElements)),
      nodes: vi.fn(() => createCollection(elementStore.filter((element) => element.group === 'nodes'))),
      edges: vi.fn(() => createCollection(elementStore.filter((element) => element.group === 'edges'))),
      getElementById: vi.fn((id: string) => elementsById.get(id) ?? createEmptyElement(id)),
      layout: vi.fn(() => ({ run: vi.fn() })),
      autoungrabify: vi.fn(),
      on: vi.fn((eventName: string, selector: string, handler: TapHandler) => {
        instance.handlers[`${eventName}:${selector}`] = handler
      }),
      handlers: {} as Record<string, TapHandler>,
      elementsById,
      options,
    }

    instances.push(instance)
    return instance
  })

  return { constructor, instances }
})

vi.mock('cytoscape', () => ({
  default: cytoscapeMock.constructor,
}))

function buildNodes(): KnowledgeGraphNode[] {
  return [
    {
      concept_id: 10,
      slug: 'vue',
      name: 'Vue',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '1.0000',
      total_weight: '3.5000',
      source_count: 7,
      activity_breakdown: [
        { activity_type: 'authored_answer', total_weight: '2.0000', source_count: 4 },
      ],
      related_questions: [
        {
          question_id: '22222222-2222-4222-8222-222222222222',
          title: 'Как визуализировать граф знаний?',
          status: 'open',
        },
      ],
    },
    {
      concept_id: 11,
      slug: 'django',
      name: 'Django',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '0.9000',
      total_weight: '1.2500',
      source_count: 3,
      activity_breakdown: [],
      related_questions: [],
    },
    {
      concept_id: 12,
      slug: 'python',
      name: 'Python',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '0.8000',
      total_weight: '0.0000',
      source_count: 1,
      activity_breakdown: [],
      related_questions: [],
    },
  ]
}

function buildConceptStates(): KnowledgeGraphConceptStateById {
  return {
    10: { semantic_state: 'strong', tone_token: 'emerald' },
    11: { semantic_state: 'weak', tone_token: 'amber' },
    12: { semantic_state: 'stale', tone_token: 'violet' },
  }
}

function buildEdges(): KnowledgeGraphEdge[] {
  return [
    {
      id: '10-11',
      source_concept_id: 10,
      target_concept_id: 11,
      weight: '1.5000',
      shared_question_count: 2,
      reason: 'shared_question',
      related_questions: [
        {
          question_id: '22222222-2222-4222-8222-222222222222',
          title: 'Как визуализировать граф знаний?',
          status: 'open',
        },
      ],
    },
    {
      id: '11-12',
      source_concept_id: 11,
      target_concept_id: 12,
      weight: '0.5000',
      shared_question_count: 0,
      reason: 'shared_question',
      related_questions: [],
    },
  ]
}

function buildSemanticGraphMetadata(overrides: Partial<KnowledgeGraphSemanticGraphMetadata> = {}): KnowledgeGraphSemanticGraphMetadata {
  return {
    schema_version: 1,
    mode: 'semantic',
    status: 'degraded',
    reason_code: 'provider_error',
    phase: 'group_projection',
    enabled: true,
    available: true,
    visible_group_count: 2,
    visible_member_count: 3,
    semantic_edge_count: 0,
    lifecycle_counts: { active: 1, stale: 1 },
    supported_lifecycle_statuses: ['active', 'stale'],
    archived_groups_included: false,
    ...overrides,
  }
}

function buildSemanticEdges(): KnowledgeGraphSemanticEdge[] {
  return [
    {
      id: 'semantic-10-12',
      source_concept_id: 10,
      target_concept_id: 12,
      weight: '0.8400',
      similarity_score: '0.8400',
      confidence: '0.9000',
      rank: 1,
      reason: 'semantic_neighbour',
      evidence: { source: 'test' },
    },
  ]
}

function buildSemanticGroups(): KnowledgeGraphSemanticGroup[] {
  return [
    {
      group_key: 'frontend-patterns',
      label: 'Frontend patterns',
      description: 'UI and state management concepts.',
      rationale: 'safe aggregate rationale',
      confidence: '0.9200',
      generated_at: '2026-05-13T12:00:00Z',
      evidence: { member_count: 2 },
      members: [
        { concept_id: 10, slug: 'vue', name: 'Vue', rank: 1, confidence: '0.9500', evidence: { score: 1 } },
        { concept_id: 11, slug: 'django', name: 'Django', rank: 2, confidence: '0.8000', evidence: { score: 2 } },
      ],
      lifecycle_status: 'active',
      lifecycle_reason_code: 'current',
      reuse_evidence: { reused: false },
      member_count: 2,
      first_seen_at: '2026-05-13T12:00:00Z',
      last_seen_at: '2026-05-13T12:00:00Z',
      stale_at: null,
      archived_at: null,
    },
    {
      group_key: 'backend-legacy',
      label: 'Backend legacy',
      description: 'Server-side concepts that may need refresh.',
      rationale: 'safe aggregate rationale',
      confidence: '0.6200',
      generated_at: '2026-05-13T12:00:00Z',
      evidence: { member_count: 1 },
      members: [
        { concept_id: 12, slug: 'python', name: 'Python', rank: 1, confidence: '0.7000', evidence: { score: 3 } },
      ],
      lifecycle_status: 'stale',
      lifecycle_reason_code: 'stale_snapshot',
      reuse_evidence: { reused: true },
      member_count: 1,
      first_seen_at: '2026-05-13T12:00:00Z',
      last_seen_at: '2026-05-13T12:00:00Z',
      stale_at: '2026-05-13T12:00:00Z',
      archived_at: null,
    },
  ]
}

function classListFor(elementId: string): string[] {
  const element = cytoscapeMock.instances[0].elementsById.get(elementId)

  return [...(element?.classes ?? [])].sort()
}

describe('KnowledgeGraphRenderer', () => {
  beforeEach(() => {
    cytoscapeMock.constructor.mockClear()
    cytoscapeMock.instances.length = 0
  })

  it('defaults to structural projection without rendering semantic projection chrome', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        semanticGroups: buildSemanticGroups(),
        semanticGraph: buildSemanticGraphMetadata(),
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="knowledge-graph-semantic-projection"]').exists()).toBe(false)
    expect(cytoscapeMock.constructor).toHaveBeenCalledOnce()
    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions
    expect(options.elements?.some((element) => element.data?.id === 'semantic-cluster-frontend-patterns')).toBe(false)
  })

  it('emits semantic visibility changes when the legend toggle is clicked', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        semanticEdges: buildSemanticEdges(),
        showSemanticEdges: true,
        isOwner: true,
      },
    })
    await flushPromises()

    const toggle = wrapper.get('[data-testid="knowledge-graph-semantic-toggle"]')
    expect(toggle.text()).toBe('Скрыть семантический слой')
    expect(toggle.attributes('aria-pressed')).toBe('true')

    await toggle.trigger('click')

    expect(wrapper.emitted('semantic-visibility-changed')).toEqual([[false]])
  })

  it('renders owner semantic groups as accessible projection areas with lifecycle counts', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        projectionMode: 'semantic',
        nodes: buildNodes(),
        edges: buildEdges(),
        semanticGroups: buildSemanticGroups(),
        semanticGraph: buildSemanticGraphMetadata(),
        isOwner: true,
      },
    })
    await flushPromises()

    const projection = wrapper.get('[data-testid="knowledge-graph-semantic-projection"]')
    expect(projection.attributes('data-mode')).toBe('semantic')
    expect(projection.attributes('data-state')).toBe('degraded')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-mode"]').text()).toBe('semantic')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-group-count"]').text()).toContain('2 групп')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-member-count"]').text()).toContain('3 участников')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-lifecycle-counts"]').text()).toContain('active 1 · stale 1')

    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions
    const semanticClusterStyle = options.style?.find((style) => (style as { selector?: string }).selector === '.knowledge-semantic-cluster') as { style?: Record<string, unknown> } | undefined
    expect(semanticClusterStyle?.style).toMatchObject({
      'text-valign': 'top',
      'text-margin-y': -34,
      'text-background-opacity': 0.88,
      'text-background-padding': 5,
    })
    expect(options.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({
          id: 'semantic-cluster-frontend-patterns',
          isSemanticCluster: true,
          label: 'Frontend patterns',
          visibleMemberCount: 2,
        }),
        classes: expect.stringContaining('knowledge-semantic-cluster--active'),
      }),
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({
          id: 'semantic-cluster-backend-legacy',
          isSemanticCluster: true,
          label: 'Backend legacy',
          visibleMemberCount: 1,
        }),
        classes: expect.stringContaining('knowledge-semantic-cluster--stale'),
      }),
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({ id: 'concept-10', parent: 'semantic-cluster-frontend-patterns' }),
      }),
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({ id: 'concept-12', parent: 'semantic-cluster-backend-legacy' }),
      }),
    ]))

    const activeArea = wrapper.get('[data-testid="knowledge-graph-semantic-area-frontend-patterns"]')
    const activeToggle = wrapper.get('[data-testid="knowledge-graph-semantic-area-toggle-frontend-patterns"]')
    expect(activeArea.attributes('role')).toBe('listitem')
    expect(activeArea.attributes('aria-label')).toContain('Frontend patterns')
    expect(activeArea.attributes('data-lifecycle')).toBe('active')
    expect(activeArea.attributes('data-selected')).toBe('false')
    expect(activeToggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="knowledge-graph-semantic-area-details-frontend-patterns"]').exists()).toBe(false)

    await activeToggle.trigger('click')

    expect(wrapper.get('[data-testid="knowledge-graph-semantic-projection"]').attributes('data-selected-group-key')).toBe('frontend-patterns')
    expect(activeArea.attributes('data-selected')).toBe('true')
    expect(activeToggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-area-details-frontend-patterns"]').text()).toContain('Vue')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-area-details-frontend-patterns"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-area-lifecycle-backend-legacy"]').text()).toContain('Устаревшая')
    expect(wrapper.text()).not.toContain('provider_error raw')
  })

  it('renders safe unavailable semantic projection copy and keeps structural controls reachable', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        projectionMode: 'semantic',
        nodes: buildNodes(),
        edges: buildEdges(),
        semanticGroups: [],
        semanticGraph: buildSemanticGraphMetadata({
          status: 'pending',
          reason_code: '',
          phase: '',
          available: false,
          visible_group_count: 0,
          visible_member_count: 0,
          lifecycle_counts: { active: 0, stale: 0 },
        }),
        isOwner: true,
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-semantic-projection"]').attributes('data-state')).toBe('unavailable')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-state"]').text()).toContain('Семантическая проекция пока недоступна')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-selector"]').text()).toContain('Vue')
    expect(wrapper.get('[data-testid="knowledge-graph-viewport-toolbar"]').text()).toContain('Сбросить масштаб')
  })

  it('omits semantic projection chrome for public renderer even when semantic props are present', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        projectionMode: 'semantic',
        nodes: buildNodes(),
        edges: buildEdges(),
        semanticGroups: buildSemanticGroups(),
        semanticGraph: buildSemanticGraphMetadata(),
        isOwner: false,
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="knowledge-graph-semantic-projection"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="knowledge-graph-semantic-area-toggle-"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-graph-concept-selector"]').text()).toContain('Vue')
  })

  it('marks semantic members filtered out of current nodes without exposing private internals', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        projectionMode: 'semantic',
        nodes: buildNodes().slice(0, 1),
        edges: [],
        semanticGroups: buildSemanticGroups().slice(0, 1),
        semanticGraph: buildSemanticGraphMetadata({ visible_group_count: 1, visible_member_count: 1, lifecycle_counts: { active: 1, stale: 0 } }),
        isOwner: true,
      },
    })
    await flushPromises()

    const area = wrapper.get('[data-testid="knowledge-graph-semantic-area-frontend-patterns"]')
    expect(area.text()).toContain('1 из 2 видимых концептов')
    expect(area.text()).toContain('1 скрыто фильтрами')

    await wrapper.get('[data-testid="knowledge-graph-semantic-area-toggle-frontend-patterns"]').trigger('click')

    expect(wrapper.get('[data-testid="knowledge-graph-semantic-member-frontend-patterns-11"]').text()).toContain('скрыт фильтрами')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-member-frontend-patterns-11"]').attributes('data-actionable')).toBe('false')
    expect(area.text()).not.toContain('safe aggregate rationale')
    expect(area.text()).not.toContain('reused')
  })

  it('emits existing node-selected contract from visible semantic member controls only', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        projectionMode: 'semantic',
        nodes: buildNodes().slice(0, 1),
        edges: [],
        semanticGroups: buildSemanticGroups().slice(0, 1),
        semanticGraph: buildSemanticGraphMetadata({ visible_group_count: 1, visible_member_count: 1, lifecycle_counts: { active: 1, stale: 0 } }),
        isOwner: true,
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-semantic-area-toggle-frontend-patterns"]').trigger('click')
    await wrapper.get('[data-testid="knowledge-graph-semantic-member-frontend-patterns-10"]').trigger('click')

    expect(wrapper.emitted('node-selected')).toEqual([[10]])
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-member-frontend-patterns-11"]').element.tagName).toBe('SPAN')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-member-frontend-patterns-11"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.findAll('button[data-testid="knowledge-graph-semantic-member-frontend-patterns-11"]')).toHaveLength(0)
  })

  it('resets stale semantic area selection when available groups change', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        projectionMode: 'semantic',
        nodes: buildNodes(),
        edges: buildEdges(),
        semanticGroups: buildSemanticGroups(),
        semanticGraph: buildSemanticGraphMetadata(),
        isOwner: true,
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-semantic-area-toggle-backend-legacy"]').trigger('click')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-projection"]').attributes('data-selected-group-key')).toBe('backend-legacy')
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-area-details-backend-legacy"]').text()).toContain('Python')

    await wrapper.setProps({
      semanticGroups: buildSemanticGroups().slice(0, 1),
      semanticGraph: buildSemanticGraphMetadata({ visible_group_count: 1, visible_member_count: 2, lifecycle_counts: { active: 1, stale: 0 } }),
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-semantic-projection"]').attributes('data-selected-group-key')).toBe('')
    expect(wrapper.find('[data-testid="knowledge-graph-semantic-area-details-backend-legacy"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-graph-semantic-area-toggle-frontend-patterns"]').attributes('aria-expanded')).toBe('false')
  })

  it('maps parsed concepts and shared-question edges into safe Cytoscape elements', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes().slice(0, 2),
        edges: buildEdges().slice(0, 1),
      },
    })
    await flushPromises()

    expect(cytoscapeMock.constructor).toHaveBeenCalledOnce()
    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions

    expect(options.container).toBeInstanceOf(HTMLElement)
    expect(options.userZoomingEnabled).toBe(true)
    expect(options.userPanningEnabled).toBe(true)
    expect(options.selectionType).toBe('single')
    expect(options.layout).toEqual({ name: 'grid', fit: true, padding: 32 })
    expect(options.elements).toEqual([
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({
          id: 'concept-10',
          conceptId: 10,
          label: '• Vue',
          accessibleLabel: 'Vue. Состояние: Без оценки. Состояние пока недоступно',
          semanticState: 'unknown',
          stateLabel: 'Без оценки',
          stateSymbol: '•',
          weight: 3.5,
          sourceCount: 7,
          activitySourceCount: 4,
          relatedQuestionCount: 1,
        }),
        classes: 'knowledge-node knowledge-node--strong knowledge-node--state-unknown',
      }),
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({
          id: 'concept-11',
          conceptId: 11,
          label: '• Django',
          accessibleLabel: 'Django. Состояние: Без оценки. Состояние пока недоступно',
          semanticState: 'unknown',
          stateLabel: 'Без оценки',
          stateSymbol: '•',
          weight: 1.25,
          sourceCount: 3,
          activitySourceCount: 0,
          relatedQuestionCount: 0,
        }),
        classes: 'knowledge-node knowledge-node--medium knowledge-node--state-unknown',
      }),
      expect.objectContaining({
        group: 'edges',
        data: expect.objectContaining({
          id: '10-11',
          source: 'concept-10',
          target: 'concept-11',
          weight: 1.5,
          sharedQuestionCount: 2,
          relatedQuestionCount: 1,
        }),
        classes: 'knowledge-edge knowledge-edge--shared-question',
      }),
    ])
    expect(options.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: 'node' }),
      expect.objectContaining({ selector: 'edge' }),
      expect.objectContaining({ selector: '.knowledge-node--strong' }),
      expect.objectContaining({ selector: '.knowledge-node--state-strong' }),
      expect.objectContaining({ selector: '.knowledge-node--state-weak' }),
      expect.objectContaining({ selector: '.knowledge-node--state-unknown' }),
      expect.objectContaining({ selector: 'node:selected, .knowledge-node--selected' }),
      expect.objectContaining({ selector: '.knowledge-node--neighbour' }),
      expect.objectContaining({ selector: '.knowledge-node--dimmed' }),
      expect.objectContaining({ selector: '.knowledge-edge--neighbour' }),
      expect.objectContaining({ selector: '.knowledge-edge--dimmed' }),
    ]))
  })

  it('maps semantic insight states into Cytoscape classes, data, and accessible labels', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        conceptStates: buildConceptStates(),
      },
    })
    await flushPromises()

    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions
    const vueNode = options.elements?.find((element) => element.data?.id === 'concept-10')
    const djangoNode = options.elements?.find((element) => element.data?.id === 'concept-11')

    expect(vueNode).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        label: '✓ Vue',
        accessibleLabel: 'Vue. Состояние: Сильный. Уверенная зона знаний',
        semanticState: 'strong',
        stateLabel: 'Сильный',
        stateSymbol: '✓',
      }),
      classes: 'knowledge-node knowledge-node--strong knowledge-node--state-strong',
    }))
    expect(djangoNode).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        label: '! Django',
        semanticState: 'weak',
        stateLabel: 'Слабый',
      }),
      classes: 'knowledge-node knowledge-node--medium knowledge-node--state-weak',
    }))
    expect(classListFor('concept-12')).toContain('knowledge-node--state-stale')
  })

  it('renders selector state badges with text labels and neutral fallback', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        conceptStates: {
          10: { semantic_state: 'growing', tone_token: 'sky' },
          11: { semantic_state: 'not-a-state', tone_token: 'private-provider-token' },
        },
      },
    })
    await flushPromises()

    const growingBadge = wrapper.get('[data-testid="knowledge-graph-concept-state-10"]')
    const unknownBadge = wrapper.get('[data-testid="knowledge-graph-concept-state-11"]')
    const missingBadge = wrapper.get('[data-testid="knowledge-graph-concept-state-12"]')

    expect(growingBadge.attributes('data-state')).toBe('growing')
    expect(growingBadge.text()).toContain('↗')
    expect(growingBadge.text()).toContain('Растёт')
    expect(unknownBadge.attributes('data-state')).toBe('unknown')
    expect(unknownBadge.text()).toContain('Без оценки')
    expect(missingBadge.attributes('data-state')).toBe('unknown')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').attributes('aria-label')).toContain('Состояние: Растёт')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').attributes('aria-label')).toContain('Выбрать концепт')
    await wrapper.setProps({ selectedConceptId: 10 })
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').attributes('aria-label')).toContain('Снять выделение')
    expect(wrapper.text()).not.toContain('private-provider-token')
  })

  it('applies selected, neighbouring, and dimmed classes from props', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        selectedConceptId: 10,
        neighbourConceptIds: [11, 999],
        neighbourEdgeIds: ['10-11', 'missing-edge'],
      },
    })
    await flushPromises()

    expect(classListFor('concept-10')).toEqual(expect.arrayContaining(['knowledge-node--selected']))
    expect(classListFor('concept-11')).toEqual(expect.arrayContaining(['knowledge-node--neighbour']))
    expect(classListFor('concept-12')).toEqual(expect.arrayContaining(['knowledge-node--dimmed']))
    expect(classListFor('10-11')).toEqual(expect.arrayContaining(['knowledge-edge--neighbour']))
    expect(classListFor('11-12')).toEqual(expect.arrayContaining(['knowledge-edge--dimmed']))
    expect(cytoscapeMock.instances[0].getElementById).toHaveBeenCalledWith('concept-999')
    expect(cytoscapeMock.instances[0].getElementById).toHaveBeenCalledWith('missing-edge')
  })

  it('refreshes highlight props without recreating Cytoscape or rebuilding elements', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    const instance = cytoscapeMock.instances[0]
    const addCallsBeforeHighlight = instance.add.mock.calls.length
    const layoutCallsBeforeHighlight = instance.layout.mock.calls.length

    await wrapper.setProps({
      selectedConceptId: 10,
      neighbourConceptIds: [11],
      neighbourEdgeIds: ['10-11'],
    })
    await flushPromises()

    expect(cytoscapeMock.constructor).toHaveBeenCalledOnce()
    expect(instance.add).toHaveBeenCalledTimes(addCallsBeforeHighlight)
    expect(instance.layout).toHaveBeenCalledTimes(layoutCallsBeforeHighlight)
    expect(classListFor('concept-10')).toEqual(expect.arrayContaining(['knowledge-node--selected']))
    expect(classListFor('concept-11')).toEqual(expect.arrayContaining(['knowledge-node--neighbour']))
  })

  it('clears stale highlight classes when the selected concept switches', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        selectedConceptId: 10,
        neighbourConceptIds: [11],
        neighbourEdgeIds: ['10-11'],
      },
    })
    await flushPromises()

    await wrapper.setProps({
      selectedConceptId: 11,
      neighbourConceptIds: [],
      neighbourEdgeIds: [],
    })
    await flushPromises()

    expect(classListFor('concept-10')).not.toContain('knowledge-node--selected')
    expect(classListFor('concept-10')).not.toContain('knowledge-node--neighbour')
    expect(classListFor('concept-10')).toContain('knowledge-node--dimmed')
    expect(classListFor('concept-11')).toContain('knowledge-node--selected')
    expect(classListFor('10-11')).not.toContain('knowledge-edge--neighbour')
    expect(classListFor('10-11')).toContain('knowledge-edge--dimmed')
  })

  it('ignores unknown selected and neighbour ids without creating phantom elements', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        selectedConceptId: 404,
        neighbourConceptIds: [11],
        neighbourEdgeIds: ['10-11'],
      },
    })
    await flushPromises()

    expect(cytoscapeMock.instances[0].elementsById.has('concept-404')).toBe(false)
    expect(classListFor('concept-11')).not.toContain('knowledge-node--neighbour')
    expect(classListFor('10-11')).not.toContain('knowledge-edge--neighbour')
    expect(classListFor('concept-10')).not.toContain('knowledge-node--dimmed')
  })

  it('keeps an isolated selected node highlighted without requiring neighbour edges', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: [buildNodes()[0]],
        edges: [],
        selectedConceptId: 10,
        neighbourConceptIds: [],
        neighbourEdgeIds: [],
      },
    })
    await flushPromises()

    expect(classListFor('concept-10')).toContain('knowledge-node--selected')
    expect(cytoscapeMock.instances[0].edges).toHaveBeenCalled()
  })

  it('resets and zooms the graph through compact controls above the canvas', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    const toolbar = wrapper.get('[data-testid="knowledge-graph-viewport-toolbar"]')

    expect(toolbar.text()).toContain('Сбросить масштаб')
    expect(toolbar.text()).toContain('+')
    expect(toolbar.text()).toContain('−')
    expect(toolbar.text()).not.toContain('Фокусировать граф')

    await wrapper.get('[data-testid="knowledge-graph-reset-control"]').trigger('click')
    await wrapper.get('[data-testid="knowledge-graph-zoom-in-control"]').trigger('click')
    await wrapper.get('[data-testid="knowledge-graph-zoom-out-control"]').trigger('click')

    const instance = cytoscapeMock.instances[0]
    const zoomSetCalls = instance.zoom.mock.calls.filter((call) => call.length > 0)
    expect(zoomSetCalls).toHaveLength(3)
    expect(zoomSetCalls[0][0]).toBe(1)
    expect(zoomSetCalls[1][0]).toBeCloseTo(1.18)
    expect(zoomSetCalls[2][0]).toBeCloseTo(1.003)
    expect(instance.pan).toHaveBeenCalledWith({ x: 0, y: 0 })
    expect(instance.fit).toHaveBeenCalledWith(undefined, 32)
  })

  it('opens a fullscreen graph modal and shares node selection without extra footer chrome', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-fullscreen-control"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-fullscreen-modal"]').text()).toContain('Топология концептов на весь экран')
    expect(wrapper.find('[data-testid="knowledge-graph-fullscreen-selection"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Перейти к концепту')
    expect(cytoscapeMock.instances).toHaveLength(2)

    cytoscapeMock.instances[1].handlers['tap:node']({
      target: { data: (key: string) => (key === 'conceptId' ? 11 : undefined) },
    })

    expect(wrapper.emitted('node-selected')).toEqual([[11]])

    await wrapper.setProps({
      selectedConceptId: 11,
      neighbourConceptIds: [10],
      neighbourEdgeIds: ['10-11'],
    })
    await flushPromises()

    expect(classListFor('concept-11')).toContain('knowledge-node--selected')
    expect(wrapper.find('[data-testid="knowledge-graph-fullscreen-modal"]').exists()).toBe(true)
  })

  it('renders owner layout controls disabled until a node is dragged and mirrors them in fullscreen', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        isOwner: true,
        isLayoutDirty: false,
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-layout-save-control"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="knowledge-graph-layout-reset-control"]').attributes('disabled')).toBeDefined()
    expect(cytoscapeMock.instances[0].autoungrabify).toHaveBeenCalledWith(false)

    const vueNode = cytoscapeMock.instances[0].elementsById.get('concept-10')
    if (!vueNode) {
      throw new Error('Expected concept-10 mock node')
    }
    vueNode.positionStore = { x: 12, y: 34 }
    cytoscapeMock.instances[0].handlers['dragfree:node']({
      target: { data: (key: string) => (key === 'conceptId' ? 10 : undefined) },
    })

    expect(wrapper.emitted('layout-changed')).toEqual([[expect.objectContaining({ 10: { x: 12, y: 34 } })]])

    await wrapper.setProps({ isLayoutDirty: true })
    await wrapper.get('[data-testid="knowledge-graph-fullscreen-control"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-layout-save-control"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="knowledge-graph-layout-reset-control"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="knowledge-graph-modal-layout-save-control"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="knowledge-graph-modal-layout-reset-control"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-testid="knowledge-graph-modal-layout-save-control"]').trigger('click')
    await wrapper.get('[data-testid="knowledge-graph-layout-reset-control"]').trigger('click')

    expect(wrapper.emitted('layout-save-requested')).toEqual([[]])
    expect(wrapper.emitted('layout-reset-requested')).toEqual([[]])
  })

  it('hides layout persistence controls for public read-only graphs', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        isOwner: false,
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="knowledge-graph-layout-save-control"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="knowledge-graph-layout-reset-control"]').exists()).toBe(false)
    expect(cytoscapeMock.instances[0].autoungrabify).toHaveBeenCalledWith(true)

    await wrapper.get('[data-testid="knowledge-graph-fullscreen-control"]').trigger('click')

    expect(wrapper.find('[data-testid="knowledge-graph-modal-layout-save-control"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="knowledge-graph-modal-layout-reset-control"]').exists()).toBe(false)
  })

  it('uses preset layout when persisted positions are provided', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        layoutPositions: {
          10: { x: 120, y: 80 },
          11: { x: 260, y: 100 },
        },
      },
    })
    await flushPromises()

    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions
    const vueNode = options.elements?.find((element) => element.data?.id === 'concept-10')

    expect(options.layout).toEqual({ name: 'preset', fit: true, padding: 32 })
    expect(vueNode?.position).toEqual({ x: 120, y: 80 })
  })

  it('preserves the current viewport when dragged layout positions are reapplied', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        isOwner: true,
      },
    })
    await flushPromises()

    const instance = cytoscapeMock.instances[0]
    instance.zoom(2.25)
    instance.pan({ x: -120, y: 75 })

    const zoomCallsBeforeLayoutUpdate = instance.zoom.mock.calls.length
    const panCallsBeforeLayoutUpdate = instance.pan.mock.calls.length

    await wrapper.setProps({
      layoutPositions: {
        10: { x: 180, y: 90 },
        11: { x: 260, y: 120 },
        12: { x: 320, y: 180 },
      },
    })
    await flushPromises()

    expect(instance.layout).toHaveBeenCalled()
    expect(instance.zoom.mock.calls.slice(zoomCallsBeforeLayoutUpdate)).toEqual([[], [2.25]])
    expect(instance.pan.mock.calls.slice(panCallsBeforeLayoutUpdate)).toEqual([[], [{ x: -120, y: 75 }]])
  })

  it('emits the numeric concept id when a graph node is tapped', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    cytoscapeMock.instances[0].handlers['tap:node']({
      target: { data: (key: string) => (key === 'conceptId' ? 10 : undefined) },
    })

    expect(wrapper.emitted('node-selected')).toEqual([[10]])
  })

  it('renders accessible concept selector controls from parsed nodes', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    const selector = wrapper.get('[data-testid="knowledge-graph-concept-selector"]')
    const options = wrapper.findAll('[data-testid^="knowledge-graph-concept-option-"]')

    expect(selector.attributes('aria-label')).toBe('Выбор концепта на графе знаний')
    expect(options).toHaveLength(3)
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').text()).toContain('Vue')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').text()).toContain('7 ·')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').attributes('aria-pressed')).toBe('false')
  })

  it('emits the same node-selected contract from concept selector controls', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-concept-option-11"]').trigger('click')

    expect(wrapper.emitted('node-selected')).toEqual([[11]])
  })

  it('marks only the matching selector control as selected', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        selectedConceptId: 11,
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-11"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-12"]').attributes('aria-pressed')).toBe('false')

    await wrapper.setProps({ selectedConceptId: 404 })

    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-11"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="knowledge-graph-concept-option-12"]').attributes('aria-pressed')).toBe('false')
  })

  it('does not render selector controls for empty nodes', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: [],
        edges: [],
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="knowledge-graph-concept-selector"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid^="knowledge-graph-concept-option-"]')).toHaveLength(0)
  })

  it('keeps isolated nodes selectable through the concept selector', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: [buildNodes()[0]],
        edges: [],
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').trigger('click')

    expect(wrapper.emitted('node-selected')).toEqual([[10]])
  })

  it('keeps selector controls usable when Cytoscape cannot initialize', async () => {
    cytoscapeMock.constructor.mockImplementationOnce(() => {
      throw new Error('container unavailable')
    })

    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-concept-option-10"]').trigger('click')

    expect(wrapper.get('[data-testid="knowledge-graph-renderer-unavailable"]').text()).toContain(
      'Не удалось отобразить интерактивный граф',
    )
    expect(wrapper.text()).not.toContain('container unavailable')
    expect(wrapper.emitted('node-selected')).toEqual([[10]])
  })

  it('renders empty topology copy without constructing Cytoscape', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: [],
        edges: [],
        selectedConceptId: 10,
        neighbourConceptIds: [11],
        neighbourEdgeIds: ['10-11'],
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-renderer-empty"]').text()).toContain('Граф знаний пока пуст')
    expect(cytoscapeMock.constructor).not.toHaveBeenCalled()
  })

  it('renders safe fallback copy when Cytoscape cannot initialize', async () => {
    cytoscapeMock.constructor.mockImplementationOnce(() => {
      throw new Error('container unavailable')
    })

    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
        selectedConceptId: 10,
        neighbourConceptIds: [11],
        neighbourEdgeIds: ['10-11'],
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-renderer-unavailable"]').text()).toContain(
      'Не удалось отобразить интерактивный граф',
    )
    expect(wrapper.text()).not.toContain('container unavailable')
  })

  it('updates topology without recreating Cytoscape and destroys Cytoscape on unmount', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: [buildNodes()[0]],
        edges: [],
      },
    })
    await flushPromises()

    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions
    expect(options.elements).toHaveLength(1)

    await wrapper.setProps({
      nodes: buildNodes(),
      edges: buildEdges(),
      selectedConceptId: 10,
      neighbourConceptIds: [11],
      neighbourEdgeIds: ['10-11'],
    })
    await flushPromises()

    expect(cytoscapeMock.constructor).toHaveBeenCalledOnce()
    expect(cytoscapeMock.instances[0].add).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ id: 'concept-12' }) }),
    ]))
    expect(classListFor('concept-10')).toContain('knowledge-node--selected')

    wrapper.unmount()

    expect(cytoscapeMock.instances[0].destroy).toHaveBeenCalledOnce()
  })
})
