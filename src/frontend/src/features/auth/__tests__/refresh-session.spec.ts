import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestTokenRefresh } from '@/features/auth/api/auth'
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from '@/features/auth/libs/token-storage'

const requestTokenRefreshMock = vi.mocked(requestTokenRefresh)

vi.mock('@/features/auth/api/auth', () => ({
  requestTokenRefresh: vi.fn(),
}))

describe('refreshSession', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('coalesces concurrent refresh attempts so rotated refresh tokens are used once', async () => {
    requestTokenRefreshMock.mockResolvedValueOnce({
      access: 'next-access-token',
      refresh: 'next-refresh-token',
    })

    const { refreshSession } = await import('@/features/auth/libs/refresh-session')

    const [first, second] = await Promise.all([
      refreshSession('stale-refresh-token'),
      refreshSession('stale-refresh-token'),
    ])

    expect(requestTokenRefreshMock).toHaveBeenCalledOnce()
    expect(requestTokenRefreshMock).toHaveBeenCalledWith('stale-refresh-token')
    expect(first).toEqual({ access: 'next-access-token', refresh: 'next-refresh-token' })
    expect(second).toEqual(first)
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe('next-access-token')
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('next-refresh-token')
  })

  it('clears stored tokens when the shared refresh attempt fails', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'expired-access-token')
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'expired-refresh-token')
    requestTokenRefreshMock.mockRejectedValueOnce(new Error('token_not_valid'))

    const { refreshSession } = await import('@/features/auth/libs/refresh-session')

    await expect(Promise.all([
      refreshSession('expired-refresh-token'),
      refreshSession('expired-refresh-token'),
    ])).rejects.toThrow('token_not_valid')

    expect(requestTokenRefreshMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })
})
