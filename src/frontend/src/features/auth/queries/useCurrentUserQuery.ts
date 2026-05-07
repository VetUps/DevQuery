import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useQuery } from '@tanstack/vue-query'
import { isAxiosError } from 'axios'

import { fetchProfile } from '@/features/auth/api/auth'
import { refreshSession } from '@/features/auth/libs/refresh-session'
import { useSessionStore, type SessionStore } from '@/features/auth/stores/session'

export const CURRENT_USER_QUERY_KEY = ['auth', 'profile'] as const

function isUnauthorizedError(error: unknown) {
  return isAxiosError(error) && error.response?.status === 401
}

export async function fetchCurrentUserProfileWithSession(sessionStore: SessionStore = useSessionStore()) {
  if (!sessionStore.accessToken) {
    const restored = await sessionStore.tryRestore()

    if (!restored || !sessionStore.accessToken) {
      throw new Error('missing-session')
    }
  }

  try {
    return await fetchProfile(sessionStore.accessToken)
  } catch (error) {
    if (!isUnauthorizedError(error) || !sessionStore.refreshToken) {
      throw error
    }

    try {
      const tokens = await refreshSession(sessionStore.refreshToken)
      sessionStore.setSession(tokens)
      return await fetchProfile(tokens.access)
    } catch (refreshError) {
      sessionStore.clearSession()
      throw refreshError
    }
  }
}

export function useCurrentUserQuery() {
  const sessionStore = useSessionStore()
  const { accessToken, refreshToken } = storeToRefs(sessionStore)

  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    enabled: computed(() => Boolean(accessToken.value || refreshToken.value)),
    queryFn: () => fetchCurrentUserProfileWithSession(sessionStore),
  })
}
