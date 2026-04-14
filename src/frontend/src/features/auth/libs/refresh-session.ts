import { requestTokenRefresh, type AuthTokens } from '@/features/auth/api/auth'

import { clearStoredTokens, loadStoredTokens, saveStoredTokens } from './token-storage'

export async function refreshSession(currentRefreshToken?: string | null): Promise<AuthTokens> {
  const refreshToken = currentRefreshToken ?? loadStoredTokens().refreshToken

  if (!refreshToken) {
    clearStoredTokens()
    throw new Error('missing-refresh-token')
  }

  try {
    const tokens = await requestTokenRefresh(refreshToken)
    saveStoredTokens(tokens)
    return tokens
  } catch (error) {
    clearStoredTokens()
    throw error
  }
}
