import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'

import { queryClient } from '@/app/query-client'
import { createAppRouter } from '@/app/router'
import { fetchProfile, type UserProfile } from '@/features/auth/api/auth'
import { REFRESH_TOKEN_STORAGE_KEY } from '@/features/auth/libs/token-storage'
import { useSessionStore } from '@/features/auth/stores/session'

vi.mock('@/features/auth/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/api/auth')>()

  return {
    ...actual,
    fetchProfile: vi.fn(),
    requestTokenRefresh: vi.fn(),
  }
})

const mockedFetchProfile = vi.mocked(fetchProfile)

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'user-1',
    user_name: 'Sergey',
    user_email: 'sergey@example.com',
    user_role: 'user',
    user_reputation_score: 128,
    user_avatar_url: null,
    user_bio: null,
    user_created_at: '2026-04-01T09:15:00Z',
    reputation: {
      score: 128,
      level: 'expert',
      level_label: 'Эксперт',
      level_minimum_score: 100,
      is_manual_override: false,
      manual_level: null,
      next_level: 'master',
      next_level_label: 'Мастер',
      next_level_minimum_score: 300,
      points_to_next_level: 172,
    },
    reputation_ledger: [],
    ...overrides,
  }
}

describe('admin route guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    queryClient.clear()
    mockedFetchProfile.mockReset()
  })

  it('redirects guests from /admin through the existing login flow', async () => {
    const router = createAppRouter(createMemoryHistory())

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(mockedFetchProfile).not.toHaveBeenCalled()
  })

  it('redirects expired stored sessions from /admin with the session-expired message', async () => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'expired-refresh-token')
    const router = createAppRouter(createMemoryHistory())

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ message: 'session-expired' })
    expect(mockedFetchProfile).not.toHaveBeenCalled()
  })

  it('allows admin profiles to enter /admin with one current-user profile read', async () => {
    const sessionStore = useSessionStore()
    sessionStore.setSession({ access: 'admin-access-token', refresh: 'admin-refresh-token' })
    mockedFetchProfile.mockResolvedValueOnce(buildProfile({ user_role: 'admin' }))

    const router = createAppRouter(createMemoryHistory())

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/admin')
    expect(mockedFetchProfile).toHaveBeenCalledTimes(1)
    expect(mockedFetchProfile).toHaveBeenCalledWith('admin-access-token')
  })

  it('redirects ordinary users away from /admin with an admin-required message', async () => {
    const sessionStore = useSessionStore()
    sessionStore.setSession({ access: 'user-access-token', refresh: 'user-refresh-token' })
    mockedFetchProfile.mockResolvedValueOnce(buildProfile({ user_role: 'user' }))

    const router = createAppRouter(createMemoryHistory())

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/profile')
    expect(router.currentRoute.value.query).toEqual({ message: 'admin-required' })
  })

  it('denies /admin when the current-user profile cannot be verified', async () => {
    const sessionStore = useSessionStore()
    sessionStore.setSession({ access: 'broken-access-token', refresh: 'broken-refresh-token' })
    mockedFetchProfile.mockRejectedValueOnce(new Error('Malformed auth response: user_role'))

    const router = createAppRouter(createMemoryHistory())

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/profile')
    expect(router.currentRoute.value.query).toEqual({ message: 'admin-required' })
    expect(mockedFetchProfile).toHaveBeenCalledTimes(1)
  })
})
