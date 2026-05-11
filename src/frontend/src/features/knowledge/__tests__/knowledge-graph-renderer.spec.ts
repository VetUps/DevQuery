import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/features/knowledge/api/knowledgeGraph'
import KnowledgeGraphRenderer from '@/features/knowledge/components/KnowledgeGraphRenderer.vue'

type CytoscapeElementInput = {
  group?: 'nodes' | 'edges'
  data?: Record<string, unknown>
  classes?: string
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
  id: ReturnType<typeof vi.fn<() => string>>
  data: ReturnType<typeof vi.fn<(key: string) => unknown>>
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
    classes: new Set((input.classes ?? '').split(' ').filter(Boolean)),
    id: vi.fn(() => String(input.data?.id ?? '')),
    data: vi.fn((key: string) => input.data?.[key]),
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
    on: ReturnType<typeof vi.fn>
    handlers: Record<string, TapHandler>
    elementsById: Map<string, MockElement>
    options: CytoscapeOptions
  }> = []
  const constructor = vi.fn((options: CytoscapeOptions) => {
    const elementStore: MockElement[] = []
    const elementsById = new Map<string, MockElement>()
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
      zoom: vi.fn(),
      pan: vi.fn(),
      destroy: vi.fn(),
      add: vi.fn((elements: CytoscapeElementInput[]) => {
        addElements(elements)
      }),
      elements: vi.fn(() => createCollection(elementStore, removeElements)),
      nodes: vi.fn(() => createCollection(elementStore.filter((element) => element.group === 'nodes'))),
      edges: vi.fn(() => createCollection(elementStore.filter((element) => element.group === 'edges'))),
      getElementById: vi.fn((id: string) => elementsById.get(id) ?? createEmptyElement(id)),
      layout: vi.fn(() => ({ run: vi.fn() })),
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
      reason: 'shared_activity',
      related_questions: [],
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
          label: 'Vue',
          weight: 3.5,
          sourceCount: 7,
          activitySourceCount: 4,
          relatedQuestionCount: 1,
        }),
        classes: 'knowledge-node knowledge-node--strong',
      }),
      expect.objectContaining({
        group: 'nodes',
        data: expect.objectContaining({
          id: 'concept-11',
          conceptId: 11,
          label: 'Django',
          weight: 1.25,
          sourceCount: 3,
          activitySourceCount: 0,
          relatedQuestionCount: 0,
        }),
        classes: 'knowledge-node knowledge-node--medium',
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
      expect.objectContaining({ selector: 'node:selected, .knowledge-node--selected' }),
      expect.objectContaining({ selector: '.knowledge-node--neighbour' }),
      expect.objectContaining({ selector: '.knowledge-node--dimmed' }),
      expect.objectContaining({ selector: '.knowledge-edge--neighbour' }),
      expect.objectContaining({ selector: '.knowledge-edge--dimmed' }),
    ]))
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

  it('focuses and resets the graph through accessible controls', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="knowledge-graph-fit-control"]').trigger('click')
    await wrapper.get('[data-testid="knowledge-graph-reset-control"]').trigger('click')

    const instance = cytoscapeMock.instances[0]
    expect(instance.fit).toHaveBeenCalledWith(undefined, 32)
    expect(instance.zoom).toHaveBeenCalledWith(1)
    expect(instance.pan).toHaveBeenCalledWith({ x: 0, y: 0 })
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
