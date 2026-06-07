import { describe, expect, it } from 'vitest'

import {
  MalformedKnowledgeGraphResponseError,
  parseUserKnowledgeGraphResponse,
  type UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'

const FORBIDDEN_SEMANTIC_TERMS = [
  'vector',
  'embedding',
  'source_id',
  'content_hash',
  'raw_output',
  'secret',
  'stack',
  'traceback',
  '@example.com',
]

const baseGraphPayload = (overrides: Record<string, unknown> = {}) => ({
  user_id: '11111111-1111-4111-8111-111111111111',
  viewer: { is_owner: true },
  state: {
    status: 'fresh',
    stale_reason: '',
    last_error_message: '',
    last_failed_phase: '',
    last_rebuild_started_at: null,
    last_rebuild_finished_at: '2026-05-06T12:00:00Z',
  },
  total_weight: '3.7500',
  activity_breakdown: [
    { activity_type: 'authored_answer', total_weight: '2.0000', source_count: 3 },
  ],
  concepts: [concept(10, 'django', 'Django'), concept(20, 'vue', 'Vue')],
  nodes: [concept(10, 'django', 'Django'), concept(20, 'vue', 'Vue')],
  edges: [
    {
      id: 'shared-question:10:20',
      source_concept_id: 10,
      target_concept_id: 20,
      weight: '1.0000',
      shared_question_count: 1,
      reason: 'shared_question',
      related_questions: [],
    },
  ],
  ...overrides,
})

function concept(conceptId: number, slug: string, name: string) {
  return {
    concept_id: conceptId,
    slug,
    name,
    source: 'tag',
    provider: 'tag-sync',
    confidence: '1.0000',
    total_weight: '1.0000',
    source_count: 1,
    activity_breakdown: [],
    related_questions: [],
  }
}

function semanticEdge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'semantic-neighbour:10:20',
    source_concept_id: 10,
    target_concept_id: 20,
    weight: '0.96000',
    similarity_score: '0.96000',
    confidence: '0.96000',
    rank: 3,
    reason: 'semantic_neighbour',
    evidence: { candidate_count: 2, best_rank: 3 },
    ...overrides,
  }
}

function semanticGroup(overrides: Record<string, unknown> = {}) {
  return {
    group_key: 'backend-django',
    label: 'Django backend cluster',
    description: 'Aggregated safe group description.',
    rationale: 'Concepts are often practiced together.',
    confidence: '0.9200',
    generated_at: '2026-05-10T12:00:00Z',
    evidence: { signals: [{ concept_slug: 'django', score: '0.91' }] },
    lifecycle_status: 'active',
    lifecycle_reason_code: '',
    reuse_evidence: { matched_member_signature: true, previous_member_count: 2 },
    member_count: 2,
    first_seen_at: '2026-05-01T12:00:00Z',
    last_seen_at: '2026-05-10T12:00:00Z',
    stale_at: null,
    archived_at: null,
    members: [
      {
        concept_id: 20,
        slug: 'vue',
        name: 'Vue',
        rank: 2,
        confidence: '0.8400',
        evidence: { signals: [{ concept_slug: 'vue', candidate_count: 1 }] },
      },
      {
        concept_id: 10,
        slug: 'django',
        name: 'Django',
        rank: 1,
        confidence: '0.8800',
        evidence: { signals: [{ concept_slug: 'django', candidate_count: 2 }] },
      },
    ],
    ...overrides,
  }
}

function semanticDiagnostics(overrides: Record<string, unknown> = {}) {
  return {
    status: 'provider_error',
    reason_code: 'provider_error',
    phase: 'semantic_provider',
    enabled: true,
    dry_run: false,
    source_item_count: 5,
    total_source_count: 5,
    changed_source_count: 3,
    provider_called_source_count: 3,
    reused_snapshot_count: 2,
    persisted_snapshot_count: 4,
    neighbour_candidate_count: 7,
    semantic_group_count: 2,
    semantic_group_membership_count: 3,
    semantic_group_reused_count: 1,
    semantic_group_created_count: 2,
    semantic_group_changed_count: 3,
    semantic_group_stale_count: 4,
    semantic_group_archived_count: 5,
    estimated_token_count: 11,
    estimated_cost: '0.120000',
    budget_cap: '1.500000',
    last_error_message: 'Knowledge graph semantic diagnostics unavailable.',
    started_at: '2026-05-10T11:59:00Z',
    finished_at: '2026-05-10T12:00:00Z',
    view: {
      mode: 'semantic',
      visible_lifecycle_statuses: ['active', 'stale'],
      archived_groups_included: false,
    },
    ...overrides,
  }
}

function semanticGraph(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    mode: 'semantic',
    status: 'provider_error',
    reason_code: 'provider_error',
    phase: 'semantic_provider',
    enabled: true,
    available: false,
    visible_group_count: 2,
    visible_member_count: 2,
    semantic_edge_count: 1,
    lifecycle_counts: { active: 1, stale: 1 },
    supported_lifecycle_statuses: ['active', 'stale'],
    archived_groups_included: false,
    ...overrides,
  }
}

