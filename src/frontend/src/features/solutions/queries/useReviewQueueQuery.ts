import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchReviewQueue } from '@/features/solutions/api/solutionEdits'

export function buildReviewQueueQueryKey() {
  return ['solution-edits', 'review-queue'] as const
}

export function useReviewQueueQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: buildReviewQueueQueryKey(),
    enabled: computed(() => Boolean(toValue(enabled))),
    queryFn: fetchReviewQueue,
  })
}
