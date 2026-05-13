import { describe, expect, it } from 'vitest'

import {
  MalformedKnowledgeGraphResponseError,
  parseUserKnowledgeGraphResponse,
  type UserKnowledgeGraphResponse,
} from '@/features/knowledge/api/knowledgeGraph'

const FORBIDDEN_SEMANTIC_TERMS = [
  'vector',
  'embedding',
  'provider',
  'model',
  'source_id',
  'content_hash',
  'raw_output',
  'secret',
  'stack',
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

function expectMalformedPath(action: () => unknown, path: string) {
  expect(action).toThrow(MalformedKnowledgeGraphResponseError)
  expect(action).toThrow(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

describe('knowledge graph semantic DTO contract', () => {
  it('parses owner semantic edges and sorted semantic group members as safe additive fields', () => {
    const parsed = parseUserKnowledgeGraphResponse(
      baseGraphPayload({
        semantic_edges: [semanticEdge()],
        semantic_groups: [semanticGroup()],
      }),
    )

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
    })
    expect(parsed.semantic_groups[0].members.map((member) => member.concept_id)).toEqual([10, 20])
  })

  it('normalizes missing owner and public semantic arrays to empty arrays', () => {
    expect(parseUserKnowledgeGraphResponse(baseGraphPayload()).semantic_edges).toEqual([])
    expect(parseUserKnowledgeGraphResponse(baseGraphPayload()).semantic_groups).toEqual([])

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

  it('rejects public responses that contain owner-only semantic payloads', () => {
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
        semantic_edges: [semanticEdge()],
        semantic_groups: [semanticGroup()],
      }),
    )
    const rendered = JSON.stringify({
      semantic_edges: parsed.semantic_edges,
      semantic_groups: parsed.semantic_groups,
    }).toLowerCase()

    expect(FORBIDDEN_SEMANTIC_TERMS.filter((term) => rendered.includes(term))).toEqual([])
  })
})
