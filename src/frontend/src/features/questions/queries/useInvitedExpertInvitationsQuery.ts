// Кратко: выполняет запросы к backend и нормализует ответ.
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchInvitedExpertInvitations } from '@/features/questions/api/questionExpertInvitations'

export function normalizeInvitedExpertInvitationsQuestionId(questionId: string) {
  return questionId.trim()
}

export function buildInvitedExpertInvitationsQueryKey(questionId: string) {
  return ['questions', 'invited-experts', normalizeInvitedExpertInvitationsQuestionId(questionId)] as const
}

export function useInvitedExpertInvitationsQuery(
  questionId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const normalizedQuestionId = computed(() => normalizeInvitedExpertInvitationsQuestionId(toValue(questionId)))
  const isEnabled = computed(() => Boolean(toValue(enabled)) && normalizedQuestionId.value.length > 0)

  return useQuery({
    queryKey: computed(() => buildInvitedExpertInvitationsQueryKey(normalizedQuestionId.value)),
    enabled: isEnabled,
    queryFn: () => fetchInvitedExpertInvitations(normalizedQuestionId.value),
  })
}
