import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/query-client'
import { http } from '@/shared/api/http'
import {
  MalformedKnowledgeGraphResponseError,
  fetchOwnKnowledgeGraph,
  fetchPublicUserKnowledgeGraph,
  parseKnowledgeGraphRebuildErrorResponse,
  parseKnowledgeGraphRebuildResponse,
  parseKnowledgeGraphLayout,
  parseUserKnowledgeGraphResponse,
  rebuildOwnKnowledgeGraph,
  resetOwnKnowledgeGraphLayout,
  saveOwnKnowledgeGraphLayout,
  type KnowledgeGraphRebuildResponse,
  type UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import {
  buildKnowledgeGraphQueryKey,
  knowledgeGraphQueryKeys,
} from '@/features/knowledge/queries/useKnowledgeGraphQuery'
import { buildRebuildKnowledgeGraphMutationOptions } from '@/features/knowledge/mutations/useRebuildKnowledgeGraphMutation'
import {
  buildResetKnowledgeGraphLayoutMutationOptions,
  buildSaveKnowledgeGraphLayoutMutationOptions,
} from '@/features/knowledge/mutations/useKnowledgeGraphLayoutMutation'

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
    expect(parseUserKnowledgeGraphResponse(graphPayload({ layout: layoutPayload() })).layout).toEqual({
      schema_version: 1,
      positions: {
        10: { x: 120.5, y: -40.25 },
        20: { x: 300, y: 80 },
      },
      updated_at: '2026-05-11T12:00:00Z',
    })
    expect(parseKnowledgeGraphLayout(layoutPayload()).positions['10']).toEqual({ x: 120.5, y: -40.25 })
    expect(JSON.stringify(parseKnowledgeGraphLayout(layoutPayload()))).not.toContain('raw_exception')

    expect(() => parseKnowledgeGraphLayout(layoutPayload({ schema_version: 2 }))).toThrow(/layout\.schema_version/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ positions: { abc: { x: 1, y: 2 } } }))).toThrow(/layout\.positions\.abc/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ positions: { 10: { x: Number.NaN, y: 2 } } }))).toThrow(/layout\.positions\.10\.x/)
    expect(() => parseKnowledgeGraphLayout(layoutPayload({ positions: { 10: { x: 1 } } }))).toThrow(/layout\.positions\.10\.y/)
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
