import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'

import { createAppRouter } from '@/app/router'
import { useSessionStore } from '@/features/auth/stores/session'
import AppHeader from '@/widgets/app-header/AppHeader.vue'

async function mountHeader() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  await router.isReady()

  const wrapper = mount(AppHeader, {
    global: {
      plugins: [pinia, router],
    },
  })

  return { wrapper, router }
}

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows guest navigation actions', async () => {
    const { wrapper } = await mountHeader()

    expect(wrapper.text()).toContain('Создать аккаунт')
    expect(wrapper.text()).toContain('Войти')
    expect(wrapper.text()).not.toContain('Профиль')
  })

  it('shows authenticated navigation and logout flow', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const sessionStore = useSessionStore()
    sessionStore.setSession({
      access: 'test-access-token',
      refresh: 'test-refresh-token',
    })

    const logoutSpy = vi.spyOn(sessionStore, 'logout').mockResolvedValue(undefined)
    const router = createAppRouter(createMemoryHistory())

    await router.push('/profile')
    await router.isReady()

    const wrapper = mount(AppHeader, {
      global: {
        plugins: [pinia, router],
      },
    })

    expect(wrapper.text()).toContain('Главная')

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')

    expect(wrapper.text()).toContain('Профиль')
    expect(wrapper.text()).toContain('Проверка правок')
    expect(wrapper.text()).toContain('Выйти')
    expect(wrapper.find('[data-testid="future-placeholder"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="review-menu-link"]').attributes('href')).toBe('/profile?tab=review')

    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()

    expect(logoutSpy).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
