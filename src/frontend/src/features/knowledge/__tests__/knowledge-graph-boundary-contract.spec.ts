import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'

import {
  fetchOwnKnowledgeGraph,
  fetchPublicUserKnowledgeGraph,
  rebuildOwnKnowledgeGraph,
  resetOwnKnowledgeGraphLayout,
  saveOwnKnowledgeGraphLayout,
  type UserKnowledgeGraphInsightsResponse,
  type UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import { buildRebuildKnowledgeGraphMutationOptions } from '@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation'
import {
  buildResetKnowledgeGraphLayoutMutationOptions,
  buildSaveKnowledgeGraphLayoutMutationOptions,
} from '@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation'
import {
  buildKnowledgeGraphQueryKey,
  knowledgeGraphQueryKeys,
} from '@/features/knowledge/queries/useKnowledgeGraphQuery'
import ProfileKnowledgeGraphTab from '@/features/knowledge/components/ProfileKnowledgeGraphTab.vue'

const httpMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

const queryClientMock = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}))

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
}))

const useOwnKnowledgeGraphQueryMock = vi.hoisted(() => vi.fn(() => queryHarness.ownQuery))
const usePublicUserKnowledgeGraphQueryMock = vi.hoisted(() => vi.fn(() => queryHarness.publicQuery))
const useRebuildKnowledgeGraphMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.mutation))
const useSaveKnowledgeGraphLayoutMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.mutation))
const useResetKnowledgeGraphLayoutMutationMock = vi.hoisted(() => vi.fn(() => mutationHarness.mutation))

vi.mock('@/shared/api/http', () => ({
  http: httpMock,
}))

vi.mock('@/app/query-client', () => ({
  queryClient: queryClientMock,
}))

vi.mock('@/features/knowledge/components/KnowledgeGraphRenderer.vue', () => ({
  default: {
    name: 'KnowledgeGraphRendererBoundaryStub',
    props: {
      nodes: { type: Array, required: true },
      edges: { type: Array, required: true },
      selectedConceptId: { type: Number, default: null },
      neighbourConceptIds: { type: Array, default: () => [] },
      neighbourEdgeIds: { type: Array, default: () => [] },
    },
    emits: ['node-selected'],
    setup(_: unknown, { emit }: { emit: (event: 'node-selected', conceptId: number) => void }) {
      function selectConcept(conceptId: number) {
        emit('node-selected', conceptId)
      }

      return { selectConcept }
    },
    template: `
      <section data-testid="knowledge-graph-renderer-stub">
        <p>graph renderer</p>
        <button type="button" data-testid="select-concept-10" @click="selectConcept(10)">select concept</button>
      </section>
    `,
  },
}))

vi.mock('@/features/knowledge/queries/useKnowledgeGraphQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/knowledge/queries/useKnowledgeGraphQuery')>()

  return {
    ...actual,
    useOwnKnowledgeGraphQuery: useOwnKnowledgeGraphQueryMock,
    usePublicUserKnowledgeGraphQuery: usePublicUserKnowledgeGraphQueryMock,
  }
})

vi.mock('@/features/knowledge/queries/useKnowledgeGraphInsightsQuery', () => ({
  useOwnKnowledgeGraphInsightsQuery: vi.fn(() => insightsHarness.query),
}))

vi.mock('@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation')>()

  return {
    ...actual,
    useRebuildKnowledgeGraphMutation: useRebuildKnowledgeGraphMutationMock,
  }
})

vi.mock('@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation')>()

  return {
    ...actual,
    useSaveKnowledgeGraphLayoutMutation: useSaveKnowledgeGraphLayoutMutationMock,
    useResetKnowledgeGraphLayoutMutation: useResetKnowledgeGraphLayoutMutationMock,
  }
})

const GRAPH_USER_ID = '11111111-1111-4111-8111-111111111111'
const PUBLIC_USER_ID = '22222222-2222-4222-8222-222222222222'

const FORBIDDEN_BOUNDARY_TERMS = [
  'expert',
  'matching',
  'matchmaking',
  'overlap',
  'admin',
  'editor',
  'manual',
  'merge',
  'split',
  'vector',
  'embedding',
  'эксперт',
  'сопостав',
  'админ',
  'редакт',
  'ручн',
]

