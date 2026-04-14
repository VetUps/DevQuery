export const ACCESS_TOKEN_STORAGE_KEY = 'so2.accessToken'
export const REFRESH_TOKEN_STORAGE_KEY = 'so2.refreshToken'

export interface StoredTokens {
  accessToken: string | null
  refreshToken: string | null
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export function loadStoredTokens(): StoredTokens {
  const storage = getStorage()

  if (!storage) {
    return {
      accessToken: null,
      refreshToken: null,
    }
  }

  return {
    accessToken: storage.getItem(ACCESS_TOKEN_STORAGE_KEY),
    refreshToken: storage.getItem(REFRESH_TOKEN_STORAGE_KEY),
  }
}

export function saveStoredTokens(tokens: { access: string; refresh: string }): void {
  const storage = getStorage()

  if (!storage) {
    return
  }

  storage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.access)
  storage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh)
}

export function clearStoredTokens(): void {
  const storage = getStorage()

  if (!storage) {
    return
  }

  storage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  storage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
}
