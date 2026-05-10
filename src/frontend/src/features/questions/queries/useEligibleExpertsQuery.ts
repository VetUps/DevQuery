import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchEligibleExperts } from '@/features/questions/api/questionExpertInvitations'

export function normalizeEligibleExpertsSearch(search: string) {
  return search.trim()
}

export function buildEligibleExpertsBaseQueryKey(questionId: string) {
  return ['questions', 'eligible-experts', questionId] as const
}

export function buildEligibleExpertsQueryKey(questionId: string, search = '') {
  return [...buildEligibleExpertsBaseQueryKey(questionId), normalizeEligibleExpertsSearch(search)] as const
}

export function useEligibleExpertsQuery(
  questionId: MaybeRefOrGetter<string>,
  search: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const normalizedQuestionId = computed(() => toValue(questionId).trim())
  const normalizedSearch = computed(() => normalizeEligibleExpertsSearch(toValue(search)))
  const isEnabled = computed(() => Boolean(toValue(enabled)) && normalizedQuestionId.value.length > 0)

  return useQuery({
    queryKey: computed(() => buildEligibleExpertsQueryKey(normalizedQuestionId.value, normalizedSearch.value)),
    enabled: isEnabled,
    queryFn: () => fetchEligibleExperts(normalizedQuestionId.value, { search: normalizedSearch.value }),
  })
}
