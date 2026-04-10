import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchPublicSolutionEditHistory } from '@/features/solutions/api/solutionEdits'

export function buildPublicSolutionEditHistoryQueryKey(solutionId: string) {
  return ['solution-edits', 'public-history', solutionId] as const
}

export function usePublicSolutionEditHistoryQuery(
  solutionId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const normalizedSolutionId = computed(() => toValue(solutionId).trim())

  return useQuery({
    queryKey: computed(() => buildPublicSolutionEditHistoryQueryKey(normalizedSolutionId.value)),
    enabled: computed(() => Boolean(normalizedSolutionId.value) && Boolean(toValue(enabled))),
    queryFn: () => fetchPublicSolutionEditHistory(normalizedSolutionId.value),
  })
}
