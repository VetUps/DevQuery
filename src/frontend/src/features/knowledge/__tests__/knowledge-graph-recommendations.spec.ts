import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { UserKnowledgeGraphInsightsResponse, UserKnowledgeGraphResponse } from '@/features/knowledge/api/knowledgeGraph'
import ProfileKnowledgeGraphTab from '@/features/knowledge/components/ProfileKnowledgeGraphTab.vue'

const queryHarness = vi.hoisted(() => {
  const state = {
    data: undefined as UserKnowledgeGraphResponse | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }

  const query = {
    data: { get value() { return state.data } },
    isPending: { get value() { return state.isPending } },
    isError: { get value() { return state.isError } },
    refetch: state.refetch,
  }

  return { state, query }
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

vi.mock('@/features/knowledge/components/KnowledgeGraphRenderer.vue', () => ({
  default: {
    name: 'KnowledgeGraphRecommendationsRendererStub',
    props: {
      nodes: { type: Array, required: true },
      edges: { type: Array, required: true },
      selectedConceptId: { type: Number, default: null },
      neighbourConceptIds: { type: Array, default: () => [] },
      neighbourEdgeIds: { type: Array, default: () => [] },
      layoutPositions: { type: Object, default: () => ({}) },
      conceptStates: { type: Object, default: () => ({}) },
      isOwner: { type: Boolean, default: false },
      isLayoutDirty: { type: Boolean, default: false },
      isLayoutSaving: { type: Boolean, default: false },
      isLayoutResetting: { type: Boolean, default: false },
    },
    emits: ['node-selected'],
    setup(_: unknown, { emit }: { emit: (event: 'node-selected', conceptId: number) => void }) {
      function selectConcept() {
        emit('node-selected', 10)
      }

      return { selectConcept }
    },
    template: `
      <section data-testid="knowledge-graph-renderer-stub">
        graph renderer
        <button type="button" data-testid="select-concept-10" @click="selectConcept">select</button>
      </section>
    `,
  },
}))

vi.mock('@/features/knowledge/queries/useKnowledgeGraphQuery', () => ({
  useOwnKnowledgeGraphQuery: vi.fn(() => queryHarness.query),
  usePublicUserKnowledgeGraphQuery: vi.fn(() => queryHarness.query),
}))

vi.mock('@/features/knowledge/queries/useKnowledgeGraphInsightsQuery', () => ({
  useOwnKnowledgeGraphInsightsQuery: vi.fn(() => insightsHarness.query),
}))

vi.mock('@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation', () => ({
  useRebuildKnowledgeGraphMutation: vi.fn(() => mutationHarness.mutation),
}))

vi.mock('@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation', () => ({
  useSaveKnowledgeGraphLayoutMutation: vi.fn(() => mutationHarness.mutation),
  useResetKnowledgeGraphLayoutMutation: vi.fn(() => mutationHarness.mutation),
}))

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
      activity_breakdown: [{ activity_type: 'authored_answer', total_weight: '2.0000', source_count: 3 }],
      related_questions: [{ question_id: '33333333-3333-4333-8333-333333333333', title: 'Как построить граф?', status: 'open' }],
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
    activity_breakdown: [{ activity_type: 'authored_answer', total_weight: '2.0000', source_count: 3 }],
    concepts,
    ...overrides,
  }

  return {
    ...base,
    nodes: overrides.nodes ?? concepts.map((concept) => ({ ...concept })),
    edges: overrides.edges ?? [{
      id: '10-11',
      source_concept_id: 10,
      target_concept_id: 11,
      weight: '1.0000',
      shared_question_count: 1,
      reason: 'shared_question',
      related_questions: concepts[0].related_questions,
    }],
  }
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
    summary: { concept_count: 2, recommendation_count: 2, states: { weak: 1, growing: 1 } },
    recommendations: [],
    concepts: [
      {
        concept_id: 10,
        slug: 'django',
        name: 'Django',
        total_weight: '2.5000',
        source_count: 5,
        related_question_count: 1,
        semantic_state: 'weak',
        tone_token: 'warning',
        recommendations: [
          {
            id: 'rec-django-practice',
            priority: 'high',
            label: 'Разберите один практический вопрос по Django.',
            reason_code: 'weak_concept_needs_practice',
            action: {
              type: 'answer_question',
              payload: {
                source_object_id: 'raw-source-id-should-not-render',
                email: 'owner@example.com',
                token: 'secret-token',
                traceback: 'Traceback provider diagnostics',
              },
            },
          },
        ],
      },
      {
        concept_id: 11,
        slug: 'vue',
        name: 'Vue',
        total_weight: '1.2500',
        source_count: 2,
        related_question_count: 0,
        semantic_state: 'growing',
        tone_token: 'success',
        recommendations: [
          {
            id: 'rec-vue-related',
            priority: 'medium',
            label: 'Сравните несколько связанных вопросов по Vue.',
            reason_code: 'growing_concept_has_momentum',
            action: { type: 'review_related_questions', payload: { source_object_id: 'another-hidden-id' } },
          },
        ],
      },
    ],
    ...overrides,
  }
}

