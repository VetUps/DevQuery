import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'

import { createAppRouter } from '@/app/router'
import { useSessionStore } from '@/features/auth/stores/session'
import AppHeader from '@/widgets/app-header/AppHeader.vue'

type TestCurrentUser = {
  user_id: string
  user_name: string
  user_email: string
  user_role: 'admin' | 'user'
  user_reputation_score: number
  user_created_at: string
  reputation: Record<string, unknown>
  reputation_ledger: unknown[]
}

const currentUserState = {
  data: ref<Partial<TestCurrentUser> | null>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

function makeCurrentUser(overrides: Partial<TestCurrentUser> = {}): TestCurrentUser {
  return {
    user_id: 'user-1',
    user_name: 'Пользователь',
    user_email: 'user@example.test',
    user_role: 'user',
    user_reputation_score: 25,
    user_created_at: '2024-01-01T00:00:00Z',
    reputation: {},
    reputation_ledger: [],
    ...overrides,
  }
}

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

async function mountHeader(options: { authenticated?: boolean; initialRoute?: string } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const sessionStore = useSessionStore()

  if (options.authenticated) {
    sessionStore.setSession({
      access: 'test-access-token',
      refresh: 'test-refresh-token',
    })
  }

  const router = createAppRouter(createMemoryHistory())
  await router.push(options.initialRoute ?? '/')
  await router.isReady()

  const wrapper = mount(AppHeader, {
    global: {
      plugins: [pinia, router],
    },
  })

  await flushPromises()

  return { wrapper, router, sessionStore }
}

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    currentUserState.data.value = null
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    currentUserState.refetch.mockReset()
  })

  it('shows compact guest navigation actions with the expected routes', async () => {
    const { wrapper } = await mountHeader()

    expect(wrapper.get('[data-testid="app-header"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="ask-question-link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('[data-testid="register-link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('[data-testid="login-link"]').attributes('href')).toBe('/login')
    expect(wrapper.text()).toContain('Задать вопрос')
    expect(wrapper.text()).toContain('Создать аккаунт')
    expect(wrapper.text()).toContain('Войти')
    expect(wrapper.text()).not.toContain('Профиль')

    const compactButtons = wrapper.findAll('.app-button--compact')
    expect(compactButtons).toHaveLength(2)
    expect(wrapper.findAll('.app-button--regular')).toHaveLength(0)
    expect(wrapper.find('[data-testid="login-link"].app-header__link--compact').exists()).toBe(true)
  })

  it('shows authenticated compact navigation and account-menu routes without admin access for ordinary users', async () => {
    currentUserState.data.value = makeCurrentUser({ user_role: 'user' })

    const { wrapper } = await mountHeader({ authenticated: true })

    expect(wrapper.get('[data-testid="ask-question-link"]').attributes('href')).toBe('/questions/ask')
    expect(wrapper.get('[data-testid="home-link"]').attributes('href')).toBe('/')
    expect(wrapper.text()).toContain('Задать вопрос')
    expect(wrapper.text()).toContain('Главная')
    expect(wrapper.text()).not.toContain('Создать аккаунт')
    expect(wrapper.findAll('.app-button--compact')).toHaveLength(2)
    expect(wrapper.findAll('.app-button--regular')).toHaveLength(0)
    expect(wrapper.get('[data-testid="account-menu-toggle"]').attributes('title')).toBe('Пользователь')

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')

    expect(wrapper.get('[data-testid="account-menu-panel"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="profile-menu-link"]').attributes('href')).toBe('/profile')
    expect(wrapper.get('[data-testid="review-menu-link"]').attributes('href')).toBe('/profile?tab=review')
    expect(wrapper.find('[data-testid="admin-menu-link"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Профиль')
    expect(wrapper.text()).toContain('Проверка правок')
    expect(wrapper.text()).toContain('Выйти')
    expect(wrapper.find('[data-testid="future-placeholder"]').exists()).toBe(false)
  })

  it('shows exactly one admin account-menu entry for administrators', async () => {
    currentUserState.data.value = makeCurrentUser({ user_role: 'admin' })

    const { wrapper } = await mountHeader({ authenticated: true })

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')

    const adminLinks = wrapper.findAll('[data-testid="admin-menu-link"]')
    expect(adminLinks).toHaveLength(1)
    expect(adminLinks[0].attributes('href')).toBe('/admin')
    expect(adminLinks[0].text()).toContain('Администрирование')
  })

  it('falls back to the account label and hides admin access when current-user data is missing or blank', async () => {
    currentUserState.data.value = { user_name: '   ' }

    const { wrapper } = await mountHeader({ authenticated: true })
    const toggle = wrapper.get('[data-testid="account-menu-toggle"]')

    expect(toggle.attributes('title')).toBe('Аккаунт')
    expect(toggle.text()).toContain('Аккаунт')

    await toggle.trigger('click')

    expect(wrapper.find('[data-testid="admin-menu-link"]').exists()).toBe(false)
  })

  it('keeps logout wired to the session store and redirects home', async () => {
    currentUserState.data.value = makeCurrentUser()
    const { wrapper, router, sessionStore } = await mountHeader({ authenticated: true, initialRoute: '/profile' })
    const logoutSpy = vi.spyOn(sessionStore, 'logout').mockResolvedValue(undefined)

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')
    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()

    expect(logoutSpy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/')
  })
})
