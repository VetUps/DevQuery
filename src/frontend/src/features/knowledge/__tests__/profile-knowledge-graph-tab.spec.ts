import { computed, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  KnowledgeGraphSemanticDiagnostics,
  KnowledgeGraphSemanticGraphMetadata,
  KnowledgeGraphSemanticGroup,
  UserKnowledgeGraphInsightsResponse,
  UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import type { KnowledgeGraphProjectionMode } from '@/features/knowledge/components/knowledgeGraphSemanticProjection'
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

const insightsHarness = vi.hoisted(() => {
  const state = {
    data: undefined as UserKnowledgeGraphInsightsResponse | undefined,
    isPending: false,
    isError: false,
    enabledArgs: [] as unknown[],
  }

  const query = {
    data: { get value() { return state.data } },
    isPending: { get value() { return state.isPending } },
    isError: { get value() { return state.isError } },
  }

  return { state, query }
})

const mutationHarness = vi.hoisted(() => ({
  mutation: {
    isPending: { value: false },
    mutateAsync: vi.fn(),
  },
  saveLayoutMutation: {
    isPending: { value: false },
    mutateAsync: vi.fn(),
  },
  resetLayoutMutation: {
    isPending: { value: false },
    mutateAsync: vi.fn(),
  },
}))

const useOwnKnowledgeGraphQueryMock = vi.hoisted(() => vi.fn(() => queryHarness.ownQuery))
const usePublicUserKnowledgeGraphQueryMock = vi.hoisted(() => vi.fn(() => queryHarness.publicQuery))
const useOwnKnowledgeGraphInsightsQueryMock = vi.hoisted(() => vi.fn((enabled: unknown) => {
  insightsHarness.state.enabledArgs.push(enabled)
  return insightsHarness.query
}))
const useRebuildKnowledgeGraphMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.mutation))
const useSaveKnowledgeGraphLayoutMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.saveLayoutMutation))
const useResetKnowledgeGraphLayoutMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.resetLayoutMutation))
const rendererHarness = vi.hoisted(() => ({
  props: [] as Array<{
    projectionMode: KnowledgeGraphProjectionMode
    nodes: UserKnowledgeGraphResponse['nodes']
    edges: UserKnowledgeGraphResponse['edges']
    semanticEdges: UserKnowledgeGraphResponse['semantic_edges']
    semanticGroups: KnowledgeGraphSemanticGroup[]
    semanticGraph: KnowledgeGraphSemanticGraphMetadata | undefined
    semanticDiagnostics: KnowledgeGraphSemanticDiagnostics | undefined
    showSemanticEdges: boolean
    selectedConceptId: number | null
    neighbourConceptIds: number[]
    neighbourEdgeIds: string[]
    layoutPositions: Record<string, { x: number; y: number }>
    isOwner: boolean
    isLayoutDirty: boolean
    isLayoutSaving: boolean
    isLayoutResetting: boolean
    conceptStates: Record<string | number, { semantic_state: string; tone_token: string } | undefined>
  }>,
}))

