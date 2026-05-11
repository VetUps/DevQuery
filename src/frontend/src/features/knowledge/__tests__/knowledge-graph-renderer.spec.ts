import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/features/knowledge/api/knowledgeGraph'
import KnowledgeGraphRenderer from '@/features/knowledge/components/KnowledgeGraphRenderer.vue'

type CytoscapeOptions = {
  container?: HTMLElement
  elements?: unknown[]
  style?: unknown[]
  layout?: { name: string }
  userZoomingEnabled?: boolean
  userPanningEnabled?: boolean
  selectionType?: string
}

type TapHandler = (event: { target: { data: (key: string) => unknown } }) => void

const cytoscapeMock = vi.hoisted(() => {
  const instances: Array<{
    fit: ReturnType<typeof vi.fn>
    zoom: ReturnType<typeof vi.fn>
    pan: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    elements: ReturnType<typeof vi.fn>
    layout: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    handlers: Record<string, TapHandler>
  }> = []
  const constructor = vi.fn((options: CytoscapeOptions) => {
    const instance = {
      fit: vi.fn(),
      zoom: vi.fn(),
      pan: vi.fn(),
      destroy: vi.fn(),
      add: vi.fn(),
      elements: vi.fn(() => ({ remove: vi.fn() })),
      layout: vi.fn(() => ({ run: vi.fn() })),
      on: vi.fn((eventName: string, selector: string, handler: TapHandler) => {
        instance.handlers[`${eventName}:${selector}`] = handler
      }),
      handlers: {} as Record<string, TapHandler>,
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
  ]
}

describe('KnowledgeGraphRenderer', () => {
  beforeEach(() => {
    cytoscapeMock.constructor.mockClear()
    cytoscapeMock.instances.length = 0
  })

  it('maps parsed concepts and shared-question edges into safe Cytoscape elements', async () => {
    mount(KnowledgeGraphRenderer, {
      props: {
        nodes: buildNodes(),
        edges: buildEdges(),
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
    ]))
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
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-graph-renderer-unavailable"]').text()).toContain(
      'Не удалось отобразить интерактивный граф',
    )
    expect(wrapper.text()).not.toContain('container unavailable')
  })

  it('renders a single isolated node safely and destroys Cytoscape on unmount', async () => {
    const wrapper = mount(KnowledgeGraphRenderer, {
      props: {
        nodes: [buildNodes()[0]],
        edges: [],
      },
    })
    await flushPromises()

    const options = cytoscapeMock.constructor.mock.calls[0][0] as CytoscapeOptions
    expect(options.elements).toHaveLength(1)

    wrapper.unmount()

    expect(cytoscapeMock.instances[0].destroy).toHaveBeenCalledOnce()
  })
})
