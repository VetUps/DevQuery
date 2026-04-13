import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'

import { fetchQuestionList, type QuestionListParams } from '@/features/questions/api/questions'

export function useQuestionListQuery(params: MaybeRefOrGetter<QuestionListParams>) {
  const normalizedParams = computed(() => {
    const nextParams = toValue(params)
    const nextPage = nextParams.page
    const nextSearch = nextParams.search?.trim() ?? ''

    return {
      page: nextPage > 0 ? nextPage : 1,
      search: nextSearch,
      ordering: nextParams.ordering ?? '-question_created_at',
    } satisfies QuestionListParams
  })

  return useQuery({
    queryKey: computed(() => ['questions', 'list', normalizedParams.value]),
    placeholderData: keepPreviousData,
    queryFn: () => fetchQuestionList(normalizedParams.value),
  })
}
