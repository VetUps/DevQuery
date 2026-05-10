import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  rebuildOwnKnowledgeGraph,
  type KnowledgeGraphRebuildResponse,
} from '@/features/knowledge/api/knowledgeGraph'
import { knowledgeGraphQueryKeys } from '@/features/knowledge/queries/useKnowledgeGraphQuery'

export function buildRebuildKnowledgeGraphMutationOptions() {
  return {
    mutationFn: rebuildOwnKnowledgeGraph,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.all })
    },
  }
}

export function useRebuildKnowledgeGraphMutation() {
  return useMutation<KnowledgeGraphRebuildResponse, Error, void>(buildRebuildKnowledgeGraphMutationOptions())
}
