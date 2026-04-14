import { useMutation } from '@tanstack/vue-query'

import { createSolutionEdit, type CreateSolutionEditPayload } from '@/features/solutions/api/solutionEdits'

export function useCreateSolutionEditMutation() {
  return useMutation({
    mutationFn: (payload: CreateSolutionEditPayload) => createSolutionEdit(payload),
  })
}
