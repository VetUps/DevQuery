import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { createSolution, type CreateSolutionPayload } from '@/features/solutions/api/solutions'

export function useCreateSolutionMutation() {
  return useMutation({
    mutationFn: (payload: CreateSolutionPayload) => createSolution(payload),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solutions', 'list', variables.question] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'detail', variables.question] }),
      ])
    },
  })
}
