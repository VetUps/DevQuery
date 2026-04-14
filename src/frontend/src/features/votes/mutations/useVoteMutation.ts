import axios from 'axios'
import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import type { QuestionDetail } from '@/features/questions/api/questions'
import type { SolutionListItem } from '@/features/solutions/api/solutions'
import { castVote, removeVote, type VoteTargetType, type VoteType } from '@/features/votes/api/votes'
import { applyVoteState, resolveNextVote } from '@/features/votes/libs/apply-vote-state'
import { useToastStore } from '@/shared/stores/toast'

interface VoteMutationPayload {
  targetType: VoteTargetType
  targetId: string
  questionId?: string
  currentVote?: VoteType | null | string
  requestedVote: VoteType
}

interface VoteMutationContext {
  detailKey?: readonly ['questions', 'detail', string]
  detailSnapshot?: QuestionDetail
  solutionsKey?: readonly ['solutions', 'list', string]
  solutionsSnapshot?: SolutionListItem[]
}

function getFirstErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return ''
}

function normalizeVoteError(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return 'Не удалось обновить голос. Попробуйте ещё раз.'
  }

  const data = error.response.data as Record<string, unknown>

  return (
    getFirstErrorMessage(data.detail) ||
    getFirstErrorMessage(data.non_field_errors) ||
    'Не удалось обновить голос. Попробуйте ещё раз.'
  )
}

export function useVoteMutation() {
  const { pushToast } = useToastStore()

  return useMutation({
    mutationFn: async (payload: VoteMutationPayload) => {
      const nextVote = resolveNextVote(payload.currentVote ?? null, payload.requestedVote)

      if (nextVote === null) {
        await removeVote(payload.targetType, payload.targetId)
        return { nextVote: null }
      }

      await castVote({
        target_type: payload.targetType,
        target_id: payload.targetId,
        vote_type: payload.requestedVote,
      })

      return { nextVote }
    },
    onMutate: async (payload): Promise<VoteMutationContext> => {
      const detailKey = payload.targetType === 'question'
        ? ['questions', 'detail', payload.targetId] as const
        : undefined
      const solutionsKey = payload.targetType === 'solution' && payload.questionId
        ? ['solutions', 'list', payload.questionId] as const
        : undefined

      await Promise.all([
        detailKey ? queryClient.cancelQueries({ queryKey: detailKey }) : Promise.resolve(),
        solutionsKey ? queryClient.cancelQueries({ queryKey: solutionsKey }) : Promise.resolve(),
      ])

      const detailSnapshot = detailKey ? queryClient.getQueryData<QuestionDetail>(detailKey) : undefined
      const solutionsSnapshot = solutionsKey ? queryClient.getQueryData<SolutionListItem[]>(solutionsKey) : undefined

      if (detailKey && detailSnapshot) {
        queryClient.setQueryData<QuestionDetail>(detailKey, {
          ...detailSnapshot,
          ...applyVoteState(detailSnapshot, payload.requestedVote),
        })
      }

      if (solutionsKey && solutionsSnapshot) {
        queryClient.setQueryData<SolutionListItem[]>(
          solutionsKey,
          solutionsSnapshot.map((solution) => (
            solution.solution_id === payload.targetId
              ? {
                  ...solution,
                  ...applyVoteState(solution, payload.requestedVote),
                }
              : solution
          )),
        )
      }

      return {
        detailKey,
        detailSnapshot,
        solutionsKey,
        solutionsSnapshot,
      }
    },
    onError: (error, _payload, context) => {
      if (context?.detailKey && context.detailSnapshot) {
        queryClient.setQueryData(context.detailKey, context.detailSnapshot)
      }

      if (context?.solutionsKey && context.solutionsSnapshot) {
        queryClient.setQueryData(context.solutionsKey, context.solutionsSnapshot)
      }

      pushToast({
        message: normalizeVoteError(error),
        tone: 'danger',
      })
    },
    onSettled: async (_data, _error, payload, context) => {
      await Promise.all([
        context?.detailKey
          ? queryClient.invalidateQueries({ queryKey: context.detailKey })
          : Promise.resolve(),
        context?.solutionsKey
          ? queryClient.invalidateQueries({ queryKey: context.solutionsKey })
          : Promise.resolve(),
      ])
    },
  })
}
