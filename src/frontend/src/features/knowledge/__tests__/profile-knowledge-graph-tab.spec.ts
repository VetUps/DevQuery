import { computed, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserKnowledgeGraphResponse } from '@/features/knowledge/api/knowledgeGraph'
import ProfileKnowledgeGraphTab from '@/features/knowledge/components/ProfileKnowledgeGraphTab.vue'

const queryHarness = vi.hoisted(() => {
  const state = {
    data: undefined as UserKnowledgeGraphResponse | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }

  const ownQuery = {
    data: { get value() { return state.data } },
    isPending: { get value() { return state.isPending } },
    isError: { get value() { return state.isError } },
    refetch: state.refetch,
  }

  const publicQuery = ownQuery

  return { state, ownQuery, publicQuery }
})

const mutationHarness = vi.hoisted(() => ({
  mutation: {
    isPending: { value: false },
    mutateAsync: vi.fn(),
  },
}))

const useOwnKnowledgeGraphQueryMock = vi.hoisted(() => vi.fn(() => queryHarness.ownQuery))
const usePublicUserKnowledgeGraphQueryMock = vi.hoisted(() => vi.fn(() => queryHarness.publicQuery))
const useRebuildKnowledgeGraphMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.mutation))
const rendererHarness = vi.hoisted(() => ({
  props: [] as Array<{
    nodes: UserKnowledgeGraphResponse['nodes']
    edges: UserKnowledgeGraphResponse['edges']
    selectedConceptId: number | null
    neighbourConceptIds: number[]
    neighbourEdgeIds: string[]
  }>,
}))

vi.mock('@/features/knowledge/components/KnowledgeGraphRenderer.vue', () => ({
  default: {
    name: 'KnowledgeGraphRendererStub',
    props: {
      nodes: { type: Array, required: true },
      edges: { type: Array, required: true },
      selectedConceptId: { type: Number, default: null },
      neighbourConceptIds: { type: Array, default: () => [] },
      neighbourEdgeIds: { type: Array, default: () => [] },
    },
    emits: ['node-selected'],
    setup(props: {
      nodes: UserKnowledgeGraphResponse['nodes']
      edges: UserKnowledgeGraphResponse['edges']
      selectedConceptId: number | null
      neighbourConceptIds: number[]
      neighbourEdgeIds: string[]
    }, { emit }: { emit: (event: 'node-selected', conceptId: number) => void }) {
      rendererHarness.props.push({
        nodes: props.nodes,
        edges: props.edges,
        selectedConceptId: props.selectedConceptId,
        neighbourConceptIds: props.neighbourConceptIds,
        neighbourEdgeIds: props.neighbourEdgeIds,
      })

      function selectConcept(conceptId: number) {
        emit('node-selected', conceptId)
      }

      return { props, selectConcept }
    },
    template: `
      <section data-testid="knowledge-graph-renderer-stub">
        {{ props.nodes.length }} nodes / {{ props.edges.length }} edges
        <span data-testid="renderer-selected-id">{{ props.selectedConceptId ?? 'none' }}</span>
        <span data-testid="renderer-neighbour-ids">{{ props.neighbourConceptIds.join(',') }}</span>
        <span data-testid="renderer-edge-ids">{{ props.neighbourEdgeIds.join(',') }}</span>
        <button type="button" data-testid="select-concept-10" @click="selectConcept(10)">select 10</button>
        <button type="button" data-testid="select-concept-11" @click="selectConcept(11)">select 11</button>
        <button type="button" data-testid="select-concept-404" @click="selectConcept(404)">select missing</button>
      </section>
    `,
  },
}))

vi.mock('@/features/knowledge/queries/useKnowledgeGraphQuery', () => ({
  useOwnKnowledgeGraphQuery: useOwnKnowledgeGraphQueryMock,
  usePublicUserKnowledgeGraphQuery: usePublicUserKnowledgeGraphQueryMock,
}))

vi.mock('@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation', () => ({
  useRebuildKnowledgeGraphMutation: useRebuildKnowledgeGraphMutationMock,
}))

const mountedWrappers: VueWrapper[] = []

