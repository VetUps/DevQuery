import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'

import {
  fetchQuestionList,
  normalizeQuestionTags,
  type QuestionListParams,
  type QuestionOrdering,
} from '@/features/questions/api/questions'

export function normalizeQuestionOrdering(ordering: QuestionListParams['ordering']): QuestionOrdering {
  return ordering === 'question_created_at' || ordering === '-question_created_at'
    ? ordering
    : '-question_created_at'
}

export function normalizeQuestionListParams(params: QuestionListParams) {
  const nextPage = params.page
  const nextSearch = params.search?.trim() ?? ''
  const nextTags = normalizeQuestionTags(params.tags)

  return {
    page: nextPage > 0 ? nextPage : 1,
    search: nextSearch,
    ordering: normalizeQuestionOrdering(params.ordering),
    tags: nextTags,
  } satisfies QuestionListParams
}

export function useQuestionListQuery(params: MaybeRefOrGetter<QuestionListParams>) {
  const normalizedParams = computed(() => normalizeQuestionListParams(toValue(params)))

  return useQuery({
    queryKey: computed(() => ['questions', 'list', normalizedParams.value]),
    placeholderData: keepPreviousData,
    queryFn: () => fetchQuestionList(normalizedParams.value),
  })
}
