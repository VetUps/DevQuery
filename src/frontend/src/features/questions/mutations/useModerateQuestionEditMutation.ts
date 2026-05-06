import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  approveQuestionEdit,
  disapproveQuestionEdit,
  type ModerateQuestionEditResponse,
} from '@/features/questions/api/questionEdits'
import { buildQuestionReviewQueueQueryKey } from '@/features/questions/queries/useQuestionReviewQueueQuery'

interface ModerateQuestionEditPayload {
  questionEditId: string
  questionId: string
  approve: boolean
}

export function useModerateQuestionEditMutation() {
  return useMutation({
    mutationFn: async (payload: ModerateQuestionEditPayload): Promise<ModerateQuestionEditResponse> => {
      if (payload.approve) {
        return approveQuestionEdit(payload.questionEditId)
      }

      return disapproveQuestionEdit(payload.questionEditId)
    },
    onSuccess: async (_data, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['questions', 'detail', payload.questionId] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'list'] }),
        queryClient.invalidateQueries({ queryKey: buildQuestionReviewQueueQueryKey() }),
      ])
    },
  })
}