function buildGraph(overrides: Partial<UserKnowledgeGraphResponse> = {}): UserKnowledgeGraphResponse {
  const baseConcepts: UserKnowledgeGraphResponse['concepts'] = [
    {
      concept_id: 10,
      slug: 'django',
      name: 'Django',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '1.0000',
      total_weight: '2.5000',
      source_count: 5,
      activity_breakdown: [
        { activity_type: 'authored_answer', total_weight: '2.0000', source_count: 3 },
      ],
      related_questions: [
        {
          question_id: '22222222-2222-4222-8222-222222222222',
          title: 'Как построить безопасный граф знаний?',
          status: 'open',
        },
      ],
    },
    {
      concept_id: 11,
      slug: 'vue',
      name: 'Vue',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '0.8000',
      total_weight: '0.0000',
      source_count: 0,
      activity_breakdown: [],
      related_questions: [],
    },
  ]

  const graphWithoutTopology = {
    user_id: '11111111-1111-4111-8111-111111111111',
    viewer: { is_owner: true },
    state: {
      status: 'fresh',
      stale_reason: '',
      last_error_message: '',
      last_failed_phase: '',
      last_rebuild_started_at: '2026-05-06T11:30:00Z',
      last_rebuild_finished_at: '2026-05-06T12:00:00Z',
    },
    total_weight: '3.7500',
    activity_breakdown: [
      { activity_type: 'authored_answer', total_weight: '2.0000', source_count: 3 },
      { activity_type: 'question_upvote', total_weight: '1.7500', source_count: 4 },
    ],
    concepts: baseConcepts,
    ...overrides,
  }

  const nodes = overrides.nodes ?? graphWithoutTopology.concepts.map((concept) => ({ ...concept }))
  const edges = overrides.edges ?? (nodes.length >= 2
    ? [
        {
          id: `${nodes[0].concept_id}-${nodes[1].concept_id}`,
          source_concept_id: nodes[0].concept_id,
          target_concept_id: nodes[1].concept_id,
          weight: '1.0000',
          shared_question_count: 1,
          reason: 'shared_question' as const,
          related_questions: nodes[0].related_questions,
        },
      ]
    : [])

  return {
    ...graphWithoutTopology,
    nodes,
    edges,
  }
}

function setQueryState(overrides: Partial<typeof queryHarness.state> = {}) {
  queryHarness.state.data = undefined
  queryHarness.state.isPending = false
  queryHarness.state.isError = false
  queryHarness.state.refetch.mockReset()
  queryHarness.state.refetch.mockResolvedValue(undefined)

  Object.assign(queryHarness.state, overrides)
}

function setMutationState() {
  mutationHarness.mutation.isPending.value = false
  mutationHarness.mutation.mutateAsync.mockReset()
  mutationHarness.mutation.mutateAsync.mockResolvedValue({})
}

async function mountTab(props: { userId?: string } = {}) {
  const wrapper = mount(ProfileKnowledgeGraphTab, { props })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return wrapper
}

