// Кратко: выполняет запросы к backend и нормализует ответ.
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchQuestionRevisions } from '@/features/questions/api/questionRevisions'

export function normalizeQuestionRevisionQueryId(questionId: string) {
  return questionId.trim()
}

export function buildQuestionRevisionsQueryKey(questionId: string) {
  return ['questions', 'detail', normalizeQuestionRevisionQueryId(questionId), 'revisions'] as const
}

export function useQuestionRevisionsQuery(questionId: MaybeRefOrGetter<string>) {
  const normalizedQuestionId = computed(() => normalizeQuestionRevisionQueryId(toValue(questionId)))

  return useQuery({
    queryKey: computed(() => buildQuestionRevisionsQueryKey(normalizedQuestionId.value)),
    enabled: computed(() => Boolean(normalizedQuestionId.value)),
    queryFn: () => fetchQuestionRevisions(normalizedQuestionId.value),
  })
}
