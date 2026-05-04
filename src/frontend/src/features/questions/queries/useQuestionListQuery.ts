import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'

import {
  fetchQuestionList,
  normalizeQuestionTags,
  type QuestionListParams,
  type QuestionOrdering,
} from '@/features/questions/api/questions'

function normalizeQuestionOrdering(ordering: QuestionListParams['ordering']): QuestionOrdering {
  return ordering === 'question_created_at' || ordering === '-question_created_at'
    ? ordering
    : '-question_created_at'
}

export function useQuestionListQuery(params: MaybeRefOrGetter<QuestionListParams>) {
  const normalizedParams = computed(() => {
    const nextParams = toValue(params)
    const nextPage = nextParams.page
    const nextSearch = nextParams.search?.trim() ?? ''
    const nextTags = normalizeQuestionTags(nextParams.tags)

    return {
      page: nextPage > 0 ? nextPage : 1,
      search: nextSearch,
      ordering: normalizeQuestionOrdering(nextParams.ordering),
      tags: nextTags,
    } satisfies QuestionListParams
  })

  return useQuery({
    queryKey: computed(() => ['questions', 'list', normalizedParams.value]),
    placeholderData: keepPreviousData,
    queryFn: () => fetchQuestionList(normalizedParams.value),
  })
}
