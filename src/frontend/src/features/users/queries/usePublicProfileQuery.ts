import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchPublicProfile } from '@/features/users/api/publicProfiles'

export function usePublicProfileQuery(userId: MaybeRefOrGetter<string>) {
  const normalizedUserId = computed(() => toValue(userId).trim())

  return useQuery({
    queryKey: computed(() => ['users', 'public-profile', normalizedUserId.value]),
    enabled: computed(() => Boolean(normalizedUserId.value)),
    queryFn: () => fetchPublicProfile(normalizedUserId.value),
  })
}
