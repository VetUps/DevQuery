import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'

import { createAppRouter } from '@/app/router'
import { useSessionStore } from '@/features/auth/stores/session'
import type { NotificationItem, NotificationSummaryResponse } from '@/features/notifications/api/notifications'
import { useNotificationSummaryQuery } from '@/features/notifications/queries/useNotificationsQuery'
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

const notificationQueryState = {
  data: ref<NotificationSummaryResponse | undefined>(undefined),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
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

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: '11111111-1111-4111-8111-111111111111',
    notification_type: 'expert_invitation',
    title: 'Вас пригласили ответить',
    message: 'Новый защищённый вопрос ждёт экспертного ответа.',
    payload: {
      question_title: 'Как типизировать Vue Query?',
      author_name: 'Ada',
    },
    source_question_id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-05-08T10:00:00Z',
    read_at: null,
    expires_at: '2026-05-09T10:00:00Z',
    is_read: false,
    is_expired: false,
    invitation_status: 'active',
    protected_window_active: true,
    protected_window_ended: false,
    protected_until: '2026-05-08T22:00:00Z',
    cta_url: '/questions/22222222-2222-4222-8222-222222222222',
    ...overrides,
  }
}

function makeSummary(overrides: Partial<NotificationSummaryResponse> = {}): NotificationSummaryResponse {
  return {
    unread_count: 1,
    latest: [makeNotification()],
    ...overrides,
  }
}

