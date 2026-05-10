import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import {
  fetchOwnKnowledgeGraph,
  fetchPublicUserKnowledgeGraph,
} from '@/features/knowledge/api/knowledgeGraph'

export const knowledgeGraphQueryKeys = {
  all: ['knowledge-graph'] as const,
  own: () => [...knowledgeGraphQueryKeys.all, 'me'] as const,
  publicUser: (userId: string) => [...knowledgeGraphQueryKeys.all, 'users', userId] as const,
}

export function buildKnowledgeGraphQueryKey(userId?: string) {
  const normalizedUserId = userId?.trim()

  return normalizedUserId
    ? knowledgeGraphQueryKeys.publicUser(normalizedUserId)
    : knowledgeGraphQueryKeys.own()
}

export function useOwnKnowledgeGraphQuery() {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.own(),
    queryFn: fetchOwnKnowledgeGraph,
  })
}

export function usePublicUserKnowledgeGraphQuery(userId: MaybeRefOrGetter<string>) {
  const normalizedUserId = computed(() => toValue(userId).trim())

  return useQuery({
    queryKey: computed(() => knowledgeGraphQueryKeys.publicUser(normalizedUserId.value)),
    enabled: computed(() => Boolean(normalizedUserId.value)),
    queryFn: () => fetchPublicUserKnowledgeGraph(normalizedUserId.value),
  })
}
