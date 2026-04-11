import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import App from '@/App.vue'
import { queryClient } from '@/app/query-client'
import { createAppRouter, router } from '@/app/router'
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from '@/features/auth/libs/token-storage'
import { useSessionStore } from '@/features/auth/stores/session'

describe('frontend bootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('creates a query client instance', () => {
    expect(queryClient).toBeDefined()
    expect(typeof queryClient.getDefaultOptions).toBe('function')
  })

  it('creates a router instance', () => {
    expect(router).toBeDefined()
    expect(typeof router.push).toBe('function')
  })

  it('hydrates a stored session when the app mounts on a public route', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'saved-access-token')
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'saved-refresh-token')

    const pinia = createPinia()
    setActivePinia(pinia)

    const appRouter = createAppRouter(createMemoryHistory())
    await appRouter.push('/')
    await appRouter.isReady()

    mount(App, {
      global: {
        plugins: [pinia, appRouter],
        stubs: {
          RouterView: {
            template: '<main data-testid="router-view-stub" />',
          },
        },
      },
    })

    const sessionStore = useSessionStore()

    expect(sessionStore.accessToken).toBe('saved-access-token')
    expect(sessionStore.refreshToken).toBe('saved-refresh-token')
    expect(sessionStore.isAuthenticated).toBe(true)
  })
})
