// Кратко: выполняет запросы к backend и нормализует ответ.
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'

import { fetchTopUsersGlobal, fetchTopUsersWeekly } from '@/features/users/api/publicProfiles'

export type TopUsersPeriod = 'global' | 'weekly'

export function useTopUsersQuery(
  period: MaybeRefOrGetter<TopUsersPeriod>,
  page: MaybeRefOrGetter<number>
) {
  const normalizedPeriod = computed(() => toValue(period))
  const normalizedPage = computed(() => {
    const p = toValue(page)
    return p > 0 ? p : 1
  })

  return useQuery({
    queryKey: computed(() => ['users', 'top', normalizedPeriod.value, normalizedPage.value]),
    placeholderData: keepPreviousData,
    queryFn: () => {
      if (normalizedPeriod.value === 'weekly') {
        return fetchTopUsersWeekly(normalizedPage.value)
      }
      return fetchTopUsersGlobal(normalizedPage.value)
    },
  })
}
