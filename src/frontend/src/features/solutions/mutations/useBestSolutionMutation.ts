import axios from 'axios'
import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { markSolutionBest } from '@/features/solutions/api/solutions'
import { useToastStore } from '@/shared/stores/toast'

interface BestSolutionMutationPayload {
  questionId: string
  solutionId: string
  solution_is_best: boolean
}

function normalizeBestSolutionError(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return 'Не удалось обновить лучшее решение. Попробуйте ещё раз.'
  }

  const data = error.response.data as Record<string, unknown>

  if (typeof data.detail === 'string') {
    return data.detail
  }

  if (Array.isArray(data.non_field_errors) && typeof data.non_field_errors[0] === 'string') {
    return data.non_field_errors[0]
  }

  return 'Не удалось обновить лучшее решение. Попробуйте ещё раз.'
}

export function useBestSolutionMutation() {
  const { pushToast } = useToastStore()

  return useMutation({
    mutationFn: (payload: BestSolutionMutationPayload) => markSolutionBest(
      payload.solutionId,
      { solution_is_best: payload.solution_is_best },
    ),
    onSuccess: async (_updatedSolution, payload) => {
      pushToast({
        message: payload.solution_is_best ? 'Лучшее решение выбрано' : 'Отметка лучшего решения снята',
        tone: 'success',
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solutions', 'list', payload.questionId] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'detail', payload.questionId] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'list'] }),
      ])
    },
    onError: (error) => {
      pushToast({
        message: normalizeBestSolutionError(error),
        tone: 'danger',
      })
    },
  })
}