describe('ProfileKnowledgeGraphTab', () => {
  beforeEach(() => {
    setQueryState()
    setMutationState()
    useOwnKnowledgeGraphQueryMock.mockClear()
    usePublicUserKnowledgeGraphQueryMock.mockClear()
    useRebuildKnowledgeGraphMutationMock.mockClear()
    rendererHarness.props.length = 0
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('renders concept weights, activity breakdowns, explanations, and related question links', async () => {
    setQueryState({ data: buildGraph() })

    const wrapper = await mountTab()

    expect(useOwnKnowledgeGraphQueryMock).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="knowledge-total-weight"]').text()).toBe('3,75')
    expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain('Граф знаний синхронизирован')
    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-activity-breakdown"]').text()).toContain('Ответы')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Уверенность 1')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Связанные вопросы')

    const questionLink = wrapper.get('a[href="/questions/22222222-2222-4222-8222-222222222222"]')
    expect(questionLink.text()).toBe('Как построить безопасный граф знаний?')
    expect(wrapper.text()).not.toContain('event')
    expect(wrapper.text()).not.toContain('@')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('defaults to graph mode and switches to the accessible list fallback', async () => {
    const graph = buildGraph()
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    const modeSwitch = wrapper.get('[data-testid="knowledge-view-mode-switch"]')
    expect(modeSwitch.attributes('aria-label')).toBe('Режим просмотра графа знаний')
    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="knowledge-view-mode-list"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="knowledge-graph-panel"]').text()).toContain('2 nodes / 1 edges')
    expect(wrapper.find('[data-testid="knowledge-list-panel"]').exists()).toBe(false)

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="knowledge-view-mode-list"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="knowledge-graph-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Ответы')

    await wrapper.get('[data-testid="knowledge-view-mode-graph"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="knowledge-list-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-graph-panel"]').text()).toContain('2 nodes / 1 edges')
    expect(rendererHarness.props[0].nodes).toBe(graph.nodes)
    expect(rendererHarness.props[0].edges).toBe(graph.edges)
  })

  it('passes parsed topology nodes and edges into the renderer before exposing the list fallback', async () => {
    const graph = buildGraph()
    const isolatedNode: UserKnowledgeGraphResponse['nodes'][number] = {
      ...graph.nodes[1],
      concept_id: 12,
      slug: 'isolated-concept',
      name: 'Изолированный концепт',
      total_weight: '0.5000',
      related_questions: [],
    }
    const topologyNodes = [...graph.nodes, isolatedNode]
    const topologyEdges: UserKnowledgeGraphResponse['edges'] = [
      ...graph.edges,
      {
        id: '10-11-secondary',
        source_concept_id: 10,
        target_concept_id: 11,
        weight: '0.7500',
        shared_question_count: 2,
        reason: 'shared_question',
        related_questions: graph.nodes[0].related_questions,
      },
    ]
    setQueryState({ data: buildGraph({ nodes: topologyNodes, edges: topologyEdges }) })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-graph-mode"]').text()).toContain('3 nodes / 2 edges')
    expect(rendererHarness.props).toHaveLength(1)
    expect(rendererHarness.props[0].nodes).toBe(topologyNodes)
    expect(rendererHarness.props[0].edges).toBe(topologyEdges)
    expect(rendererHarness.props[0].nodes.map((node) => node.concept_id)).toEqual([10, 11, 12])
    expect(rendererHarness.props[0].edges.map((edge) => edge.id)).toEqual(['10-11', '10-11-secondary'])
    expect(wrapper.find('[data-testid="knowledge-list-panel"]').exists()).toBe(false)

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="knowledge-graph-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Django')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('keeps empty graph copy and skips renderer composition when parsed topology has no nodes', async () => {
    setQueryState({
      data: buildGraph({
        total_weight: '0.0000',
        activity_breakdown: [],
        concepts: [],
        nodes: [],
        edges: [],
      }),
    })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-graph-empty"]').text()).toContain('Концепты пока не найдены')
    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="knowledge-graph-mode"]').exists()).toBe(false)
    expect(rendererHarness.props).toEqual([])
  })

  it.each([
    ['stale', 'Мы обнаружили расхождение между графом и вашей активностью. Перестройте граф.', 'activity_sync_lag'],
    ['rebuilding', 'Граф знаний обновляется', ''],
    ['failed', 'Последнее перестроение не завершилось', 'question_authoring'],
    ['mystery', 'Статус графа пока не распознан', ''],
  ])('renders a safe %s state banner', async (status, expectedCopy, diagnostic) => {
    setQueryState({
      data: buildGraph({
        state: {
          status,
          stale_reason: diagnostic,
          last_error_message: status === 'failed' ? 'Безопасная ошибка синхронизации.' : '',
          last_failed_phase: diagnostic,
          last_rebuild_started_at: '2026-05-06T11:30:00Z',
          last_rebuild_finished_at: null,
        },
      }),
    })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain(expectedCopy)
    if (diagnostic) {
      expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain(diagnostic)
    }
  })

  it('renders loading, initial API error with retry, and missing data states safely', async () => {
    setQueryState({ isPending: true })
    const loadingWrapper = await mountTab()
    expect(loadingWrapper.get('[data-testid="knowledge-graph-loading"]').text()).toContain('Загружаем граф знаний')
    loadingWrapper.unmount()

    setQueryState({ isError: true })
    const errorWrapper = await mountTab()
    expect(errorWrapper.get('[data-testid="knowledge-graph-error"]').text()).toContain('Не удалось загрузить граф знаний')
    await errorWrapper.get('button').trigger('click')
    expect(queryHarness.state.refetch).toHaveBeenCalledOnce()
    errorWrapper.unmount()

    setQueryState()
    const missingWrapper = await mountTab()
    expect(missingWrapper.get('[data-testid="knowledge-graph-missing"]').text()).toContain('Данные графа недоступны')
  })

  it('wires renderer node selection into details and topology-derived highlight props', async () => {
    const graph = buildGraph()
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('none')

    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('10')
    expect(wrapper.get('[data-testid="renderer-neighbour-ids"]').text()).toBe('11')
    expect(wrapper.get('[data-testid="renderer-edge-ids"]').text()).toBe('10-11')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('Vue')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Как построить безопасный граф знаний?')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="knowledge-graph-selected-details"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')

    await wrapper.get('[data-testid="knowledge-view-mode-graph"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('10')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('ignores missing selected ids and returns to guidance without stale details', async () => {
    const graph = buildGraph()
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')

    await wrapper.get('[data-testid="select-concept-404"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('none')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('renders selected details in public readonly mode without rebuild controls or raw diagnostics', async () => {
    const graph = buildGraph({
      viewer: { is_owner: false },
      state: {
        status: 'failed',
        stale_reason: '',
        last_error_message: 'Traceback provider stack token leaked',
        last_failed_phase: 'question_authoring',
        last_rebuild_started_at: '2026-05-06T11:30:00Z',
        last_rebuild_finished_at: null,
      },
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab({ userId: '  user-42  ' })
    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="knowledge-rebuild-button"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-public-readonly"]').text()).toContain('только владельцу')
    expect(wrapper.get('[data-testid="knowledge-graph-state-context"]').text()).toContain('question_authoring')
    expect(wrapper.get('[data-testid="knowledge-graph-state-context"]').text()).toContain('Технические детали скрыты')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('keeps prior graph data and the safe stale banner visible when a stale refetch error is reported', async () => {
    setQueryState({ data: buildGraph(), isError: true })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain('Показываем последнюю сохранённую версию графа')
    expect(wrapper.get('[data-testid="knowledge-graph-mode"]').text()).toContain('2 nodes / 1 edges')
    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain('Показываем последнюю сохранённую версию графа')
    expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain('Не удалось загрузить граф знаний')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Django')
  })

  it('renders an empty graph without concept cards', async () => {
    setQueryState({
      data: buildGraph({
        total_weight: '0.0000',
        activity_breakdown: [],
        concepts: [],
      }),
    })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-graph-empty"]').text()).toContain('Концепты пока не найдены')
    expect(wrapper.find('[data-testid="knowledge-concepts"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-total-weight"]').text()).toBe('0')
  })

  it('uses the public user hook and hides rebuild controls for public viewers across modes', async () => {
    const graph = buildGraph({ viewer: { is_owner: false } })
    setQueryState({ data: graph })

    const wrapper = await mountTab({ userId: '  user-42  ' })

    expect(usePublicUserKnowledgeGraphQueryMock).toHaveBeenCalledOnce()
    const userIdArg = usePublicUserKnowledgeGraphQueryMock.mock.calls[0][0]
    expect(computed(() => userIdArg.value).value).toBe('user-42')
    expect(wrapper.find('[data-testid="knowledge-rebuild-button"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-public-readonly"]').text()).toContain('только владельцу')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="knowledge-rebuild-button"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-public-readonly"]').text()).toContain('только владельцу')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('shows owner-only rebuild controls and calls the spoof-resistant mutation without a user id', async () => {
    setQueryState({ data: buildGraph() })

    const wrapper = await mountTab()
    await wrapper.get('[data-testid="knowledge-rebuild-button"]').trigger('click')

    expect(mutationHarness.mutation.mutateAsync).toHaveBeenCalledOnce()
    expect(mutationHarness.mutation.mutateAsync).toHaveBeenCalledWith()
  })

  it('disables the rebuild action while pending and renders safe mutation failure copy', async () => {
    setQueryState({ data: buildGraph() })
    mutationHarness.mutation.isPending.value = true

    const pendingWrapper = await mountTab()
    expect(pendingWrapper.get('[data-testid="knowledge-rebuild-button"]').attributes('disabled')).toBeDefined()
    expect(pendingWrapper.get('[data-testid="knowledge-rebuild-pending"]').text()).toContain('Перестроение запущено')
    pendingWrapper.unmount()

    setQueryState({ data: buildGraph() })
    mutationHarness.mutation.isPending.value = false
    mutationHarness.mutation.mutateAsync.mockRejectedValue(new Error('provider stack token leaked'))
    const failureWrapper = await mountTab()

    await failureWrapper.get('[data-testid="knowledge-rebuild-button"]').trigger('click')
    await nextTick()

    expect(failureWrapper.get('[data-testid="knowledge-rebuild-error"]').text()).toContain('Не удалось запустить перестроение графа')
    expect(failureWrapper.text()).not.toContain('provider stack token leaked')
    expect(failureWrapper.get('[data-testid="knowledge-graph-mode"]').text()).toContain('2 nodes / 1 edges')
    await failureWrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(failureWrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Django')
  })
})
