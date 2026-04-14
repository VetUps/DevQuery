import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchMyEditHistory } from '@/features/solutions/api/solutionEdits'

export function buildMyEditHistoryQueryKey() {
  return ['solution-edits', 'my-history'] as const
}

export function useMyEditHistoryQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: buildMyEditHistoryQueryKey(),
    enabled: computed(() => Boolean(toValue(enabled))),
    queryFn: fetchMyEditHistory,
  })
}