function setNotificationQueryState(overrides: Partial<typeof notificationQueryState> = {}) {
  notificationQueryState.data.value = undefined
  notificationQueryState.isPending.value = false
  notificationQueryState.isError.value = false
  notificationQueryState.error.value = null
  notificationQueryState.refetch.mockReset()

  Object.assign(notificationQueryState, overrides)
}

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationSummaryQuery: vi.fn(() => notificationQueryState),
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
    vi.clearAllMocks()
    currentUserState.data.value = null
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    currentUserState.refetch.mockReset()
    setNotificationQueryState()
  })

  it('shows compact guest navigation actions with the expected routes and no notification control', async () => {
    const { wrapper } = await mountHeader()

    expect(wrapper.get('[data-testid="app-header"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="ask-question-link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('[data-testid="register-link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('[data-testid="login-link"]').attributes('href')).toBe('/login')
    expect(wrapper.text()).toContain('Задать вопрос')
    expect(wrapper.text()).toContain('Создать аккаунт')
    expect(wrapper.text()).toContain('Войти')
    expect(wrapper.text()).not.toContain('Профиль')
    expect(wrapper.find('[data-testid="header-notification-menu"]').exists()).toBe(false)
    expect(useNotificationSummaryQuery).not.toHaveBeenCalled()

    const compactButtons = wrapper.findAll('.app-button--compact')
    expect(compactButtons).toHaveLength(2)
    expect(wrapper.findAll('.app-button--regular')).toHaveLength(0)
    expect(wrapper.find('[data-testid="login-link"].app-header__link--compact').exists()).toBe(true)
  })

  it('shows authenticated compact navigation, notifications, and account-menu routes without admin access for ordinary users', async () => {
    currentUserState.data.value = makeCurrentUser({ user_role: 'user' })
    setNotificationQueryState({ data: ref(makeSummary({ unread_count: 7 })) })

    const { wrapper } = await mountHeader({ authenticated: true })

    expect(wrapper.get('[data-testid="ask-question-link"]').attributes('href')).toBe('/questions/ask')
    expect(wrapper.get('[data-testid="home-link"]').attributes('href')).toBe('/')
    expect(wrapper.get('[data-testid="header-notification-menu"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('7')
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

  it.each([
    [0, '0'],
    [100, '99+'],
  ])('renders the authenticated notification unread badge boundary %i as %s', async (unreadCount, expectedText) => {
    currentUserState.data.value = makeCurrentUser()
    setNotificationQueryState({ data: ref(makeSummary({ unread_count: unreadCount })) })

    const { wrapper } = await mountHeader({ authenticated: true })

    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe(expectedText)
    expect(useNotificationSummaryQuery).toHaveBeenCalledOnce()
  })

  it('opens the notification preview with a fixed profile notifications link', async () => {
    currentUserState.data.value = makeCurrentUser()
    setNotificationQueryState({ data: ref(makeSummary()) })

    const { wrapper, router } = await mountHeader({ authenticated: true })

    await wrapper.get('[data-testid="header-notification-trigger"]').trigger('click')

    const profileLink = wrapper.get('[data-testid="header-notification-profile-link"]')
    expect(profileLink.attributes('href')).toBe('/profile?tab=notifications')
    expect(wrapper.get('[data-testid="header-notification-row"]').text()).toContain('Вас пригласили ответить')

    await profileLink.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/profile?tab=notifications')
    expect(wrapper.find('[data-testid="header-notification-panel"]').exists()).toBe(false)
  })

  it('renders notification summary errors safely with retry from the app header', async () => {
    currentUserState.data.value = makeCurrentUser()
    setNotificationQueryState({
      isError: ref(true),
      error: ref(new Error('Malformed notification summary')),
    })

    const { wrapper } = await mountHeader({ authenticated: true })

    await wrapper.get('[data-testid="header-notification-trigger"]').trigger('click')

    expect(wrapper.get('[data-testid="header-notification-error"]').text()).toContain('Не удалось загрузить уведомления')
    expect(wrapper.find('[data-testid="header-notification-row"]').exists()).toBe(false)

    await wrapper.get('[data-testid="header-notification-error"] button').trigger('click')

    expect(notificationQueryState.refetch).toHaveBeenCalledOnce()
  })

  it('keeps notification and account menu panels mutually coordinated', async () => {
    currentUserState.data.value = makeCurrentUser()
    setNotificationQueryState({ data: ref(makeSummary()) })

    const { wrapper, router } = await mountHeader({ authenticated: true })

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="account-menu-panel"]').exists()).toBe(true)

    await wrapper.get('[data-testid="header-notification-trigger"]').trigger('click')
    expect(wrapper.find('[data-testid="account-menu-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="header-notification-panel"]').exists()).toBe(true)

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="account-menu-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-notification-panel"]').exists()).toBe(false)

    await router.push('/questions/ask')
    await flushPromises()

    expect(wrapper.find('[data-testid="account-menu-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="header-notification-panel"]').exists()).toBe(false)
  })

  it('shows exactly one admin account-menu entry for administrators', async () => {
    currentUserState.data.value = makeCurrentUser({ user_role: 'admin' })
    setNotificationQueryState({ data: ref(makeSummary()) })

    const { wrapper } = await mountHeader({ authenticated: true })

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')

    const adminLinks = wrapper.findAll('[data-testid="admin-menu-link"]')
    expect(adminLinks).toHaveLength(1)
    expect(adminLinks[0].attributes('href')).toBe('/admin')
    expect(adminLinks[0].text()).toContain('Администрирование')
  })

  it('falls back to the account label and hides admin access when current-user data is missing or blank', async () => {
    currentUserState.data.value = { user_name: '   ' }
    setNotificationQueryState({ data: ref(makeSummary()) })

    const { wrapper } = await mountHeader({ authenticated: true })
    const toggle = wrapper.get('[data-testid="account-menu-toggle"]')

    expect(toggle.attributes('title')).toBe('Аккаунт')
    expect(toggle.text()).toContain('Аккаунт')

    await toggle.trigger('click')

    expect(wrapper.find('[data-testid="admin-menu-link"]').exists()).toBe(false)
  })

  it('keeps logout wired to the session store and redirects home', async () => {
    currentUserState.data.value = makeCurrentUser()
    setNotificationQueryState({ data: ref(makeSummary()) })
    const { wrapper, router, sessionStore } = await mountHeader({ authenticated: true, initialRoute: '/profile' })
    const logoutSpy = vi.spyOn(sessionStore, 'logout').mockResolvedValue(undefined)

    await wrapper.get('[data-testid="account-menu-toggle"]').trigger('click')
    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()

    expect(logoutSpy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/')
  })
})