function setState({
  graph = buildGraph(),
  insights = buildInsights(),
  graphError = false,
  insightsPending = false,
  insightsError = false,
}: {
  graph?: UserKnowledgeGraphResponse
  insights?: UserKnowledgeGraphInsightsResponse | null
  graphError?: boolean
  insightsPending?: boolean
  insightsError?: boolean
} = {}) {
  queryHarness.state.data = graph
  queryHarness.state.isPending = false
  queryHarness.state.isError = graphError
  queryHarness.state.refetch.mockReset()
  insightsHarness.state.data = insights === null ? undefined : insights
  insightsHarness.state.isPending = insightsPending
  insightsHarness.state.isError = insightsError
  mutationHarness.mutation.isPending.value = false
  mutationHarness.mutation.mutateAsync.mockReset()
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

describe('knowledge graph recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setState()
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('renders private owner recommendation cards with safe action and reason copy while preserving graph affordances', async () => {
    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-recommendations-status"]').text()).toContain('2 рекомендации')
    expect(wrapper.get('[data-testid="knowledge-recommendation-card-rec-django-practice"]').text()).toContain('Django')
    expect(wrapper.get('[data-testid="knowledge-recommendation-card-rec-django-practice"]').text()).toContain('Слабый')
    expect(wrapper.get('[data-testid="knowledge-recommendation-card-rec-django-practice"]').text()).toContain('Ответить на вопрос')
    expect(wrapper.get('[data-testid="knowledge-recommendation-card-rec-django-practice"]').text()).toContain('Высокий приоритет')
    expect(wrapper.get('[data-testid="knowledge-recommendation-card-rec-django-practice"]').text()).toContain('Тема выглядит слабой')
    expect(wrapper.get('[data-testid="knowledge-recommendation-card-rec-vue-related"]').text()).toContain('Разобрать связанные вопросы')
    const djangoAction = wrapper.get('[data-testid="knowledge-recommendation-action-rec-django-practice"]')
    expect(djangoAction.text()).toContain('Открыть вопросы')
    expect(djangoAction.attributes('data-route-name')).toBe('home')
    expect(JSON.parse(djangoAction.attributes('data-route-query') ?? '{}')).toEqual({ tag: ['django'] })
    const vueAction = wrapper.get('[data-testid="knowledge-recommendation-action-rec-vue-related"]')
    expect(JSON.parse(vueAction.attributes('data-route-query') ?? '{}')).toEqual({ tag: ['vue'] })
    expect(wrapper.get('[data-testid="knowledge-graph-renderer-stub"]').text()).toContain('graph renderer')

    await wrapper.get('[data-testid="select-concept-10"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')
    expect(wrapper.text()).not.toContain('raw-source-id-should-not-render')
    expect(wrapper.text()).not.toContain('owner@example.com')
    expect(wrapper.text()).not.toContain('secret-token')
    expect(wrapper.text()).not.toContain('Traceback provider diagnostics')
    expect(wrapper.text()).not.toContain('{')
  })

  it('hides recommendation cards on public profiles and before owner insights are available', async () => {
    setState({ graph: buildGraph({ viewer: { is_owner: false } }) })
    const publicWrapper = await mountTab({ userId: '22222222-2222-4222-8222-222222222222' })

    expect(publicWrapper.find('[data-testid="knowledge-recommendations"]').exists()).toBe(false)
    expect(publicWrapper.find('[data-testid^="knowledge-recommendation-action-"]').exists()).toBe(false)
    publicWrapper.unmount()

    setState({ insights: null, insightsPending: true })
    const pendingWrapper = await mountTab()

    expect(pendingWrapper.get('[data-testid="knowledge-recommendations-status"]').text()).toContain('Загружаем приватные рекомендации')
    expect(pendingWrapper.find('[data-testid^="knowledge-recommendation-card-"]').exists()).toBe(false)
    expect(pendingWrapper.find('[data-testid^="knowledge-recommendation-action-"]').exists()).toBe(false)
  })

  it('shows safe degraded copy when insights fail and keeps graph and list inspectable', async () => {
    setState({ insightsError: true })
    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-recommendations-status"]').text()).toContain('Рекомендации временно недоступны')
    expect(wrapper.find('[data-testid^="knowledge-recommendation-card-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="knowledge-recommendation-action-"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="knowledge-graph-renderer-stub"]').text()).toContain('graph renderer')

    await wrapper.get('[data-testid="knowledge-view-mode-list"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="knowledge-list-panel"]').text()).toContain('Django')
    expect(wrapper.text()).not.toContain('Traceback')
    expect(wrapper.text()).not.toContain('provider diagnostics')
  })

  it('renders an owner-only empty state when insights contain no recommendations', async () => {
    setState({
      insights: buildInsights({
        summary: { concept_count: 2, recommendation_count: 0, states: { strong: 2 } },
        concepts: buildInsights().concepts.map((concept) => ({ ...concept, recommendations: [] })),
      }),
    })

    const wrapper = await mountTab()

    expect(wrapper.get('[data-testid="knowledge-recommendations-count"]').text()).toBe('0 рекомендаций')
    expect(wrapper.get('[data-testid="knowledge-recommendations-empty"]').text()).toContain('Новых рекомендаций')
    expect(wrapper.find('[data-testid^="knowledge-recommendation-card-"]').exists()).toBe(false)
  })
})
