import { requestTokenRefresh, type AuthTokens } from '@/features/auth/api/auth'

import { clearStoredTokens, loadStoredTokens, saveStoredTokens } from './token-storage'

let refreshInFlight: Promise<AuthTokens> | null = null

export async function refreshSession(currentRefreshToken?: string | null): Promise<AuthTokens> {
  const refreshToken = currentRefreshToken ?? loadStoredTokens().refreshToken

  if (!refreshToken) {
    clearStoredTokens()
    throw new Error('missing-refresh-token')
  }

  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = requestTokenRefresh(refreshToken)
    .then((tokens) => {
      saveStoredTokens(tokens)
      return tokens
    })
    .catch((error) => {
      clearStoredTokens()
      throw error
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}
