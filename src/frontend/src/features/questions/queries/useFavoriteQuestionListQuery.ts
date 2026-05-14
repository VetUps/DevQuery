import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'

import { fetchFavoriteQuestionList, type QuestionListParams } from '@/features/questions/api/questions'
import { normalizeQuestionListParams } from '@/features/questions/queries/useQuestionListQuery'

export function useFavoriteQuestionListQuery(params: MaybeRefOrGetter<QuestionListParams>) {
  const normalizedParams = computed(() => normalizeQuestionListParams(toValue(params)))

  return useQuery({
    queryKey: computed(() => ['questions', 'list', 'favorites', normalizedParams.value]),
    placeholderData: keepPreviousData,
    queryFn: () => fetchFavoriteQuestionList(normalizedParams.value),
  })
}
