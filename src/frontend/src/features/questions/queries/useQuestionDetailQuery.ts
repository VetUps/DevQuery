import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchQuestionDetail } from '@/features/questions/api/questions'

export function useQuestionDetailQuery(questionId: MaybeRefOrGetter<string>) {
  const normalizedQuestionId = computed(() => toValue(questionId).trim())

  return useQuery({
    queryKey: computed(() => ['questions', 'detail', normalizedQuestionId.value]),
    enabled: computed(() => Boolean(normalizedQuestionId.value)),
    queryFn: () => fetchQuestionDetail(normalizedQuestionId.value),
  })
}
