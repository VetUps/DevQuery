import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { queryClient } from '@/app/query-client'
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from '@/features/auth/libs/token-storage'

const refreshSessionMock = vi.fn()

vi.mock('@/features/auth/lib/refresh-session', () => ({
  refreshSession: refreshSessionMock,
}))

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    queryClient.clear()
    refreshSessionMock.mockReset()
  })

  it('hydrates tokens from storage', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'saved-access-token')
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'saved-refresh-token')

    const { useSessionStore } = await import('@/features/auth/stores/session')
    const sessionStore = useSessionStore()
    const hydrated = sessionStore.hydrateFromStorage()

    expect(hydrated.accessToken).toBe('saved-access-token')
    expect(hydrated.refreshToken).toBe('saved-refresh-token')
    expect(sessionStore.accessToken).toBe('saved-access-token')
    expect(sessionStore.refreshToken).toBe('saved-refresh-token')
    expect(typeof sessionStore.tryRestore).toBe('function')
  })

  it('clears tokens when refresh fails during restore', async () => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'expired-refresh-token')
    refreshSessionMock.mockRejectedValueOnce(new Error('expired'))

    const { useSessionStore } = await import('@/features/auth/stores/session')
    const sessionStore = useSessionStore()
    const restored = await sessionStore.tryRestore()

    expect(restored).toBe(false)
    expect(sessionStore.accessToken).toBeNull()
    expect(sessionStore.refreshToken).toBeNull()
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })
})
