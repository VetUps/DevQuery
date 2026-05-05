import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { createQuestionEdit, type CreateQuestionEditPayload } from '@/features/questions/api/questionEdits'
import { buildQuestionReviewQueueQueryKey } from '@/features/questions/queries/useQuestionReviewQueueQuery'

export function useCreateQuestionEditMutation() {
  return useMutation({
    mutationFn: (payload: CreateQuestionEditPayload) => createQuestionEdit(payload),
    onSuccess: async (_data, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['questions', 'detail', payload.question] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'list'] }),
        queryClient.invalidateQueries({ queryKey: buildQuestionReviewQueueQueryKey() }),
      ])
    },
  })
}
