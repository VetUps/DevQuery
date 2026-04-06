import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useQuery } from '@tanstack/vue-query'

import { fetchProfile } from '@/features/auth/api/auth'
import { useSessionStore } from '@/features/auth/stores/session'

export function useCurrentUserQuery() {
  const sessionStore = useSessionStore()
  const { accessToken, refreshToken } = storeToRefs(sessionStore)

  return useQuery({
    queryKey: ['auth', 'profile'],
    enabled: computed(() => Boolean(accessToken.value || refreshToken.value)),
    queryFn: async () => {
      if (!sessionStore.accessToken) {
        const restored = await sessionStore.tryRestore()

        if (!restored || !sessionStore.accessToken) {
          throw new Error('missing-session')
        }
      }

      return fetchProfile(sessionStore.accessToken)
    },
  })
}
