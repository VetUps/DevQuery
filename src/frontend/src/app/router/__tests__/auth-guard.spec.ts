import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'

import { createAppRouter } from '@/app/router'
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from '@/features/auth/libs/token-storage'
import { useSessionStore } from '@/features/auth/stores/session'

describe('auth guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('redirects a guest from /profile to /login without intended destination query', async () => {
    const router = createAppRouter(createMemoryHistory())

    await router.push('/profile')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.fullPath).not.toContain('redirect=')
  })

  it('allows an authenticated session to stay on /profile', async () => {
    const sessionStore = useSessionStore()
    sessionStore.setSession({
      access: 'active-access-token',
      refresh: 'active-refresh-token',
    })

    const router = createAppRouter(createMemoryHistory())

    await router.push('/profile')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('hydrates a stored session on public hard reload routes', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'saved-access-token')
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'saved-refresh-token')

    const sessionStore = useSessionStore()
    const router = createAppRouter(createMemoryHistory())

    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
    expect(sessionStore.accessToken).toBe('saved-access-token')
    expect(sessionStore.refreshToken).toBe('saved-refresh-token')
    expect(sessionStore.isAuthenticated).toBe(true)
  })
})
