// Кратко: держит основную логику этого файла.
import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  resetOwnKnowledgeGraphLayout,
  saveOwnKnowledgeGraphLayout,
  type KnowledgeGraphLayout,
  type SaveKnowledgeGraphLayoutRequest,
} from '@/features/knowledge/api/knowledgeGraph'
import { knowledgeGraphQueryKeys } from '@/features/knowledge/queries/useKnowledgeGraphQuery'

export function buildSaveKnowledgeGraphLayoutMutationOptions() {
  return {
    mutationFn: saveOwnKnowledgeGraphLayout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.own() })
    },
  }
}

export function buildResetKnowledgeGraphLayoutMutationOptions() {
  return {
    mutationFn: resetOwnKnowledgeGraphLayout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.own() })
    },
  }
}

export function useSaveKnowledgeGraphLayoutMutation() {
  return useMutation<KnowledgeGraphLayout, Error, SaveKnowledgeGraphLayoutRequest>(
    buildSaveKnowledgeGraphLayoutMutationOptions(),
  )
}

export function useResetKnowledgeGraphLayoutMutation() {
  return useMutation<KnowledgeGraphLayout, Error, void>(buildResetKnowledgeGraphLayoutMutationOptions())
}
