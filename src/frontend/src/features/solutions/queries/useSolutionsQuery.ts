import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchSolutions } from '@/features/solutions/api/solutions'

export function useSolutionsQuery(questionId: MaybeRefOrGetter<string>) {
  const normalizedQuestionId = computed(() => toValue(questionId).trim())

  return useQuery({
    queryKey: computed(() => ['solutions', 'list', normalizedQuestionId.value]),
    enabled: computed(() => Boolean(normalizedQuestionId.value)),
    queryFn: async () => {
      const response = await fetchSolutions(normalizedQuestionId.value)
      return response.results
    },
  })
}