const FORBIDDEN_NAMED_LAYOUT_TERMS = [
  'layout-name',
  'layoutname',
  'saved-layouts',
  'layouts/',
  'select-layout',
  'create-layout',
  'delete-layout',
]

const FORBIDDEN_NAMED_LAYOUT_SOURCE_TERMS = FORBIDDEN_NAMED_LAYOUT_TERMS.filter(
  (term) => term !== 'layoutname',
)

const SOURCE_FILES_UNDER_CONTRACT = [
  '../api/knowledgeGraph.ts',
  '../queries/useKnowledgeGraphQuery.ts',
  '../mutations/useRebuildKnowledgeGraphMutation.ts',
  '../mutations/useKnowledgeGraphLayoutMutation.ts',
  '../components/ProfileKnowledgeGraphTab.vue',
  '../components/KnowledgeGraphRenderer.vue',
  '../components/KnowledgeGraphConceptDetails.vue',
  '../components/knowledgeGraphQuestionDiscovery.ts',
]

const mountedWrappers: VueWrapper[] = []

function buildGraph(overrides: Partial<UserKnowledgeGraphResponse> = {}): UserKnowledgeGraphResponse {
  const concepts: UserKnowledgeGraphResponse['concepts'] = [
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
          question_id: '33333333-3333-4333-8333-333333333333',
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
      total_weight: '1.2500',
      source_count: 2,
      activity_breakdown: [],
      related_questions: [],
    },
  ]

  const base = {
    user_id: GRAPH_USER_ID,
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
    ],
    concepts,
    ...overrides,
  }

  const nodes = overrides.nodes ?? base.concepts.map((concept) => ({ ...concept }))
  const edges = overrides.edges ?? [
    {
      id: '10-11',
      source_concept_id: 10,
      target_concept_id: 11,
      weight: '1.0000',
      shared_question_count: 1,
      reason: 'shared_question' as const,
      related_questions: concepts[0].related_questions,
    },
  ]

  return {
    ...base,
    nodes,
    edges,
  }
}

function expectNoForbiddenBoundaryTerms(value: string) {
  const normalized = value.toLowerCase()
  const leakedTerms = FORBIDDEN_BOUNDARY_TERMS.filter((term) => normalized.includes(term))

  expect(leakedTerms).toEqual([])
}

function expectNoForbiddenNamedLayoutTerms(value: string) {
  const normalized = value.toLowerCase()
  const leakedTerms = FORBIDDEN_NAMED_LAYOUT_TERMS.filter((term) => normalized.includes(term))

  expect(leakedTerms).toEqual([])
}

function setQueryState(overrides: Partial<typeof queryHarness.state> = {}) {
  queryHarness.state.data = undefined
  queryHarness.state.isPending = false
  queryHarness.state.isError = false
  queryHarness.state.refetch.mockReset()
  queryHarness.state.refetch.mockResolvedValue(undefined)
  insightsHarness.state.data = {
    user_id: GRAPH_USER_ID,
    viewer: { is_owner: true },
    state: {
      status: 'fresh',
      stale_reason: '',
      last_failed_phase: '',
      last_rebuild_started_at: null,
      last_rebuild_finished_at: null,
    },
    summary: { concept_count: 0, recommendation_count: 0, states: {} },
    concepts: [],
  }
  insightsHarness.state.isPending = false
  insightsHarness.state.isError = false

  Object.assign(queryHarness.state, overrides)
}

function setMutationState() {
  mutationHarness.mutation.isPending.value = false
  mutationHarness.mutation.mutateAsync.mockReset()
  mutationHarness.mutation.mutateAsync.mockResolvedValue({})
}

async function mountTab(props: { userId?: string } = {}) {
  const wrapper = mount(ProfileKnowledgeGraphTab, {
    props,
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a><slot /></a>',
        },
      },
    },
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return wrapper
}