vi.mock('@/features/knowledge/components/KnowledgeGraphRenderer.vue', () => ({
  default: {
    name: 'KnowledgeGraphRendererStub',
    props: {
      projectionMode: { type: String, default: 'structural' },
      nodes: { type: Array, required: true },
      edges: { type: Array, required: true },
      semanticEdges: { type: Array, default: () => [] },
      semanticGroups: { type: Array, default: () => [] },
      semanticGraph: { type: Object, default: undefined },
      semanticDiagnostics: { type: Object, default: undefined },
      showSemanticEdges: { type: Boolean, default: false },
      selectedConceptId: { type: Number, default: null },
      neighbourConceptIds: { type: Array, default: () => [] },
      neighbourEdgeIds: { type: Array, default: () => [] },
      layoutPositions: { type: Object, default: () => ({}) },
      isOwner: { type: Boolean, default: false },
      isLayoutDirty: { type: Boolean, default: false },
      isLayoutSaving: { type: Boolean, default: false },
      isLayoutResetting: { type: Boolean, default: false },
      conceptStates: { type: Object, default: () => ({}) },
    },
    emits: ['node-selected', 'layout-changed', 'layout-save-requested', 'layout-reset-requested', 'semantic-visibility-changed'],
    setup(props: {
      projectionMode: KnowledgeGraphProjectionMode
      nodes: UserKnowledgeGraphResponse['nodes']
      edges: UserKnowledgeGraphResponse['edges']
      semanticEdges: UserKnowledgeGraphResponse['semantic_edges']
      semanticGroups: KnowledgeGraphSemanticGroup[]
      semanticGraph?: KnowledgeGraphSemanticGraphMetadata
      semanticDiagnostics?: KnowledgeGraphSemanticDiagnostics
      showSemanticEdges: boolean
      selectedConceptId: number | null
      neighbourConceptIds: number[]
      neighbourEdgeIds: string[]
      layoutPositions: Record<string, { x: number; y: number }>
      isOwner: boolean
      isLayoutDirty: boolean
      isLayoutSaving: boolean
      isLayoutResetting: boolean
      conceptStates: Record<string | number, { semantic_state: string; tone_token: string } | undefined>
    }, { emit }: { emit: (event: 'node-selected' | 'layout-changed' | 'layout-save-requested' | 'layout-reset-requested' | 'semantic-visibility-changed', payload?: unknown) => void }) {
      rendererHarness.props.push({
        projectionMode: props.projectionMode,
        nodes: props.nodes,
        edges: props.edges,
        semanticEdges: props.semanticEdges,
        semanticGroups: props.semanticGroups,
        semanticGraph: props.semanticGraph,
        semanticDiagnostics: props.semanticDiagnostics,
        showSemanticEdges: props.showSemanticEdges,
        selectedConceptId: props.selectedConceptId,
        neighbourConceptIds: props.neighbourConceptIds,
        neighbourEdgeIds: props.neighbourEdgeIds,
        layoutPositions: props.layoutPositions,
        isOwner: props.isOwner,
        isLayoutDirty: props.isLayoutDirty,
        isLayoutSaving: props.isLayoutSaving,
        isLayoutResetting: props.isLayoutResetting,
        conceptStates: props.conceptStates,
      })

      function selectConcept(conceptId: number) {
        emit('node-selected', conceptId)
      }

      function changeLayout() {
        emit('layout-changed', { 10: { x: 120, y: 80 }, 11: { x: 260, y: 120 } })
      }

      function saveLayout() {
        emit('layout-save-requested')
      }

      function resetLayout() {
        emit('layout-reset-requested')
      }

      function toggleSemanticLayer() {
        emit('semantic-visibility-changed', !props.showSemanticEdges)
      }

      return { props, selectConcept, changeLayout, saveLayout, resetLayout, toggleSemanticLayer }
    },
    template: `
      <section data-testid="knowledge-graph-renderer-stub">
        {{ props.nodes.length }} nodes / {{ props.edges.length }} edges
        <span data-testid="renderer-projection-mode">{{ props.projectionMode }}</span>
        <span data-testid="renderer-semantic-count">{{ props.semanticEdges.length }}</span>
        <span data-testid="renderer-semantic-groups-count">{{ props.semanticGroups.length }}</span>
        <span data-testid="renderer-semantic-graph-status">{{ props.semanticGraph?.status ?? 'none' }}</span>
        <span data-testid="renderer-semantic-diagnostics-status">{{ props.semanticDiagnostics?.status ?? 'none' }}</span>
        <span data-testid="renderer-semantic-visible">{{ props.showSemanticEdges ? 'semantic-on' : 'semantic-off' }}</span>
        <span data-testid="renderer-selected-id">{{ props.selectedConceptId ?? 'none' }}</span>
        <span data-testid="renderer-neighbour-ids">{{ props.neighbourConceptIds.join(',') }}</span>
        <span data-testid="renderer-edge-ids">{{ props.neighbourEdgeIds.join(',') }}</span>
        <span data-testid="renderer-is-owner">{{ props.isOwner ? 'owner' : 'readonly' }}</span>
        <span data-testid="renderer-layout-dirty">{{ props.isLayoutDirty ? 'dirty' : 'clean' }}</span>
        <span data-testid="renderer-layout-positions">{{ Object.keys(props.layoutPositions).join(',') }}</span>
        <span data-testid="renderer-concept-states">{{ Object.entries(props.conceptStates).map(([id, state]) => id + ':' + state?.semantic_state).join(',') }}</span>
        <button type="button" data-testid="select-concept-10" @click="selectConcept(10)">select 10</button>
        <button type="button" data-testid="select-concept-11" @click="selectConcept(11)">select 11</button>
        <button type="button" data-testid="select-concept-404" @click="selectConcept(404)">select missing</button>
        <button type="button" data-testid="change-layout" @click="changeLayout">change layout</button>
        <button type="button" data-testid="save-layout" @click="saveLayout">save layout</button>
        <button type="button" data-testid="reset-layout" @click="resetLayout">reset layout</button>
        <button type="button" data-testid="toggle-semantic-layer" @click="toggleSemanticLayer">toggle semantic</button>
      </section>
    `,
  },
}))

