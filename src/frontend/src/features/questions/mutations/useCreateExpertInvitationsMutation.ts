import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { createExpertInvitations } from '@/features/questions/api/questionExpertInvitations'
import { buildEligibleExpertsBaseQueryKey } from '@/features/questions/queries/useEligibleExpertsQuery'
import { buildInvitedExpertInvitationsQueryKey } from '@/features/questions/queries/useInvitedExpertInvitationsQuery'

export interface CreateExpertInvitationsMutationPayload {
  questionId: string
  recipientIds: string[]
}

export function useCreateExpertInvitationsMutation() {
  return useMutation({
    mutationFn: ({ questionId, recipientIds }: CreateExpertInvitationsMutationPayload) =>
      createExpertInvitations(questionId, recipientIds),
    onSuccess: async (_data, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: buildEligibleExpertsBaseQueryKey(payload.questionId),
        }),
        queryClient.invalidateQueries({
          queryKey: buildInvitedExpertInvitationsQueryKey(payload.questionId),
        }),
      ])
    },
  })
}
