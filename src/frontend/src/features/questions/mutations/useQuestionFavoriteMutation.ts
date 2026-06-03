import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  addQuestionFavorite,
  removeQuestionFavorite,
  type PaginatedResponse,
  type QuestionDetail,
  type QuestionFavoriteMutationResponse,
  type QuestionListItem,
} from '@/features/questions/api/questions'
import { useToastStore } from '@/shared/stores/toast'

interface QuestionFavoriteMutationPayload {
  questionId: string
  isFavorited: boolean
}

type QuestionListSnapshot = [readonly unknown[], PaginatedResponse<QuestionListItem> | undefined]

interface QuestionFavoriteMutationContext {
  detailKey: readonly ['questions', 'detail', string]
  detailSnapshot?: QuestionDetail
  listSnapshots: QuestionListSnapshot[]
}

function getNextFavoriteCount(question: Pick<QuestionListItem, 'favorites_count' | 'is_favorited'>, isFavorited: boolean) {
  if (question.is_favorited === isFavorited) {
    return question.favorites_count
  }

  return isFavorited
    ? question.favorites_count + 1
    : Math.max(0, question.favorites_count - 1)
}

function applyFavoriteStateToQuestion<T extends QuestionListItem>(question: T, isFavorited: boolean, favoritesCount?: number): T {
  return {
    ...question,
    is_favorited: isFavorited,
    favorites_count: typeof favoritesCount === 'number'
      ? Math.max(0, favoritesCount)
      : getNextFavoriteCount(question, isFavorited),
  }
}

function applyFavoriteStateToList(
  page: PaginatedResponse<QuestionListItem>,
  questionId: string,
  isFavorited: boolean,
  favoritesCount?: number,
): PaginatedResponse<QuestionListItem> {
  return {
    ...page,
    results: page.results.map((question) => (
      question.question_id === questionId
        ? applyFavoriteStateToQuestion(question, isFavorited, favoritesCount)
        : question
    )),
  }
}

function normalizeFavoriteError(error: unknown) {
  if (error instanceof Error && error.message === 'Malformed question favorite response') {
    return 'Не удалось обновить избранное. Сервер вернул неожиданный ответ, попробуйте ещё раз.'
  }

  return 'Не удалось обновить избранное. Попробуйте ещё раз.'
}

function writeFavoriteServerState(response: QuestionFavoriteMutationResponse, fallbackQuestionId: string) {
  const questionId = response.question_id || fallbackQuestionId

  queryClient.setQueriesData<PaginatedResponse<QuestionListItem>>(
    { queryKey: ['questions', 'list'] },
    (page) => page
      ? applyFavoriteStateToList(page, questionId, response.is_favorited, response.favorites_count)
      : page,
  )

  const detailKey = ['questions', 'detail', questionId] as const
  const detail = queryClient.getQueryData<QuestionDetail>(detailKey)

  if (detail) {
    queryClient.setQueryData<QuestionDetail>(
      detailKey,
      applyFavoriteStateToQuestion(detail, response.is_favorited, response.favorites_count),
    )
  }
}

export function useQuestionFavoriteMutation() {
  const { pushToast } = useToastStore()

  return useMutation({
    mutationFn: (payload: QuestionFavoriteMutationPayload) => (
      payload.isFavorited
        ? addQuestionFavorite(payload.questionId)
        : removeQuestionFavorite(payload.questionId)
    ),
    onMutate: async (payload): Promise<QuestionFavoriteMutationContext> => {
      const detailKey = ['questions', 'detail', payload.questionId] as const

      await queryClient.cancelQueries({ queryKey: ['questions'] })

      const detailSnapshot = queryClient.getQueryData<QuestionDetail>(detailKey)
      const listSnapshots = queryClient.getQueriesData<PaginatedResponse<QuestionListItem>>({
        queryKey: ['questions', 'list'],
      })

      queryClient.setQueriesData<PaginatedResponse<QuestionListItem>>(
        { queryKey: ['questions', 'list'] },
        (page) => page
          ? applyFavoriteStateToList(page, payload.questionId, payload.isFavorited)
          : page,
      )

      if (detailSnapshot) {
        queryClient.setQueryData<QuestionDetail>(
          detailKey,
          applyFavoriteStateToQuestion(detailSnapshot, payload.isFavorited),
        )
      }

      return {
        detailKey,
        detailSnapshot,
        listSnapshots,
      }
    },
    onError: (error, _payload, context) => {
      if (context?.detailSnapshot) {
        queryClient.setQueryData(context.detailKey, context.detailSnapshot)
      }

      for (const [queryKey, snapshot] of context?.listSnapshots ?? []) {
        queryClient.setQueryData(queryKey, snapshot)
      }

      pushToast({
        message: normalizeFavoriteError(error),
        tone: 'danger',
      })
    },
    onSuccess: (response, payload) => {
      writeFavoriteServerState(response, payload.questionId)
    },
    onSettled: async (_data, _error, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['questions', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['questions', 'detail', payload.questionId] }),
      ])
    },
  })
}
