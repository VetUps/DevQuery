import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  approveSolutionEdit,
  disapproveSolutionEdit,
  type ModerateSolutionEditResponse,
} from '@/features/solutions/api/solutionEdits'
import { buildMyEditHistoryQueryKey } from '@/features/solutions/queries/useMyEditHistoryQuery'
import { buildPublicSolutionEditHistoryQueryKey } from '@/features/solutions/queries/usePublicSolutionEditHistoryQuery'
import { buildReviewQueueQueryKey } from '@/features/solutions/queries/useReviewQueueQuery'

interface ModerateSolutionEditPayload {
  solutionEditId: string
  solutionId: string
  questionId: string
  approve: boolean
}

export function useModerateSolutionEditMutation() {
  return useMutation({
    mutationFn: async (payload: ModerateSolutionEditPayload): Promise<ModerateSolutionEditResponse> => {
      if (payload.approve) {
        return approveSolutionEdit(payload.solutionEditId)
      }

      return disapproveSolutionEdit(payload.solutionEditId)
    },
    onSuccess: async (_data, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: buildReviewQueueQueryKey() }),
        queryClient.invalidateQueries({ queryKey: buildMyEditHistoryQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: buildPublicSolutionEditHistoryQueryKey(payload.solutionId),
        }),
        queryClient.invalidateQueries({
          queryKey: ['solutions', 'list', payload.questionId],
        }),
      ])
    },
  })
}
