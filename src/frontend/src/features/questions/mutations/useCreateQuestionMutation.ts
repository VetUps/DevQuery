import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { createQuestion, type CreateQuestionPayload } from '@/features/questions/api/questions'

export function useCreateQuestionMutation() {
  return useMutation({
    mutationFn: (payload: CreateQuestionPayload) => createQuestion(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['questions', 'list'] })
    },
  })
}
