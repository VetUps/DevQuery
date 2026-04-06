import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'

import { fetchQuestionList } from '@/features/questions/api/questions'

export function useQuestionListQuery(page: MaybeRefOrGetter<number>) {
  const normalizedPage = computed(() => {
    const nextPage = toValue(page)

    return nextPage > 0 ? nextPage : 1
  })

  return useQuery({
    queryKey: computed(() => ['questions', 'list', { page: normalizedPage.value }]),
    placeholderData: keepPreviousData,
    queryFn: () => fetchQuestionList(normalizedPage.value),
  })
}
