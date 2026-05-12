import { describe, expect, it } from 'vitest'

import type {
  KnowledgeGraphInsightAction,
  KnowledgeGraphInsightConceptEntry,
} from '@/features/knowledge/api/knowledgeGraph'
import {
  buildConceptQuestionDiscoveryRoute,
  buildRecommendationQuestionDiscoveryRoute,
  getQuestionDiscoveryQueryKeys,
} from '@/features/knowledge/components/knowledgeGraphQuestionDiscovery'

const discoveryQueryKeys = ['tag', 'search', 'ordering', 'page']

function buildConcept(overrides: Partial<KnowledgeGraphInsightConceptEntry> = {}): KnowledgeGraphInsightConceptEntry {
  return {
    concept_id: 10,
    slug: ' Vue ',
    name: 'Vue Components',
    total_weight: '1.0000',
    source_count: 2,
    related_question_count: 1,
    semantic_state: 'growing',
    tone_token: 'success',
    recommendations: [],
    ...overrides,
  }
}

function buildAction(payload: Record<string, unknown>): KnowledgeGraphInsightAction {
  return {
    type: 'answer_question',
    payload,
  }
}

describe('knowledge graph question discovery route builders', () => {
  it('builds concept discovery routes for the named home route with normalized tag arrays', () => {
    const route = buildConceptQuestionDiscoveryRoute(buildConcept({ slug: '  DJANGO  ', name: 'Django' }))

    expect(route).toEqual({
      name: 'home',
      query: {
        tag: ['django'],
      },
    })
  })

  it('falls back from an empty concept slug to a trimmed search string', () => {
    const route = buildConceptQuestionDiscoveryRoute(buildConcept({ slug: '   ', name: '  Graph Theory  ' }))

    expect(route).toEqual({
      name: 'home',
      query: {
        search: 'Graph Theory',
      },
    })
  })

  it('returns null for concepts without a safe tag or search identifier', () => {
    expect(buildConceptQuestionDiscoveryRoute(buildConcept({ slug: '', name: '   ' }))).toBeNull()
  })

  it('normalizes recommendation action tag, search, ordering, and page query semantics', () => {
    const route = buildRecommendationQuestionDiscoveryRoute(buildAction({
      tag: [' Vue ', 'vue', '  DJANGO  ', '', 42, { tag: 'secret' }, 'django'],
      search: '  composition api  ',
      query: 'ignored because search wins',
      order: 'question_created_at',
      page: '3',
    }))

    expect(route).toEqual({
      name: 'home',
      query: {
        tag: ['vue', 'django'],
        search: 'composition api',
        ordering: 'question_created_at',
        page: '3',
      },
    })
  })

  it('uses the safe query payload alias when search is absent', () => {
    const route = buildRecommendationQuestionDiscoveryRoute(buildAction({ query: '  django orm  ' }))

    expect(route).toEqual({
      name: 'home',
      query: {
        search: 'django orm',
      },
    })
  })

  it('omits page 1 and maps unsupported ordering values to the existing default ordering', () => {
    const route = buildRecommendationQuestionDiscoveryRoute(buildAction({
      tag: '  DRF ',
      order: 'relevance',
      page: '1',
    }))

    expect(route).toEqual({
      name: 'home',
      query: {
        tag: ['drf'],
      },
    })
  })

  it('normalizes malformed page values back to the reset page and keeps no arbitrary ordering mode', () => {
    expect(buildRecommendationQuestionDiscoveryRoute(buildAction({ tag: 'vue', page: '0', order: 'relevance' }))).toEqual({
      name: 'home',
      query: { tag: ['vue'] },
    })
    expect(buildRecommendationQuestionDiscoveryRoute(buildAction({ tag: 'vue', page: '-2', order: 'rank' }))).toEqual({
      name: 'home',
      query: { tag: ['vue'] },
    })
    expect(buildRecommendationQuestionDiscoveryRoute(buildAction({ tag: 'vue', page: 'abc', order: 'latest' }))).toEqual({
      name: 'home',
      query: { tag: ['vue'] },
    })
  })

  it('ignores private and unknown action payload fields in route query serialization', () => {
    const route = buildRecommendationQuestionDiscoveryRoute(buildAction({
      tag: '  Vue ',
      source_object_id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      token: 'secret-token',
      traceback: 'Traceback provider diagnostics',
      provider_diagnostics: 'internal-provider-diagnostics',
      vectors: [0.1, 0.2],
      embeddings: [0.3, 0.4],
      unexpected: 'must-not-leak',
    }))

    expect(route).toEqual({
      name: 'home',
      query: {
        tag: ['vue'],
      },
    })
    expect(JSON.stringify(route?.query)).not.toContain('source_object_id')
    expect(JSON.stringify(route?.query)).not.toContain('owner@example.com')
    expect(JSON.stringify(route?.query)).not.toContain('secret-token')
    expect(JSON.stringify(route?.query)).not.toContain('Traceback')
    expect(JSON.stringify(route?.query)).not.toContain('provider')
    expect(JSON.stringify(route?.query)).not.toContain('vectors')
    expect(JSON.stringify(route?.query)).not.toContain('embeddings')
    expect(JSON.stringify(route?.query)).not.toContain('must-not-leak')
  })

  it('falls back to concept discovery for missing, malformed, empty, or unknown recommendation action payloads', () => {
    const concept = buildConcept({ slug: ' Django ', name: 'Django' })

    expect(buildRecommendationQuestionDiscoveryRoute(null, concept)).toEqual({
      name: 'home',
      query: { tag: ['django'] },
    })
    expect(buildRecommendationQuestionDiscoveryRoute({ type: 'answer_question', payload: null } as unknown as KnowledgeGraphInsightAction, concept)).toEqual({
      name: 'home',
      query: { tag: ['django'] },
    })
    expect(buildRecommendationQuestionDiscoveryRoute(buildAction({}), concept)).toEqual({
      name: 'home',
      query: { tag: ['django'] },
    })
    expect(buildRecommendationQuestionDiscoveryRoute({ type: 'unknown_action', payload: {} } as unknown as KnowledgeGraphInsightAction, concept)).toEqual({
      name: 'home',
      query: { tag: ['django'] },
    })
  })

  it('returns null for malformed actions when no concept fallback exists', () => {
    expect(buildRecommendationQuestionDiscoveryRoute(buildAction({}))).toBeNull()
    expect(buildRecommendationQuestionDiscoveryRoute({ type: 'answer_question', payload: [] } as unknown as KnowledgeGraphInsightAction)).toBeNull()
  })

  it('keeps generated query keys compatible with HomePage and fetchQuestionList only', () => {
    const route = buildRecommendationQuestionDiscoveryRoute(buildAction({
      tag: ['Vue'],
      search: 'components',
      order: 'question_created_at',
      page: '2',
      arbitrary: 'not-compatible',
    }))

    expect(getQuestionDiscoveryQueryKeys()).toEqual(discoveryQueryKeys)
    expect(Object.keys(route?.query ?? {}).sort()).toEqual(discoveryQueryKeys.sort())
    expect(Object.keys(route?.query ?? {})).not.toContain('order')
    expect(Object.keys(route?.query ?? {})).not.toContain('query')
    expect(Object.keys(route?.query ?? {})).not.toContain('arbitrary')
  })
})
