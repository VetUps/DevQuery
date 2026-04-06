import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { queryClient } from '@/app/query-client'
import { logoutUser, type AuthTokens } from '@/features/auth/api/auth'
import { refreshSession } from '@/features/auth/lib/refresh-session'
import { clearStoredTokens, loadStoredTokens, saveStoredTokens, type StoredTokens } from '@/features/auth/lib/token-storage'
import { registerHttpSessionHandlers } from '@/shared/api/http'

type AuthStatus = 'anonymous' | 'authenticated' | 'restoring'

export const useSessionStore = defineStore('session', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const authStatus = ref<AuthStatus>('anonymous')
  const isRefreshing = ref(false)

  function applyStoredTokens(tokens: StoredTokens) {
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    authStatus.value = tokens.accessToken || tokens.refreshToken ? 'authenticated' : 'anonymous'
  }

  function setSession(tokens: AuthTokens) {
    saveStoredTokens(tokens)
    applyStoredTokens({
      accessToken: tokens.access,
      refreshToken: tokens.refresh,
    })
  }

  function clearSession() {
    clearStoredTokens()
    accessToken.value = null
    refreshToken.value = null
    authStatus.value = 'anonymous'
    isRefreshing.value = false
    queryClient.removeQueries({ queryKey: ['auth'] })
  }

  function hydrateFromStorage() {
    const tokens = loadStoredTokens()
    applyStoredTokens(tokens)
    return tokens
  }

  async function tryRestore() {
    if (isRefreshing.value) {
      return Boolean(accessToken.value || refreshToken.value)
    }

    const tokens = hydrateFromStorage()

    if (tokens.accessToken) {
      return true
    }

    if (!tokens.refreshToken) {
      clearSession()
      return false
    }

    isRefreshing.value = true
    authStatus.value = 'restoring'

    try {
      const nextTokens = await refreshSession(tokens.refreshToken)
      setSession(nextTokens)
      return true
    } catch {
      clearSession()
      return false
    } finally {
      isRefreshing.value = false
    }
  }

  async function logout() {
    const currentAccessToken = accessToken.value ?? loadStoredTokens().accessToken
    const currentRefreshToken = refreshToken.value ?? loadStoredTokens().refreshToken

    try {
      if (currentAccessToken && currentRefreshToken) {
        await logoutUser({ refresh: currentRefreshToken }, currentAccessToken)
      }
    } finally {
      clearSession()
    }
  }

  registerHttpSessionHandlers({
    getSessionSnapshot: () => ({
      accessToken: accessToken.value,
      refreshToken: refreshToken.value,
    }),
    onRefreshSuccess: (tokens) => {
      setSession(tokens)
    },
    onRefreshFailure: () => {
      clearSession()
    },
  })

  const isAuthenticated = computed(() => Boolean(accessToken.value || refreshToken.value) && authStatus.value !== 'anonymous')

  return {
    accessToken,
    refreshToken,
    authStatus,
    isRefreshing,
    isAuthenticated,
    setSession,
    clearSession,
    hydrateFromStorage,
    tryRestore,
    logout,
  }
})
