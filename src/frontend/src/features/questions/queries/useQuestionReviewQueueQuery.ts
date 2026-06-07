// Кратко: выполняет запросы к backend и нормализует ответ.
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchQuestionReviewQueue } from '@/features/questions/api/questionEdits'

export function buildQuestionReviewQueueQueryKey() {
  return ['question-edits', 'review-queue'] as const
}

export function useQuestionReviewQueueQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: buildQuestionReviewQueueQueryKey(),
    enabled: computed(() => Boolean(toValue(enabled))),
    queryFn: fetchQuestionReviewQueue,
  })
}