describe('knowledge graph frontend boundary contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setQueryState()
    setMutationState()
    httpMock.get.mockResolvedValue({ data: buildGraph() })
    httpMock.post.mockResolvedValue({
      data: {
        user_id: GRAPH_USER_ID,
        processed_questions: 2,
        processed_activity_sources: 3,
        structural_summary: { nodes: 2, edges: 1 },
        activity_summary: { authored_answer: 3 },
        state: buildGraph().state,
      },
    })
    httpMock.put.mockResolvedValue({
      data: { schema_version: 1, positions: { 10: { x: 1, y: 2 } }, updated_at: '2026-05-11T12:00:00Z' },
    })
    httpMock.delete.mockResolvedValue({
      data: { schema_version: 1, positions: {}, updated_at: null },
    })
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('calls only visualization knowledge graph read, rebuild, and owner layout endpoints', async () => {
    await fetchOwnKnowledgeGraph()
    await fetchPublicUserKnowledgeGraph(PUBLIC_USER_ID)
    await rebuildOwnKnowledgeGraph()
    await saveOwnKnowledgeGraphLayout({ schema_version: 1, positions: { 10: { x: 1, y: 2 } } })
    await resetOwnKnowledgeGraphLayout()

    expect(httpMock.get).toHaveBeenNthCalledWith(1, '/knowledge-graph/me/')
    expect(httpMock.get).toHaveBeenNthCalledWith(2, `/knowledge-graph/users/${PUBLIC_USER_ID}/`)
    expect(httpMock.post).toHaveBeenCalledExactlyOnceWith('/knowledge-graph/me/rebuild/')
    expect(httpMock.put).toHaveBeenCalledExactlyOnceWith('/knowledge-graph/me/layout/', {
      schema_version: 1,
      positions: { 10: { x: 1, y: 2 } },
    })
    expect(httpMock.delete).toHaveBeenCalledExactlyOnceWith('/knowledge-graph/me/layout/')

    const calledUrls = [
      ...httpMock.get.mock.calls.map(([url]) => String(url)),
      ...httpMock.post.mock.calls.map(([url]) => String(url)),
      ...httpMock.put.mock.calls.map(([url]) => String(url)),
      ...httpMock.delete.mock.calls.map(([url]) => String(url)),
    ]

    expect(calledUrls).toEqual([
      '/knowledge-graph/me/',
      `/knowledge-graph/users/${PUBLIC_USER_ID}/`,
      '/knowledge-graph/me/rebuild/',
      '/knowledge-graph/me/layout/',
      '/knowledge-graph/me/layout/',
    ])
    calledUrls.forEach(expectNoForbiddenBoundaryTerms)
    calledUrls.forEach(expectNoForbiddenNamedLayoutTerms)

    const layoutRequestBodies = httpMock.put.mock.calls.map(([, body]) => JSON.stringify(body))
    layoutRequestBodies.forEach(expectNoForbiddenNamedLayoutTerms)
  })

  it('keeps query keys and rebuild invalidation scoped to the graph namespace', async () => {
    expect(knowledgeGraphQueryKeys.all).toEqual(['knowledge-graph'])
    expect(knowledgeGraphQueryKeys.own()).toEqual(['knowledge-graph', 'me'])
    expect(knowledgeGraphQueryKeys.publicUser(PUBLIC_USER_ID)).toEqual(['knowledge-graph', 'users', PUBLIC_USER_ID])
    expect(buildKnowledgeGraphQueryKey()).toEqual(['knowledge-graph', 'me'])
    expect(buildKnowledgeGraphQueryKey(`  ${PUBLIC_USER_ID}  `)).toEqual(['knowledge-graph', 'users', PUBLIC_USER_ID])

    const options = buildRebuildKnowledgeGraphMutationOptions()

    expect(options.mutationFn).toBe(rebuildOwnKnowledgeGraph)
    await options.onSuccess()

    const saveOptions = buildSaveKnowledgeGraphLayoutMutationOptions()
    const resetOptions = buildResetKnowledgeGraphLayoutMutationOptions()

    expect(saveOptions.mutationFn).toBe(saveOwnKnowledgeGraphLayout)
    expect(resetOptions.mutationFn).toBe(resetOwnKnowledgeGraphLayout)
    await saveOptions.onSuccess()
    await resetOptions.onSuccess()

    expect(queryClientMock.invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['knowledge-graph'],
    })
    expect(queryClientMock.invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['knowledge-graph', 'me'],
    })
    expect(queryClientMock.invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: ['knowledge-graph', 'me'],
    })
    queryClientMock.invalidateQueries.mock.calls
      .map(([args]) => JSON.stringify(args))
      .forEach(expectNoForbiddenBoundaryTerms)
    queryClientMock.invalidateQueries.mock.calls
      .map(([args]) => JSON.stringify(args))
      .forEach(expectNoForbiddenNamedLayoutTerms)
  })

  it('renders owner graph/list/rebuild/detail affordances with graph controls but without matching or editor controls', async () => {
    setQueryState({ data: buildGraph() })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').text()).toBe('Граф')
    expect(wrapper.get('[data-testid="knowledge-view-mode-list"]').text()).toBe('Список')
    expect(wrapper.get('[data-testid="knowledge-rebuild-button"]').text()).toBe('Перестроить граф')
    expect(wrapper.get('[data-testid="knowledge-graph-renderer-stub"]').text()).toContain('graph renderer')
    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')

    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('Vue')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Связанные вопросы')
    expectNoForbiddenBoundaryTerms(wrapper.text())
    expectNoForbiddenNamedLayoutTerms(wrapper.text())
    expect(wrapper.find('button[data-testid*="admin" i]').exists()).toBe(false)
    expect(wrapper.find('button[data-testid*="editor" i]').exists()).toBe(false)
    expect(wrapper.find('button[data-testid*="manual" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="layout-name" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="saved-layout" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="select-layout" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="create-layout" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="delete-layout" i]').exists()).toBe(false)
  })

  it('keeps public graph mode read-only without rebuild, admin, matching, or editor affordances', async () => {
    setQueryState({ data: buildGraph({ viewer: { is_owner: false } }) })

    const wrapper = await mountTab({ userId: `  ${PUBLIC_USER_ID}  ` })

    expect(usePublicUserKnowledgeGraphQueryMock).toHaveBeenCalledOnce()
    const userIdArg = usePublicUserKnowledgeGraphQueryMock.mock.calls[0][0]
    expect(computed(() => userIdArg.value).value).toBe(PUBLIC_USER_ID)
    expect(wrapper.get('[data-testid="knowledge-view-mode-graph"]').text()).toBe('Граф')
    expect(wrapper.get('[data-testid="knowledge-view-mode-list"]').text()).toBe('Список')
    expect(wrapper.get('[data-testid="knowledge-public-readonly"]').text()).toContain('Публичный просмотр')
    expect(wrapper.find('[data-testid="knowledge-rebuild-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="knowledge-recommendations"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="knowledge-recommendation-card-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="knowledge-recommendation-action-"]').exists()).toBe(false)

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')
    expect(wrapper.find('[data-testid="knowledge-rebuild-button"]').exists()).toBe(false)
    expectNoForbiddenBoundaryTerms(wrapper.text())
    expectNoForbiddenNamedLayoutTerms(wrapper.text())
    expect(wrapper.find('button[data-testid*="admin" i]').exists()).toBe(false)
    expect(wrapper.find('button[data-testid*="editor" i]').exists()).toBe(false)
    expect(wrapper.find('button[data-testid*="manual" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="layout-name" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="saved-layout" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="select-layout" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="create-layout" i]').exists()).toBe(false)
    expect(wrapper.find('[data-testid*="delete-layout" i]').exists()).toBe(false)
  })

  it('keeps explicit knowledge graph frontend source free of future-scope endpoint and control labels', () => {
    const leaks = SOURCE_FILES_UNDER_CONTRACT.flatMap((relativePath) => {
      const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url))
      const source = readFileSync(sourcePath, 'utf8').toLowerCase()

      return FORBIDDEN_BOUNDARY_TERMS
        .filter((term) => source.includes(term))
        .map((term) => `${relativePath}: ${term}`)
    })

    expect(leaks).toEqual([])
  })

  it('keeps explicit knowledge graph frontend source free of named saved layout endpoints and controls', () => {
    const leaks = SOURCE_FILES_UNDER_CONTRACT.flatMap((relativePath) => {
      const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url))
      const source = readFileSync(sourcePath, 'utf8').toLowerCase()

      return FORBIDDEN_NAMED_LAYOUT_SOURCE_TERMS
        .filter((term) => source.includes(term))
        .map((term) => `${relativePath}: ${term}`)
    })

    expect(leaks).toEqual([])
  })
})
