import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'

import { fetchOwnKnowledgeGraphInsights } from '@/features/knowledge/api/knowledgeGraph'

export const knowledgeGraphInsightsQueryKeys = {
  all: ['knowledge-graph'] as const,
  own: () => [...knowledgeGraphInsightsQueryKeys.all, 'me', 'insights'] as const,
}

export function useOwnKnowledgeGraphInsightsQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: knowledgeGraphInsightsQueryKeys.own(),
    queryFn: fetchOwnKnowledgeGraphInsights,
    enabled,
  })
}