vi.mock('@/features/knowledge/queries/useKnowledgeGraphQuery', () => ({
  useOwnKnowledgeGraphQuery: useOwnKnowledgeGraphQueryMock,
  usePublicUserKnowledgeGraphQuery: usePublicUserKnowledgeGraphQueryMock,
}))

vi.mock('@/features/knowledge/queries/useKnowledgeGraphInsightsQuery', () => ({
  useOwnKnowledgeGraphInsightsQuery: useOwnKnowledgeGraphInsightsQueryMock,
}))

vi.mock('@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation', () => ({
  useRebuildKnowledgeGraphMutation: useRebuildKnowledgeGraphMutationMock,
}))

vi.mock('@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation', () => ({
  useSaveKnowledgeGraphLayoutMutation: useSaveKnowledgeGraphLayoutMutationMock,
  useResetKnowledgeGraphLayoutMutation: useResetKnowledgeGraphLayoutMutationMock,
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
    semantic_edges: [],
    semantic_groups: [],
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

function buildSemanticGraphMetadata(overrides: Partial<KnowledgeGraphSemanticGraphMetadata> = {}): KnowledgeGraphSemanticGraphMetadata {
  return {
    schema_version: 1,
    mode: 'semantic',
    status: 'available',
    reason_code: '',
    phase: 'projection',
    enabled: true,
    available: true,
    visible_group_count: 1,
    visible_member_count: 2,
    semantic_edge_count: 0,
    lifecycle_counts: { active: 1, stale: 0, archived: 0 },
    supported_lifecycle_statuses: ['active', 'stale'],
    archived_groups_included: false,
    ...overrides,
  }
}

function buildSemanticDiagnostics(overrides: Partial<KnowledgeGraphSemanticDiagnostics> = {}): KnowledgeGraphSemanticDiagnostics {
  return {
    status: 'available',
    reason_code: '',
    phase: 'projection',
    enabled: true,
    dry_run: false,
    source_item_count: 2,
    total_source_count: 2,
    changed_source_count: 0,
    provider_called_source_count: 0,
    reused_snapshot_count: 0,
    persisted_snapshot_count: 1,
    neighbour_candidate_count: 0,
    semantic_group_count: 1,
    semantic_group_membership_count: 2,
    semantic_group_reused_count: 0,
    semantic_group_created_count: 1,
    semantic_group_changed_count: 0,
    semantic_group_stale_count: 0,
    semantic_group_archived_count: 0,
    estimated_token_count: 0,
    estimated_cost: '0.000000',
    budget_cap: '0.000000',
    last_error_message: '',
    started_at: '2026-05-11T10:00:00Z',
    finished_at: '2026-05-11T10:01:00Z',
    view: {
      mode: 'semantic',
      visible_lifecycle_statuses: ['active', 'stale'],
      archived_groups_included: false,
    },
    ...overrides,
  }
}

function buildSemanticGroup(overrides: Partial<KnowledgeGraphSemanticGroup> = {}): KnowledgeGraphSemanticGroup {
  return {
    group_key: 'frameworks',
    label: 'Web frameworks',
    description: 'Long safe description for related framework concepts that remains readable in the details surface.',
    rationale: 'Grouped from aggregate activity patterns without private source details.',
    confidence: '0.9100',
    generated_at: '2026-05-11T10:00:00Z',
    evidence: { aggregate_signal_count: 3 },
    members: [
      { concept_id: 10, slug: 'django', name: 'Django', rank: 1, confidence: '0.9300', evidence: { aggregate_signal_count: 2 } },
      { concept_id: 11, slug: 'vue', name: 'Vue', rank: 2, confidence: '0.8200', evidence: { aggregate_signal_count: 1 } },
    ],
    lifecycle_status: 'active',
    lifecycle_reason_code: 'current',
    reuse_evidence: { aggregate_signal_count: 1 },
    member_count: 2,
    first_seen_at: '2026-05-11T10:00:00Z',
    last_seen_at: '2026-05-11T10:00:00Z',
    ...overrides,
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

function buildInsights(overrides: Partial<UserKnowledgeGraphInsightsResponse> = {}): UserKnowledgeGraphInsightsResponse {
  return {
    user_id: '11111111-1111-4111-8111-111111111111',
    viewer: { is_owner: true },
    state: {
      status: 'fresh',
      stale_reason: '',
      last_failed_phase: '',
      last_rebuild_started_at: '2026-05-06T11:30:00Z',
      last_rebuild_finished_at: '2026-05-06T12:00:00Z',
    },
    summary: {
      concept_count: 2,
      recommendation_count: 0,
      states: { strong: 1, weak: 1 },
    },
    concepts: [
      {
        concept_id: 10,
        slug: 'django',
        name: 'Django',
        total_weight: '2.5000',
        source_count: 5,
        related_question_count: 1,
        semantic_state: 'strong',
        tone_token: 'success',
        recommendations: [],
      },
      {
        concept_id: 11,
        slug: 'vue',
        name: 'Vue',
        total_weight: '0.0000',
        source_count: 0,
        related_question_count: 0,
        semantic_state: 'weak',
        tone_token: 'warning',
        recommendations: [],
      },
    ],
    ...overrides,
  }
}

function setInsightsState(overrides: Partial<typeof insightsHarness.state> = {}) {
  insightsHarness.state.data = buildInsights()
  insightsHarness.state.isPending = false
  insightsHarness.state.isError = false
  insightsHarness.state.enabledArgs = []

  Object.assign(insightsHarness.state, overrides)
}

function setMutationState() {
  mutationHarness.mutation.isPending.value = false
  mutationHarness.mutation.mutateAsync.mockReset()
  mutationHarness.mutation.mutateAsync.mockResolvedValue({})
  mutationHarness.saveLayoutMutation.isPending.value = false
  mutationHarness.saveLayoutMutation.mutateAsync.mockReset()
  mutationHarness.saveLayoutMutation.mutateAsync.mockResolvedValue({})
  mutationHarness.resetLayoutMutation.isPending.value = false
  mutationHarness.resetLayoutMutation.mutateAsync.mockReset()
  mutationHarness.resetLayoutMutation.mutateAsync.mockResolvedValue({})
}

async function mountTab(props: { userId?: string } = {}) {
  const wrapper = mount(ProfileKnowledgeGraphTab, {
    props,
    global: {
      stubs: {
        RouterLink: {
          name: 'RouterLink',
          props: { to: { type: [Object, String], required: true } },
          template: '<a v-bind="$attrs" :data-route-name="typeof to === \'object\' ? to.name : to" :data-route-query="typeof to === \'object\' ? JSON.stringify(to.query ?? {}) : \'{}\'"><slot /></a>',
        },
      },
    },
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return wrapper
}

async function openSemanticGroupsDialog(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="knowledge-semantic-groups-open"]').trigger('click')
  await flushPromises()
  await nextTick()
}

function getBodyByTestId(testId: string): HTMLElement {
  const element = document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

  if (!element) {
    throw new Error(`Unable to get body element [data-testid="${testId}"]`)
  }

  return element
}

describe('ProfileKnowledgeGraphTab', () => {
  beforeEach(() => {
    setQueryState()
    setInsightsState()
    setMutationState()
    useOwnKnowledgeGraphQueryMock.mockClear()
    usePublicUserKnowledgeGraphQueryMock.mockClear()
    useRebuildKnowledgeGraphMutationMock.mockClear()
    useOwnKnowledgeGraphInsightsQueryMock.mockClear()
    rendererHarness.props.length = 0
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
    document.body.style.overflow = ''
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

    const conceptDiscoveryLink = wrapper.get('[data-testid="knowledge-concept-discovery-10"]')
    expect(conceptDiscoveryLink.text()).toContain('Открыть вопросы по концепту')
    expect(conceptDiscoveryLink.attributes('data-route-name')).toBe('home')
    expect(JSON.parse(conceptDiscoveryLink.attributes('data-route-query') ?? '{}')).toEqual({ tag: ['django'] })

    const questionLink = wrapper.get('a[href="/questions/22222222-2222-4222-8222-222222222222"]')
    expect(questionLink.text()).toBe('Как построить безопасный граф знаний?')
    expect(wrapper.text()).not.toContain('event')
    expect(wrapper.text()).not.toContain('@')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('opens a concise knowledge graph help dialog from the hero eyebrow', async () => {
    setQueryState({ data: buildGraph() })

    const wrapper = await mountTab()

    const helpButton = wrapper.get('[data-testid="knowledge-graph-help-open"]')
    expect(helpButton.attributes('aria-label')).toBe('Открыть справку о графе знаний')
    expect(document.body.querySelector('[data-testid="knowledge-graph-help-dialog"]')).toBeNull()

    await helpButton.trigger('click')
    await flushPromises()
    await nextTick()

    const dialog = getBodyByTestId('knowledge-graph-help-dialog')
    expect(dialog.textContent).toContain('Как работает граф знаний')
    expect(dialog.textContent).toContain('Структурный граф')
    expect(dialog.textContent).toContain('Семантический граф')
    expect(dialog.textContent).toContain('реальным действиям на сайте')
    expect(dialog.textContent).toContain('смысловую близость тем')

    dialog.querySelector<HTMLButtonElement>('.app-dialog__close')?.click()
    await flushPromises()
    await nextTick()

    expect(document.body.querySelector('[data-testid="knowledge-graph-help-dialog"]')).toBeNull()
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
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Связанные вопросы')
    const selectedDiscoveryLink = wrapper.get('[data-testid="knowledge-selected-concept-discovery"]')
    expect(selectedDiscoveryLink.text()).toContain('Открыть вопросы по концепту')
    expect(selectedDiscoveryLink.attributes('data-route-name')).toBe('home')
    expect(JSON.parse(selectedDiscoveryLink.attributes('data-route-query') ?? '{}')).toEqual({ tag: ['django'] })
    expect(wrapper.find('a[href="/questions/22222222-2222-4222-8222-222222222222"]').exists()).toBe(false)

    await wrapper.get('[data-testid="knowledge-related-questions-open"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-related-questions-modal"]').text()).toContain('Как построить безопасный граф знаний?')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="knowledge-graph-selected-details"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')

    await wrapper.get('[data-testid="knowledge-view-mode-graph"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('10')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')

    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('none')
    expect(wrapper.find('[data-testid="knowledge-graph-selected-details"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('keeps owner layout controls clean until drag, then saves and resets draft positions', async () => {
    const graph = buildGraph({
      layout: {
        schema_version: 1,
        positions: { 10: { x: 1, y: 2 } },
        updated_at: '2026-05-11T12:00:00Z',
      },
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="renderer-is-owner"]').text()).toBe('owner')
    expect(wrapper.get('[data-testid="renderer-layout-dirty"]').text()).toBe('clean')
    expect(wrapper.get('[data-testid="renderer-layout-positions"]').text()).toBe('10')

    await wrapper.get('[data-testid="save-layout"]').trigger('click')
    expect(mutationHarness.saveLayoutMutation.mutateAsync).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="change-layout"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="renderer-layout-dirty"]').text()).toBe('dirty')
    expect(wrapper.get('[data-testid="renderer-layout-positions"]').text()).toBe('10,11')

    await wrapper.get('[data-testid="save-layout"]').trigger('click')
    await flushPromises()

    expect(mutationHarness.saveLayoutMutation.mutateAsync).toHaveBeenCalledWith({
      schema_version: 1,
      positions: { 10: { x: 120, y: 80 }, 11: { x: 260, y: 120 } },
    })
    expect(wrapper.get('[data-testid="renderer-layout-dirty"]').text()).toBe('clean')

    await wrapper.get('[data-testid="change-layout"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="reset-layout"]').trigger('click')
    await flushPromises()

    expect(mutationHarness.resetLayoutMutation.mutateAsync).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="renderer-layout-dirty"]').text()).toBe('clean')
  })

  it('keeps public layout controls read-only and ignores layout-change events', async () => {
    setQueryState({ data: buildGraph({ viewer: { is_owner: false } }) })

    const wrapper = await mountTab({ userId: 'user-42' })

    expect(wrapper.get('[data-testid="renderer-is-owner"]').text()).toBe('readonly')

    await wrapper.get('[data-testid="change-layout"]').trigger('click')
    await wrapper.get('[data-testid="save-layout"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="renderer-layout-dirty"]').text()).toBe('clean')
    expect(mutationHarness.saveLayoutMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it('shows safe copy when layout persistence fails', async () => {
    setQueryState({ data: buildGraph() })
    mutationHarness.saveLayoutMutation.mutateAsync.mockRejectedValueOnce(new Error('Traceback raw internals'))

    const wrapper = await mountTab()

    await wrapper.get('[data-testid="change-layout"]').trigger('click')
    await wrapper.get('[data-testid="save-layout"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-layout-error"]').text()).toContain('Не удалось сохранить расположение графа')
    expect(wrapper.text()).not.toContain('Traceback raw internals')
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
    expect(wrapper.get('[data-testid="knowledge-state-banner"]').text()).toContain('question_authoring')
    expect(wrapper.find('[data-testid="knowledge-graph-state-context"]').exists()).toBe(false)
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

  it('merges owner insights into legend, counts, renderer states, and list badges', async () => {
    setQueryState({ data: buildGraph() })
    setInsightsState({ data: buildInsights() })

    const wrapper = await mountTab()

    expect(useOwnKnowledgeGraphInsightsQueryMock).toHaveBeenCalledOnce()
    const enabledArg = useOwnKnowledgeGraphInsightsQueryMock.mock.calls[0][0]
    expect(computed(() => enabledArg.value).value).toBe(true)
    expect(wrapper.find('[data-testid="knowledge-insights-status"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-insights-legend"]').text()).toContain('Сильный')
    expect(wrapper.get('[data-testid="knowledge-insights-legend"]').text()).toContain('Без оценки')
    expect(wrapper.get('[data-testid="knowledge-insights-filter-count"]').text()).toContain('2 из 2 концептов')
    expect(wrapper.get('[data-testid="renderer-concept-states"]').text()).toContain('10:strong')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-insights-concept-state-10"]').text()).toContain('Сильный')
    expect(wrapper.get('[data-testid="knowledge-insights-concept-state-11"]').text()).toContain('Слабый')
    expect(wrapper.text()).not.toContain('action_payload')
  })

  it('filters graph topology, list cards, counts, and selected concept by search and state', async () => {
    setQueryState({ data: buildGraph() })
    setInsightsState({ data: buildInsights() })

    const wrapper = await mountTab()

    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('10')

    await wrapper.get('[data-testid="knowledge-insights-search"]').setValue('vue')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-insights-filter-count"]').text()).toContain('1 из 2 концептов')
    expect(wrapper.get('[data-testid="knowledge-graph-mode"]').text()).toContain('1 nodes / 0 edges')
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('none')
    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Vue')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).not.toContain('Django')

    await wrapper.get('[data-testid="knowledge-insights-clear-filters"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="knowledge-insights-state-filter-strong"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-insights-filter-count"]').text()).toContain('1 из 2 концептов')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-concepts"]').text()).not.toContain('Vue')
  })

  it('uses neutral fallback for missing or failed owner insights and hides private controls publicly', async () => {
    setQueryState({ data: buildGraph() })
    setInsightsState({ data: buildInsights({ concepts: [buildInsights().concepts[0]] }) })

    const wrapper = await mountTab()
    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-insights-concept-state-11"]').text()).toContain('Без оценки')

    wrapper.unmount()
    setQueryState({ data: buildGraph() })
    setInsightsState({ isError: true })
    const degradedWrapper = await mountTab()
    expect(degradedWrapper.get('[data-testid="knowledge-insights-status"]').text()).toContain('Состояния концептов временно недоступны')
    expect(degradedWrapper.get('[data-testid="renderer-concept-states"]').text()).toBe('')
    expect(degradedWrapper.text()).not.toContain('Traceback')

    degradedWrapper.unmount()
    setQueryState({ data: buildGraph({ viewer: { is_owner: false } }) })
    setInsightsState({ data: buildInsights() })
    const publicWrapper = await mountTab({ userId: 'user-42' })
    const publicEnabledArg = useOwnKnowledgeGraphInsightsQueryMock.mock.calls.at(-1)?.[0]
    expect(computed(() => publicEnabledArg.value).value).toBe(false)
    expect(publicWrapper.find('[data-testid="knowledge-insights-status"]').exists()).toBe(false)
    expect(publicWrapper.find('[data-testid="knowledge-insights-search"]').exists()).toBe(false)
    expect(publicWrapper.find('[data-testid="knowledge-insights-legend"]').exists()).toBe(false)
  })


  it('wires owner-only structural and semantic projection mode into the renderer', async () => {
    const graph = buildGraph({
      semantic: buildSemanticDiagnostics(),
      semantic_graph: buildSemanticGraphMetadata(),
      semantic_groups: [buildSemanticGroup()],
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="profile-graph-projection-switch"]').attributes('role')).toBe('group')
    expect(wrapper.get('[data-testid="profile-graph-projection-structural"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="renderer-projection-mode"]').text()).toBe('structural')
    expect(rendererHarness.props.at(-1)?.projectionMode).toBe('structural')
    expect(rendererHarness.props.at(-1)?.semanticGroups).toHaveLength(1)
    expect(rendererHarness.props.at(-1)?.semanticGraph?.status).toBe('available')
    expect(rendererHarness.props.at(-1)?.semanticDiagnostics?.status).toBe('available')

    await wrapper.get('[data-testid="profile-graph-projection-semantic"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="profile-graph-projection-semantic"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="renderer-projection-mode"]').text()).toBe('semantic')
    expect(wrapper.get('[data-testid="renderer-semantic-groups-count"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="renderer-semantic-graph-status"]').text()).toBe('available')
  })

  it('shows safe degraded semantic projection copy to the owner without requiring visible groups', async () => {
    const graph = buildGraph({
      semantic: buildSemanticDiagnostics({ status: 'degraded', reason_code: 'provider_error', phase: 'grouping', enabled: true }),
      semantic_graph: buildSemanticGraphMetadata({
        status: 'degraded',
        reason_code: 'provider_error',
        phase: 'grouping',
        available: false,
        visible_group_count: 0,
        visible_member_count: 0,
        lifecycle_counts: { active: 0, stale: 0, archived: 0 },
      }),
      semantic_groups: [],
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="profile-graph-projection-help"]').text()).toContain('временно недоступна')
    expect(wrapper.get('[data-testid="profile-graph-projection-help"]').attributes('data-status')).toBe('degraded')
    expect(wrapper.get('[data-testid="knowledge-graph-mode"]').text()).toContain('2 nodes / 1 edges')

    await wrapper.get('[data-testid="profile-graph-projection-semantic"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="renderer-projection-mode"]').text()).toBe('semantic')
    expect(wrapper.get('[data-testid="renderer-semantic-groups-count"]').text()).toBe('0')
  })

  it('omits semantic projection controls and owner DTO text from public graphs', async () => {
    const graph = buildGraph({
      viewer: { is_owner: false },
      semantic: undefined,
      semantic_graph: undefined,
      semantic_groups: [buildSemanticGroup({ label: 'Private owner semantic label' })],
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab({ userId: 'user-42' })

    expect(wrapper.find('[data-testid="profile-graph-projection-switch"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="renderer-projection-mode"]').text()).toBe('structural')
    expect(wrapper.get('[data-testid="renderer-semantic-groups-count"]').text()).toBe('0')
    expect(wrapper.text()).not.toContain('Private owner semantic label')
    expect(wrapper.text()).not.toContain('provider_error')
  })


  it('passes owner semantic neighbours separately and toggles the private overlay without changing structural edges', async () => {
    const graph = buildGraph({
      semantic_edges: [
        {
          id: 'semantic-10-11',
          source_concept_id: 10,
          target_concept_id: 11,
          weight: '0.9000',
          similarity_score: '0.8700',
          confidence: '0.7600',
          rank: 1,
          reason: 'semantic_neighbour',
          evidence: { overlap_count: 2 },
        },
      ],
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="renderer-semantic-count"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="renderer-semantic-visible"]').text()).toBe('semantic-on')
    expect(rendererHarness.props[0].edges).toBe(graph.edges)
    expect(rendererHarness.props[0].semanticEdges).toStrictEqual(graph.semantic_edges)

    await wrapper.get('[data-testid="toggle-semantic-layer"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="renderer-semantic-count"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="renderer-semantic-visible"]').text()).toBe('semantic-off')
    expect(rendererHarness.props.at(-1)?.edges).toBe(graph.edges)
  })

  it('renders owner semantic groups with safe details and keeps filtered-out groups hidden', async () => {
    const graph = buildGraph({
      semantic_groups: [
        {
          group_key: 'frameworks',
          label: 'Web frameworks',
          description: 'Long safe description for related framework concepts that remains readable in the details surface.',
          rationale: 'Grouped from aggregate activity patterns without private source details.',
          confidence: '0.9100',
          generated_at: '2026-05-11T10:00:00Z',
          evidence: { signal_count: 3, shared_activity_types: ['answers', 'questions'] },
          members: [
            { concept_id: 10, slug: 'django', name: 'Django', rank: 1, confidence: '0.9300', evidence: { signal_count: 2 } },
            { concept_id: 11, slug: 'vue', name: 'Vue', rank: 2, confidence: '0.8200', evidence: { signal_count: 1 } },
          ],
        },
      ],
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab()

    expect(wrapper.find('[data-testid="knowledge-semantic-groups-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-semantic-groups-count-summary"]').text()).toContain('1')
    await openSemanticGroupsDialog(wrapper)

    expect(getBodyByTestId('knowledge-semantic-groups-panel').textContent).toContain('Как темы связаны по смыслу')
    expect(getBodyByTestId('knowledge-semantic-groups-status').textContent).toContain('Доступно групп: 1')
    expect(getBodyByTestId('knowledge-semantic-group-card-frameworks').getAttribute('aria-expanded')).toBe('false')
    getBodyByTestId('knowledge-semantic-group-card-frameworks').click()
    await nextTick()
    expect(getBodyByTestId('knowledge-semantic-group-card-frameworks').getAttribute('aria-expanded')).toBe('true')
    expect(getBodyByTestId('knowledge-semantic-group-details-frameworks').textContent).toContain('Web frameworks')
    expect(getBodyByTestId('knowledge-semantic-group-details-frameworks').textContent).toContain('Long safe description')
    expect(getBodyByTestId('knowledge-semantic-group-members').textContent).toContain('Django')
    expect(getBodyByTestId('knowledge-semantic-group-members').textContent).toContain('ранг 1')
    expect(getBodyByTestId('knowledge-semantic-group-members').textContent).toContain('уверенность 0,93')

    getBodyByTestId('knowledge-semantic-group-member-10').click()
    await nextTick()

    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('10')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-selected-concept-discovery"]').attributes('data-route-name')).toBe('home')
    expect(JSON.parse(wrapper.get('[data-testid="knowledge-selected-concept-discovery"]').attributes('data-route-query') ?? '{}')).toEqual({ tag: ['django'] })

    await wrapper.get('[data-testid="knowledge-related-questions-open"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-related-questions-modal"]').text()).toContain('Как построить безопасный граф знаний?')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')

    await openSemanticGroupsDialog(wrapper)
    getBodyByTestId('knowledge-semantic-group-card-frameworks').click()
    await nextTick()
    getBodyByTestId('knowledge-semantic-group-member-11').click()
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('11')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Vue')

    expect(document.body.textContent).not.toContain('signal_count')
    expect(document.body.textContent).not.toContain('raw_output')
    expect(document.body.textContent).not.toContain('provider')

    await wrapper.get('[data-testid="knowledge-insights-search"]').setValue('django')
    await nextTick()
    await openSemanticGroupsDialog(wrapper)
    getBodyByTestId('knowledge-semantic-group-card-frameworks').click()
    await nextTick()

    expect(getBodyByTestId('knowledge-semantic-group-card-frameworks').getAttribute('aria-expanded')).toBe('true')
    expect(getBodyByTestId('knowledge-semantic-group-members').textContent).toContain('Django')
    expect(document.body.querySelector('[data-testid="knowledge-semantic-group-member-11"]')).toBeNull()
    expect(getBodyByTestId('knowledge-semantic-group-hidden-members').textContent).toContain('Скрыто фильтрами: 1')
    expect(wrapper.get('[data-testid="renderer-selected-id"]').text()).toBe('none')
    expect(rendererHarness.props.at(-1)?.edges).toBe(graph.edges)
  })

  it('shows owner-safe semantic group empty and degraded copy without hiding base controls', async () => {
    setQueryState({ data: buildGraph({ semantic_groups: [] }), isError: true })

    const wrapper = await mountTab()

    expect(wrapper.find('[data-testid="knowledge-semantic-groups-panel"]').exists()).toBe(false)
    await openSemanticGroupsDialog(wrapper)

    expect(getBodyByTestId('knowledge-semantic-groups-panel').textContent).toContain('Семантические группы')
    expect(getBodyByTestId('knowledge-semantic-groups-status').textContent).toContain('временно недоступно')
    expect(getBodyByTestId('knowledge-semantic-groups-empty').textContent).toContain('после достаточного количества')
    expect(wrapper.get('[data-testid="knowledge-graph-mode"]').text()).toContain('2 nodes / 1 edges')
    expect(wrapper.find('[data-testid="knowledge-rebuild-button"]').exists()).toBe(true)
  })
  it('hides owner-only semantic surfaces for public graphs and tolerates empty semantic arrays', async () => {
    const graph = buildGraph({
      viewer: { is_owner: false },
      semantic_edges: [],
      semantic_groups: [],
    })
    setQueryState({ data: graph })

    const wrapper = await mountTab({ userId: 'user-42' })

    expect(wrapper.get('[data-testid="renderer-is-owner"]').text()).toBe('readonly')
    expect(wrapper.get('[data-testid="renderer-semantic-count"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="knowledge-semantic-groups-panel"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('semantic_neighbour')
    expect(wrapper.text()).not.toContain('raw_output')
  })

})
