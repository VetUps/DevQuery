import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { refreshSession } from '@/features/auth/libs/refresh-session'
import { loadStoredTokens, type StoredTokens } from '@/features/auth/libs/token-storage'

import { apiBaseUrl } from './config'

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

interface RegisteredSessionHandlers {
  getSessionSnapshot: () => StoredTokens
  onRefreshSuccess: (tokens: { access: string; refresh: string }) => void
  onRefreshFailure: () => void
}

const defaultHandlers: RegisteredSessionHandlers = {
  getSessionSnapshot: () => loadStoredTokens(),
  onRefreshSuccess: () => undefined,
  onRefreshFailure: () => undefined,
}

let sessionHandlers = defaultHandlers
let refreshPromise: Promise<{ access: string; refresh: string }> | null = null

function isRefreshSafeUrl(url: string | undefined): boolean {
  if (!url) {
    return true
  }

  return !url.includes('/token/refresh/') && !url.includes('/user/login/') && !url.includes('/user/register/')
}

export function registerHttpSessionHandlers(handlers: Partial<RegisteredSessionHandlers>) {
  sessionHandlers = {
    ...sessionHandlers,
    ...handlers,
  }
}

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const { accessToken } = sessionHandlers.getSessionSnapshot()

  if (accessToken) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    config.headers = headers
  }

  return config
})

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined

    if (!config || error.response?.status !== 401 || config._retry || !isRefreshSafeUrl(config.url)) {
      throw error
    }

    const { refreshToken } = sessionHandlers.getSessionSnapshot()

    if (!refreshToken) {
      sessionHandlers.onRefreshFailure()
      throw error
    }

    config._retry = true

    try {
      if (!refreshPromise) {
        refreshPromise = refreshSession(refreshToken).finally(() => {
          refreshPromise = null
        })
      }

      const tokens = await refreshPromise
      sessionHandlers.onRefreshSuccess(tokens)

      const headers = AxiosHeaders.from(config.headers)
      headers.set('Authorization', `Bearer ${tokens.access}`)
      config.headers = headers

      return http.request(config)
    } catch (refreshError) {
      sessionHandlers.onRefreshFailure()
      throw refreshError
    }
  },
)
