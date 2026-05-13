import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/query-client'
import { http } from '@/shared/api/http'
import {
  KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES,
  MalformedKnowledgeGraphResponseError,
  fetchOwnKnowledgeGraph,
  fetchOwnKnowledgeGraphInsights,
  fetchPublicUserKnowledgeGraph,
  parseKnowledgeGraphRebuildErrorResponse,
  parseKnowledgeGraphRebuildResponse,
  parseKnowledgeGraphLayout,
  parseUserKnowledgeGraphInsightsResponse,
  parseUserKnowledgeGraphResponse,
  rebuildOwnKnowledgeGraph,
  resetOwnKnowledgeGraphLayout,
  saveOwnKnowledgeGraphLayout,
  type KnowledgeGraphRebuildResponse,
  type UserKnowledgeGraphInsightsResponse,
  type UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import {
  buildKnowledgeGraphQueryKey,
  knowledgeGraphQueryKeys,
} from '@/features/knowledge/queries/useKnowledgeGraphQuery'
import { knowledgeGraphInsightsQueryKeys } from '@/features/knowledge/queries/useKnowledgeGraphInsightsQuery'
import { buildRebuildKnowledgeGraphMutationOptions } from '@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation'
import {
  buildResetKnowledgeGraphLayoutMutationOptions,
  buildSaveKnowledgeGraphLayoutMutationOptions,
} from '@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation'
import { resolveKnowledgeGraphRecommendationPresentation } from '@/features/knowledge/components/knowledgeGraphRecommendationPresentation'

vi.mock('@/shared/api/http', () => ({
  http: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const mockedHttp = vi.mocked(http)

const graphPayload = (overrides: Record<string, unknown> = {}) => ({
  user_id: '11111111-1111-4111-8111-111111111111',
  viewer: { is_owner: true },
  state: {
    status: 'failed',
    stale_reason: 'activity_sync_failed',
    last_error_message: 'Graph activity sync failed during question_authoring.',
    last_failed_phase: 'question_authoring',
    last_rebuild_started_at: null,
    last_rebuild_finished_at: '2026-05-06T12:00:00Z',
  },
  total_weight: '1.7500',
  activity_breakdown: [
    { activity_type: 'authored_question', total_weight: '1.0000', source_count: 1 },
  ],
  concepts: [
    {
      concept_id: 10,
      slug: 'django',
      name: 'Django',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '1.0000',
      total_weight: '1.2500',
      source_count: 2,
      activity_breakdown: [
        { activity_type: 'question_upvote', total_weight: '0.2500', source_count: 1 },
      ],
      related_questions: [
        {
          question_id: '22222222-2222-4222-8222-222222222222',
          title: 'How do I expose a graph safely?',
          status: 'open',
        },
      ],
      source_object_id: 'private-source-id',
      raw_events: [{ id: 'event-1' }],
    },
  ],
  nodes: [
    {
      concept_id: 10,
      slug: 'django',
      name: 'Django',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '1.0000',
      total_weight: '1.2500',
      source_count: 2,
      activity_breakdown: [
        { activity_type: 'question_upvote', total_weight: '0.2500', source_count: 1 },
      ],
      related_questions: [
        {
          question_id: '22222222-2222-4222-8222-222222222222',
          title: 'How do I expose a graph safely?',
          status: 'open',
        },
      ],
      source_object_id: 'private-source-id',
    },
    {
      concept_id: 20,
      slug: 'vue',
      name: 'Vue',
      source: 'tag',
      provider: 'tag-sync',
      confidence: '0.8000',
      total_weight: '0.5000',
      source_count: 1,
      activity_breakdown: [],
      related_questions: [],
    },
  ],
  edges: [
    {
      id: '10:20:shared_question',
      source_concept_id: 10,
      target_concept_id: 20,
      weight: '2.0000',
      shared_question_count: 2,
      reason: 'shared_question',
      related_questions: [
        {
          question_id: '33333333-3333-4333-8333-333333333333',
          title: 'How should graph edges be rendered?',
          status: 'answered',
        },
      ],
      raw_activity_sources: ['private-source-id'],
    },
  ],
  user_email: 'graph-owner@example.com',
  raw_exception: 'Traceback provider token leaked',
  ...overrides,
})

const layoutPayload = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  positions: {
    10: { x: 120.5, y: -40.25 },
    20: { x: 300, y: 80 },
  },
  updated_at: '2026-05-11T12:00:00Z',
  raw_exception: 'Traceback provider token leaked',
  ...overrides,
})

const rebuildPayload = (overrides: Partial<KnowledgeGraphRebuildResponse> = {}) => ({
  user_id: '11111111-1111-4111-8111-111111111111',
  processed_questions: 3,
  processed_activity_sources: 7,
  structural_summary: {
    processed: 3,
    created_concepts: 1,
    updated_concepts: 2,
  },
  activity_summary: {
    processed_sources: 7,
    authored_question: 3,
  },
  state: graphPayload().state,
  ...overrides,
})

const insightConcept = (overrides: Record<string, unknown> = {}) => ({
  concept_id: 10,
  slug: 'django',
  name: 'Django',
  total_weight: '3.2500',
  source_count: 3,
  related_question_count: 4,
  semantic_state: 'strong',
  tone_token: 'confident',
  recommendations: [
    {
      id: 'strong:10:practice_foundation',
      priority: 'low',
      label: 'Maintain strong Django coverage',
      reason_code: 'strong_concept_maintenance',
      action: {
        type: 'practice_foundation',
        payload: {
          query: 'Django',
          tag: 'django',
          search: 'Django',
          order: 'relevance',
          page: 1,
        },
      },
      color: '#00ff00',
      private_reason_trace: 'backend-owned diagnostic',
    },
  ],
  color: '#00ff00',
  provider_diagnostics: { raw: 'private' },
  ...overrides,
})

const insightsPayload = (overrides: Record<string, unknown> = {}) => ({
  user_id: '11111111-1111-4111-8111-111111111111',
  viewer: { is_owner: true },
  state: {
    status: 'ready',
    stale_reason: '',
    last_failed_phase: '',
    last_rebuild_started_at: null,
    last_rebuild_finished_at: '2026-05-06T12:00:00Z',
  },
  summary: {
    concept_count: 5,
    recommendation_count: 5,
    states: {
      strong: 1,
      growing: 1,
      weak: 1,
      stale: 1,
      isolated: 1,
    },
  },
  concepts: [
    insightConcept({ semantic_state: 'strong', tone_token: 'confident' }),
    insightConcept({ concept_id: 20, slug: 'vue', name: 'Vue', semantic_state: 'growing', tone_token: 'momentum' }),
    insightConcept({ concept_id: 30, slug: 'sql', name: 'SQL', semantic_state: 'weak', tone_token: 'needs_practice' }),
    insightConcept({ concept_id: 40, slug: 'redis', name: 'Redis', semantic_state: 'stale', tone_token: 'refresh' }),
    insightConcept({ concept_id: 50, slug: 'docker', name: 'Docker', semantic_state: 'isolated', tone_token: 'connect' }),
  ],
  raw_exception: 'Traceback provider token leaked',
  ...overrides,
})

describe('knowledge graph API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('parses aggregate graph DTOs while preserving decimal strings and dropping private extras', () => {
    const parsed = parseUserKnowledgeGraphResponse(graphPayload())

    expect(parsed).toEqual<UserKnowledgeGraphResponse>({
      user_id: '11111111-1111-4111-8111-111111111111',
      viewer: { is_owner: true },
      state: {
        status: 'failed',
        stale_reason: 'activity_sync_failed',
        last_error_message: 'Graph activity sync failed during question_authoring.',
        last_failed_phase: 'question_authoring',
        last_rebuild_started_at: null,
        last_rebuild_finished_at: '2026-05-06T12:00:00Z',
      },
      total_weight: '1.7500',
      activity_breakdown: [
        { activity_type: 'authored_question', total_weight: '1.0000', source_count: 1 },
      ],
      concepts: [
        {
          concept_id: 10,
          slug: 'django',
          name: 'Django',
          source: 'tag',
          provider: 'tag-sync',
          confidence: '1.0000',
          total_weight: '1.2500',
          source_count: 2,
          activity_breakdown: [
            { activity_type: 'question_upvote', total_weight: '0.2500', source_count: 1 },
          ],
          related_questions: [
            {
              question_id: '22222222-2222-4222-8222-222222222222',
              title: 'How do I expose a graph safely?',
              status: 'open',
            },
          ],
        },
      ],
      nodes: [
        {
          concept_id: 10,
          slug: 'django',
          name: 'Django',
          source: 'tag',
          provider: 'tag-sync',
          confidence: '1.0000',
          total_weight: '1.2500',
          source_count: 2,
          activity_breakdown: [
            { activity_type: 'question_upvote', total_weight: '0.2500', source_count: 1 },
          ],
          related_questions: [
            {
              question_id: '22222222-2222-4222-8222-222222222222',
              title: 'How do I expose a graph safely?',
              status: 'open',
            },
          ],
        },
        {
          concept_id: 20,
          slug: 'vue',
          name: 'Vue',
          source: 'tag',
          provider: 'tag-sync',
          confidence: '0.8000',
          total_weight: '0.5000',
          source_count: 1,
          activity_breakdown: [],
          related_questions: [],
        },
      ],
      edges: [
        {
          id: '10:20:shared_question',
          source_concept_id: 10,
          target_concept_id: 20,
          weight: '2.0000',
          shared_question_count: 2,
          reason: 'shared_question',
          related_questions: [
            {
              question_id: '33333333-3333-4333-8333-333333333333',
              title: 'How should graph edges be rendered?',
              status: 'answered',
            },
          ],
        },
      ],
      semantic_edges: [],
      semantic_groups: [],
    })
    expect(parsed.nodes[0].confidence).toBe('1.0000')
    expect(parsed.edges[0].weight).toBe('2.0000')
    expect(JSON.stringify(parsed)).not.toContain('source_object_id')
    expect(JSON.stringify(parsed)).not.toContain('graph-owner@example.com')
    expect(JSON.stringify(parsed)).not.toContain('raw_exception')
  })

  it('accepts empty graph boundaries and public viewers', () => {
    expect(
      parseUserKnowledgeGraphResponse(
        graphPayload({
          viewer: { is_owner: false },
          total_weight: '0.0000',
          activity_breakdown: [],
          concepts: [],
          nodes: [],
          edges: [],
        }),
      ),
    ).toMatchObject({
      viewer: { is_owner: false },
      total_weight: '0.0000',
      activity_breakdown: [],
      concepts: [],
      nodes: [],
      edges: [],
    })
  })

  it('accepts single-node topology boundaries without edges', () => {
    expect(
      parseUserKnowledgeGraphResponse(
        graphPayload({
          nodes: [graphPayload().nodes[0]],
          edges: [],
        }),
      ),
    ).toMatchObject({
      nodes: [{ concept_id: 10 }],
      edges: [],
    })
  })

  it('rejects malformed topology DTOs with typed errors that name invalid paths', () => {
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ nodes: undefined }))).toThrow(
      /nodes/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ nodes: [{ ...graphPayload().nodes[0], concept_id: -1 }] }))).toThrow(
      /nodes\[0\]\.concept_id/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ nodes: [{ ...graphPayload().nodes[0], slug: '   ' }] }))).toThrow(
      /nodes\[0\]\.slug/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ nodes: [{ ...graphPayload().nodes[0], confidence: 'high' }] }))).toThrow(
      /nodes\[0\]\.confidence/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: undefined }))).toThrow(
      /edges/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: [{ ...graphPayload().edges[0], id: '' }] }))).toThrow(
      /edges\[0\]\.id/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: [{ ...graphPayload().edges[0], weight: 'heavy' }] }))).toThrow(
      /edges\[0\]\.weight/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: [{ ...graphPayload().edges[0], reason: 'semantic_similarity' }] }))).toThrow(
      /edges\[0\]\.reason/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: [{ ...graphPayload().edges[0], related_questions: [{ question_id: 'not-a-uuid', title: 'Bad', status: 'open' }] }] }))).toThrow(
      /edges\[0\]\.related_questions\[0\]\.question_id/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: [{ ...graphPayload().edges[0], source_concept_id: 999 }] }))).toThrow(
      /edges\[0\]\.source_concept_id/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ edges: [{ ...graphPayload().edges[0], target_concept_id: 999 }] }))).toThrow(
      /edges\[0\]\.target_concept_id/,
    )
  })

  it('rejects malformed graph DTOs with typed errors that name invalid paths', () => {
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ viewer: {} }))).toThrow(
      /viewer\.is_owner/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ total_weight: 'heavy' }))).toThrow(
      /total_weight/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ concepts: [{ ...graphPayload().concepts[0], slug: undefined }] }))).toThrow(
      /concepts\[0\]\.slug/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ activity_breakdown: [{ activity_type: 'x', total_weight: '1.0000' }] }))).toThrow(
      /activity_breakdown\[0\]\.source_count/,
    )
    expect(() => parseUserKnowledgeGraphResponse(graphPayload({ concepts: [{ ...graphPayload().concepts[0], related_questions: [{ question_id: 'not-a-uuid', title: 'Bad', status: 'open' }] }] }))).toThrow(
      /related_questions\[0\]\.question_id/,
    )
  })

  it('parses optional owner layout positions and rejects malformed layout DTOs', () => {
    const parsedLayout = parseKnowledgeGraphLayout(layoutPayload())

    expect(parseUserKnowledgeGraphResponse(graphPayload({ layout: layoutPayload() })).layout).toEqual({
      schema_version: 1,
      positions: {
        10: { x: 120.5, y: -40.25 },
        20: { x: 300, y: 80 },
      },
      updated_at: '2026-05-11T12:00:00Z',
    })
    expect(parsedLayout.positions['10']).toEqual({ x: 120.5, y: -40.25 })
    expect(Object.keys(parsedLayout)).toEqual(['schema_version', 'positions', 'updated_at'])
    expect(JSON.stringify(parsedLayout)).not.toContain('raw_exception')

    expect(() => parseKnowledgeGraphLayout(layoutPayload({ schema_version: 2 }))).toThrow(/layout\.schema_version/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ positions: { abc: { x: 1, y: 2 } } }))).toThrow(/layout\.positions\.abc/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ positions: { 10: { x: Number.NaN, y: 2 } } }))).toThrow(/layout\.positions\.10\.x/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ positions: { 10: { x: 1 } } }))).toThrow(/layout\.positions\.10\.y/)
  })

  it('rejects collection, list, and named saved-layout DTO shapes', () => {
    expect(() => parseKnowledgeGraphLayout([layoutPayload()])).toThrow(/layout/)
    expect(() => parseKnowledgeGraphLayout({ results: [layoutPayload()] })).toThrow(/layout\.positions/)
    expect(() => parseKnowledgeGraphLayout({ layouts: [layoutPayload()] })).toThrow(/layout\.layouts/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ name: 'Work layout' }))).toThrow(/layout\.name/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ layoutName: 'Work layout' }))).toThrow(/layout\.layoutName/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ saved_layouts: [layoutPayload()] }))).toThrow(/layout\.saved_layouts/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ selectedLayout: 'default' }))).toThrow(/layout\.selectedLayout/)
  })

  it('parses owner insights DTOs with semantic states and drops presentation extras', () => {
    const parsed = parseUserKnowledgeGraphInsightsResponse(insightsPayload())

    expect(parsed).toEqual<UserKnowledgeGraphInsightsResponse>({
      user_id: '11111111-1111-4111-8111-111111111111',
      viewer: { is_owner: true },
      state: {
        status: 'ready',
        stale_reason: '',
        last_failed_phase: '',
        last_rebuild_started_at: null,
        last_rebuild_finished_at: '2026-05-06T12:00:00Z',
      },
      summary: {
        concept_count: 5,
        recommendation_count: 5,
        states: {
          strong: 1,
          growing: 1,
          weak: 1,
          stale: 1,
          isolated: 1,
        },
      },
      recommendations: [],
      concepts: [
        expect.objectContaining({ semantic_state: 'strong', tone_token: 'confident' }),
        expect.objectContaining({ semantic_state: 'growing', tone_token: 'momentum' }),
        expect.objectContaining({ semantic_state: 'weak', tone_token: 'needs_practice' }),
        expect.objectContaining({ semantic_state: 'stale', tone_token: 'refresh' }),
        expect.objectContaining({ semantic_state: 'isolated', tone_token: 'connect' }),
      ] as UserKnowledgeGraphInsightsResponse['concepts'],
    })
    expect(parsed.concepts[0]?.recommendations[0]?.action.type).toBe('practice_foundation')
    expect(parsed.concepts[0]?.recommendations[0]?.action.payload).toEqual({
      query: 'Django',
      tag: 'django',
      search: 'Django',
      order: 'relevance',
      page: 1,
    })
    expect(JSON.stringify(parsed)).not.toContain('color')
    expect(JSON.stringify(parsed)).not.toContain('raw_exception')
    expect(JSON.stringify(parsed)).not.toContain('provider')
    expect(JSON.stringify(parsed)).not.toContain('private_reason_trace')
  })

  it('preserves the explicit backend recommendation action vocabulary and presents it safely', () => {
    const reasonCodes = [
      'weak_concept_needs_practice',
      'growing_concept_has_momentum',
      'strong_concept_maintenance',
      'stale_concept_needs_refresh',
      'isolated_concept_needs_connections',
    ]
    const concepts = KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES.map((actionType, index) =>
      insightConcept({
        concept_id: index + 1,
        slug: `concept-${index + 1}`,
        name: `Concept ${index + 1}`,
        recommendations: [
          {
            ...insightConcept().recommendations[0],
            id: `${index + 1}:${actionType}`,
            priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
            reason_code: reasonCodes[index],
            action: {
              type: actionType,
              payload: {
                query: `Concept ${index + 1}`,
                source_object_id: `private-${index + 1}`,
              },
            },
            color: '#00ff00',
            provider_diagnostics: { raw: 'private' },
            private_reason_trace: 'backend-owned diagnostic',
          },
        ],
      }),
    )

    const parsed = parseUserKnowledgeGraphInsightsResponse(
      insightsPayload({
        summary: {
          concept_count: concepts.length,
          recommendation_count: concepts.length,
          states: insightsPayload().summary.states,
        },
        concepts,
      }),
    )
    const parsedRecommendations = parsed.concepts.map((concept) => concept.recommendations[0])

    expect(parsedRecommendations.map((recommendation) => recommendation?.action.type)).toEqual(
      KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES,
    )

    const presentations = parsedRecommendations.map((recommendation) => {
      expect(recommendation).toBeDefined()
      return resolveKnowledgeGraphRecommendationPresentation(recommendation!)
    })

    expect(presentations.map((presentation) => presentation.actionLabel)).toEqual([
      'Разобрать связанные вопросы',
      'Ответить на вопрос',
      'Поддержать базу знаний',
      'Освежить знания',
      'Связать тему с графом',
    ])
    expect(presentations[0]).toMatchObject({
      priorityLabel: 'Высокий приоритет',
      reasonDescription: 'Тема выглядит слабой и требует дополнительной практики.',
    })
    expect(JSON.stringify(presentations)).not.toContain('source_object_id')
    expect(JSON.stringify(presentations)).not.toContain('private-')
    expect(JSON.stringify(presentations)).not.toContain('query')
  })

  it('accepts insight concepts with empty recommendation lists', () => {
    expect(
      parseUserKnowledgeGraphInsightsResponse(
        insightsPayload({
          summary: {
            ...insightsPayload().summary,
            recommendation_count: 0,
          },
          concepts: [insightConcept({ recommendations: [] })],
        }),
      ).concepts[0]?.recommendations,
    ).toEqual([])
  })

  it('accepts empty owner insights concepts with required summary state counts', () => {
    expect(
      parseUserKnowledgeGraphInsightsResponse(
        insightsPayload({
          summary: {
            concept_count: 0,
            recommendation_count: 0,
            states: {
              strong: 0,
              growing: 0,
              weak: 0,
              stale: 0,
              isolated: 0,
            },
          },
          concepts: [],
        }),
      ),
    ).toMatchObject({
      summary: { concept_count: 0, recommendation_count: 0 },
      concepts: [],
    })
  })

  it('rejects malformed owner insights DTOs with typed errors that name invalid paths', () => {
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ summary: { concept_count: 1, recommendation_count: 1 } }))).toThrow(
      /summary\.states/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ summary: { ...insightsPayload().summary, states: { strong: -1 } } }))).toThrow(
      /summary\.states\.strong/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ semantic_state: 7 })] }))).toThrow(
      /concepts\[0\]\.semantic_state/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ tone_token: null })] }))).toThrow(
      /concepts\[0\]\.tone_token/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ recommendations: [{ id: 'x', priority: 'high', label: 'Bad', reason_code: 'bad' }] })] }))).toThrow(
      /concepts\[0\]\.recommendations\[0\]\.action/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ recommendations: [{ id: 'x', priority: 'high', label: 'Bad', reason_code: 'bad', action: { type: 'x', payload: [] } }] })] }))).toThrow(
      /concepts\[0\]\.recommendations\[0\]\.action\.type/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ recommendations: [{ id: 'x', priority: 'high', label: 'Bad', reason_code: 'bad', action: { type: '', payload: {} } }] })] }))).toThrow(
      /concepts\[0\]\.recommendations\[0\]\.action\.type/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ recommendations: [{ id: 'x', priority: 'high', label: 'Bad', reason_code: 'bad', action: { type: 'expert_match', payload: {} } }] })] }))).toThrow(
      /concepts\[0\]\.recommendations\[0\]\.action\.type/,
    )
    expect(() => parseUserKnowledgeGraphInsightsResponse(insightsPayload({ concepts: [insightConcept({ recommendations: [{ id: 'x', priority: 'high', label: 'Bad', reason_code: 'bad', action: { type: 'review_related_questions', payload: [] } }] })] }))).toThrow(
      /concepts\[0\]\.recommendations\[0\]\.action\.payload/,
    )
  })

  it('fetches owner insights through the owner-only endpoint and strict parser', async () => {
    mockedHttp.get.mockResolvedValueOnce({ data: insightsPayload() })

    await expect(fetchOwnKnowledgeGraphInsights()).resolves.toMatchObject({
      viewer: { is_owner: true },
      concepts: expect.arrayContaining([expect.objectContaining({ semantic_state: 'strong' })]),
    })

    expect(mockedHttp.get).toHaveBeenCalledWith('/knowledge-graph/me/insights/')
  })

  it('builds a distinct owner insights query key without adding a public insights key', () => {
    expect(knowledgeGraphInsightsQueryKeys.own()).toEqual(['knowledge-graph', 'me', 'insights'])
    expect(Object.keys(knowledgeGraphInsightsQueryKeys)).not.toContain('publicUser')
  })

  it('fetches own and public graph endpoints through strict parsers', async () => {
    mockedHttp.get.mockResolvedValueOnce({ data: graphPayload() })
    mockedHttp.get.mockResolvedValueOnce({ data: graphPayload({ viewer: { is_owner: false } }) })

    await expect(fetchOwnKnowledgeGraph()).resolves.toMatchObject({ viewer: { is_owner: true } })
    await expect(fetchPublicUserKnowledgeGraph('user-123')).resolves.toMatchObject({ viewer: { is_owner: false } })

    expect(mockedHttp.get).toHaveBeenNthCalledWith(1, '/knowledge-graph/me/')
    expect(mockedHttp.get).toHaveBeenNthCalledWith(2, '/knowledge-graph/users/user-123/')
  })

  it('parses rebuild success and safe error DTOs and rejects unexpected error shapes', async () => {
    expect(parseKnowledgeGraphRebuildResponse(rebuildPayload())).toMatchObject({
      processed_questions: 3,
      processed_activity_sources: 7,
      state: { status: 'failed' },
    })
    expect(
      parseKnowledgeGraphRebuildErrorResponse({
        error: { code: 'rebuild_failed', message: 'Не удалось перестроить граф.' },
        state: graphPayload().state,
      }),
    ).toEqual({
      error: { code: 'rebuild_failed', message: 'Не удалось перестроить граф.' },
      state: graphPayload().state,
    })
    expect(() => parseKnowledgeGraphRebuildErrorResponse({ detail: 'Traceback raw internals' })).toThrow(
      MalformedKnowledgeGraphResponseError,
    )

    mockedHttp.post.mockResolvedValue({ data: rebuildPayload() })
    await expect(rebuildOwnKnowledgeGraph()).resolves.toMatchObject({ processed_questions: 3 })
    expect(mockedHttp.post).toHaveBeenCalledWith('/knowledge-graph/me/rebuild/')
  })

  it('exposes spoof-resistant rebuild mutation and invalidates all graph query variants on success', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
    mockedHttp.post.mockResolvedValue({ data: rebuildPayload() })

    const mutationOptions = buildRebuildKnowledgeGraphMutationOptions()

    await expect(mutationOptions.mutationFn()).resolves.toMatchObject({ processed_questions: 3 })
    await mutationOptions.onSuccess()

    expect(mockedHttp.post).toHaveBeenCalledWith('/knowledge-graph/me/rebuild/')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: knowledgeGraphQueryKeys.all })
  })

  it('saves and resets owner graph layout through owner-only endpoints', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
    const request = {
      schema_version: 1 as const,
      positions: {
        10: { x: 120.5, y: -40.25 },
      },
    }
    mockedHttp.put.mockResolvedValueOnce({ data: layoutPayload({ positions: request.positions }) })
    mockedHttp.delete.mockResolvedValueOnce({ data: layoutPayload({ positions: {}, updated_at: null }) })

    await expect(saveOwnKnowledgeGraphLayout(request)).resolves.toMatchObject({ positions: request.positions })
    await expect(resetOwnKnowledgeGraphLayout()).resolves.toMatchObject({ positions: {}, updated_at: null })

    expect(mockedHttp.put).toHaveBeenCalledWith('/knowledge-graph/me/layout/', request)
    expect(mockedHttp.delete).toHaveBeenCalledWith('/knowledge-graph/me/layout/')

    const saveMutationOptions = buildSaveKnowledgeGraphLayoutMutationOptions()
    const resetMutationOptions = buildResetKnowledgeGraphLayoutMutationOptions()

    await saveMutationOptions.onSuccess()
    await resetMutationOptions.onSuccess()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: knowledgeGraphQueryKeys.own() })
    expect(invalidateSpy).toHaveBeenCalledTimes(2)
  })

  it('builds distinct own and public query keys with blank public-id guards', () => {
    expect(buildKnowledgeGraphQueryKey()).toEqual(['knowledge-graph', 'me'])
    expect(buildKnowledgeGraphQueryKey('user-123')).toEqual(['knowledge-graph', 'users', 'user-123'])
  })
})