function expectMalformedPath(action: () => unknown, path: string) {
  expect(action).toThrow(MalformedKnowledgeGraphResponseError)
  expect(action).toThrow(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

describe('knowledge graph semantic DTO contract', () => {
  it('parses S03 owner semantic diagnostics, graph metadata, and lifecycle groups as safe additive fields', () => {
    const parsed = parseUserKnowledgeGraphResponse(
      baseGraphPayload({
        semantic: semanticDiagnostics(),
        semantic_graph: semanticGraph(),
        semantic_edges: [semanticEdge()],
        semantic_groups: [
          semanticGroup(),
          semanticGroup({
            group_key: 'stale-api',
            label: 'Stale API cluster',
            lifecycle_status: 'stale',
            lifecycle_reason_code: 'provider_missed_group',
            member_count: 1,
            stale_at: '2026-05-11T12:00:00Z',
            members: [
              {
                concept_id: 20,
                slug: 'vue',
                name: 'Vue',
                rank: 1,
                confidence: '0.8400',
                evidence: { signals: [{ concept_slug: 'vue', candidate_count: 1 }] },
              },
            ],
          }),
        ],
      }),
    )

    expect(parsed.semantic).toMatchObject({
      status: 'provider_error',
      reason_code: 'provider_error',
      phase: 'semantic_provider',
      enabled: true,
      dry_run: false,
      source_item_count: 5,
      semantic_group_reused_count: 1,
      semantic_group_archived_count: 5,
      last_error_message: 'Knowledge graph semantic diagnostics unavailable.',
      view: {
        mode: 'semantic',
        visible_lifecycle_statuses: ['active', 'stale'],
        archived_groups_included: false,
      },
    })
    expect(parsed.semantic_graph).toEqual<UserKnowledgeGraphResponse['semantic_graph']>({
      schema_version: 1,
      mode: 'semantic',
      status: 'provider_error',
      reason_code: 'provider_error',
      phase: 'semantic_provider',
      enabled: true,
      available: false,
      visible_group_count: 2,
      visible_member_count: 2,
      semantic_edge_count: 1,
      lifecycle_counts: { active: 1, stale: 1 },
      supported_lifecycle_statuses: ['active', 'stale'],
      archived_groups_included: false,
    })
    expect(parsed.semantic_edges).toEqual<UserKnowledgeGraphResponse['semantic_edges']>([
      {
        id: 'semantic-neighbour:10:20',
        source_concept_id: 10,
        target_concept_id: 20,
        weight: '0.96000',
        similarity_score: '0.96000',
        confidence: '0.96000',
        rank: 3,
        reason: 'semantic_neighbour',
        evidence: { candidate_count: 2, best_rank: 3 },
      },
    ])
    expect(parsed.semantic_groups[0]).toMatchObject({
      group_key: 'backend-django',
      label: 'Django backend cluster',
      confidence: '0.9200',
      lifecycle_status: 'active',
      lifecycle_reason_code: '',
      reuse_evidence: { matched_member_signature: true, previous_member_count: 2 },
      member_count: 2,
      first_seen_at: '2026-05-01T12:00:00Z',
      last_seen_at: '2026-05-10T12:00:00Z',
      stale_at: null,
      archived_at: null,
    })
    expect(parsed.semantic_groups[0].members.map((member) => member.concept_id)).toEqual([10, 20])
    expect(parsed.semantic_groups[1]).toMatchObject({
      group_key: 'stale-api',
      lifecycle_status: 'stale',
      lifecycle_reason_code: 'provider_missed_group',
      member_count: 1,
      stale_at: '2026-05-11T12:00:00Z',
    })
  })

  it('normalizes missing owner semantic state to pending defaults and missing/public semantic arrays to empty arrays', () => {
    const ownerParsed = parseUserKnowledgeGraphResponse(baseGraphPayload())

    expect(ownerParsed.semantic_edges).toEqual([])
    expect(ownerParsed.semantic_groups).toEqual([])
    expect(ownerParsed.semantic).toMatchObject({
      status: 'pending',
      reason_code: '',
      phase: '',
      enabled: false,
      dry_run: true,
      semantic_group_count: 0,
      semantic_group_membership_count: 0,
      view: {
        mode: 'semantic',
        visible_lifecycle_statuses: ['active', 'stale'],
        archived_groups_included: false,
      },
    })
    expect(ownerParsed.semantic_graph).toEqual({
      schema_version: 1,
      mode: 'semantic',
      status: 'pending',
      reason_code: '',
      phase: '',
      enabled: false,
      available: false,
      visible_group_count: 0,
      visible_member_count: 0,
      semantic_edge_count: 0,
      lifecycle_counts: { active: 0, stale: 0 },
      supported_lifecycle_statuses: ['active', 'stale'],
      archived_groups_included: false,
    })

    const publicParsed = parseUserKnowledgeGraphResponse(
      baseGraphPayload({
        viewer: { is_owner: false },
        semantic_edges: [],
        semantic_groups: [],
      }),
    )

    expect(publicParsed.viewer.is_owner).toBe(false)
    expect(publicParsed.semantic_edges).toEqual([])
    expect(publicParsed.semantic_groups).toEqual([])
    expect(publicParsed.semantic).toBeUndefined()
    expect(publicParsed.semantic_graph).toBeUndefined()
  })

  it('rejects malformed semantic reason, decimal fields, endpoints, and group member references', () => {
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_edges: [semanticEdge({ reason: 'shared_question' })] })),
      'semantic_edges[0].reason',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_edges: [semanticEdge({ confidence: 0.96 })] })),
      'semantic_edges[0].confidence',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_edges: [semanticEdge({ target_concept_id: 999 })] })),
      'semantic_edges[0].target_concept_id',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_groups: [semanticGroup({ members: [{
        concept_id: 999,
        slug: 'hidden',
        name: 'Hidden',
        rank: 1,
        confidence: '0.5000',
        evidence: {},
      }] })] })),
      'semantic_groups[0].members[0].concept_id',
    )
  })

  it('rejects malformed semantic lifecycle and view metadata with path-only errors', () => {
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_groups: [semanticGroup({ lifecycle_status: 'deleted' })] })),
      'semantic_groups[0].lifecycle_status',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_groups: [semanticGroup({ member_count: -1 })] })),
      'semantic_groups[0].member_count',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_groups: [semanticGroup({ first_seen_at: 123 })] })),
      'semantic_groups[0].first_seen_at',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_graph: semanticGraph({ schema_version: 2 }) })),
      'semantic_graph.schema_version',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_graph: semanticGraph({ available: 'yes' }) })),
      'semantic_graph.available',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_graph: semanticGraph({ lifecycle_counts: { active: 1, stale: -1 } }) })),
      'semantic_graph.lifecycle_counts.stale',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic: semanticDiagnostics({ view: { mode: 'structural', visible_lifecycle_statuses: ['active'], archived_groups_included: false } }) })),
      'semantic.view.mode',
    )
  })

  it('rejects public responses that contain owner-only semantic payloads', () => {
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ viewer: { is_owner: false }, semantic: semanticDiagnostics() })),
      'semantic',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ viewer: { is_owner: false }, semantic_graph: semanticGraph() })),
      'semantic_graph',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ viewer: { is_owner: false }, semantic_edges: [semanticEdge()] })),
      'semantic_edges',
    )
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ viewer: { is_owner: false }, semantic_groups: [semanticGroup()] })),
      'semantic_groups',
    )
  })

  it('rejects forbidden raw/private evidence fields and values without echoing DTO values', () => {
    expectMalformedPath(
      () => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic: semanticDiagnostics({ last_error_message: 'Traceback source_id=abc token=sk_live_m017 m017-semantic-owner@example.com private source text' }) })),
      'semantic.last_error_message',
    )

    const forbiddenEvidenceFixtures = [
      { source_id: 'question-1' },
      { content_hash: 'abc' },
      { raw_output: 'provider said hello' },
      { diagnostics: { vector_payload: [0.1, 0.2] } },
      { diagnostics: { safe_key: 'embedding-provider' } },
      { diagnostics: { safe_key: 'stack trace secret token' } },
    ]

    forbiddenEvidenceFixtures.forEach((evidence) => {
      expect(() => parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_edges: [semanticEdge({ evidence })] }))).toThrow(
        MalformedKnowledgeGraphResponseError,
      )
    })

    forbiddenEvidenceFixtures.forEach((evidence) => {
      try {
        parseUserKnowledgeGraphResponse(baseGraphPayload({ semantic_edges: [semanticEdge({ evidence })] }))
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

        expect(message).toContain('malformed knowledge graph response')
        expect(FORBIDDEN_SEMANTIC_TERMS.filter((term) => message.includes(term))).toEqual([])
        expect(message).not.toContain('question-1')
        expect(message).not.toContain('abc')
      }
    })
  })

  it('does not render forbidden raw semantic terms in parsed contract fixtures', () => {
    const parsed = parseUserKnowledgeGraphResponse(
      baseGraphPayload({
        semantic: semanticDiagnostics(),
        semantic_graph: semanticGraph(),
        semantic_edges: [semanticEdge()],
        semantic_groups: [semanticGroup()],
      }),
    )
    const rendered = JSON.stringify({
      semantic: parsed.semantic,
      semantic_graph: parsed.semantic_graph,
      semantic_edges: parsed.semantic_edges,
      semantic_groups: parsed.semantic_groups,
    }).toLowerCase()

    expect(FORBIDDEN_SEMANTIC_TERMS.filter((term) => rendered.includes(term))).toEqual([])
  })
})
