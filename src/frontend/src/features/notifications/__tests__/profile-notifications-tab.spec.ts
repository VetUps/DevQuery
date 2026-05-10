import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { NotificationItem, NotificationListStatus, PaginatedNotificationResponse } from '@/features/notifications/api/notifications'
import { parseNotificationEnvelope } from '@/features/notifications/api/notifications'
import ProfileNotificationsTab from '@/features/notifications/components/ProfileNotificationsTab.vue'

const queryHarness = vi.hoisted(() => {
  const state = {
    pages: [] as PaginatedNotificationResponse[],
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    statusRef: null as { value: NotificationListStatus } | null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }

  const query = {
    data: { get value() { return { pages: state.pages } } },
    pages: { get value() { return state.pages } },
    notifications: { get value() { return state.pages.flatMap((page) => page.results) } },
    totalCount: { get value() { return state.pages[0]?.count ?? 0 } },
    hasLoadedPages: { get value() { return state.pages.length > 0 } },
    hasLoadedNotifications: { get value() { return state.pages.some((page) => page.results.length > 0) } },
    isInitialLoading: { get value() { return state.isPending && state.pages.length === 0 } },
    isInitialError: { get value() { return state.isError && state.pages.length === 0 } },
    isStaleError: { get value() { return state.isError && state.pages.length > 0 } },
    isLoadMorePending: { get value() { return state.isFetchingNextPage } },
    isLoadMoreError: { get value() { return state.isFetchNextPageError } },
    isPending: { get value() { return state.isPending } },
    isError: { get value() { return state.isError } },
    isFetchingNextPage: { get value() { return state.isFetchingNextPage } },
    isFetchNextPageError: { get value() { return state.isFetchNextPageError } },
    hasNextPage: { get value() { return state.hasNextPage } },
    refetch: state.refetch,
    fetchNextPage: state.fetchNextPage,
  }

  return { state, query }
})

const mutationState = vi.hoisted(() => ({
  markOne: {
    isPending: { value: false },
    mutateAsync: vi.fn(),
  },
  markAll: {
    isPending: { value: false },
    mutateAsync: vi.fn(),
  },
}))

const useProfileNotificationsQueryMock = vi.hoisted(() => vi.fn((status: { value: NotificationListStatus }) => {
  queryHarness.state.statusRef = status

  return queryHarness.query
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useProfileNotificationsQuery: useProfileNotificationsQueryMock,
}))

vi.mock('@/features/notifications/mutations/useMarkNotificationReadMutation', () => ({
  useMarkNotificationReadMutation: vi.fn(() => mutationState.markOne),
  useMarkAllNotificationsReadMutation: vi.fn(() => mutationState.markAll),
}))

const mountedWrappers: VueWrapper[] = []

function buildNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: '11111111-1111-4111-8111-111111111111',
    notification_type: 'expert_invitation',
    title: 'Вас пригласили ответить',
    message: 'Новый защищённый вопрос ждёт экспертного ответа.',
    payload: {
      question_title: 'Как типизировать Vue Query?',
      question_tags: ['vue', 'typescript'],
      author_name: 'Ada',
      invitation_status: 'expired',
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

function buildEnvelope(
  results: NotificationItem[] = [buildNotification()],
  overrides: Partial<PaginatedNotificationResponse> = {},
): PaginatedNotificationResponse {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
    ...overrides,
  }
}

async function mountTab() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', component: { template: '<div />' } },
      { path: '/questions/:id', component: { template: '<div />' } },
    ],
  })

  await router.push('/profile')
  await router.isReady()

  const wrapper = mount(ProfileNotificationsTab, {
    global: {
      plugins: [router],
    },
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return { wrapper, router }
}

function setQueryState(overrides: Partial<typeof queryHarness.state> = {}) {
  queryHarness.state.pages = []
  queryHarness.state.isPending = false
  queryHarness.state.isError = false
  queryHarness.state.isFetchingNextPage = false
  queryHarness.state.isFetchNextPageError = false
  queryHarness.state.hasNextPage = false
  queryHarness.state.statusRef = null
  queryHarness.state.refetch.mockReset()
  queryHarness.state.fetchNextPage.mockReset()
  queryHarness.state.fetchNextPage.mockResolvedValue(undefined)

  Object.assign(queryHarness.state, overrides)
}

function currentStatus() {
  return queryHarness.state.statusRef?.value
}

describe('ProfileNotificationsTab', () => {
  beforeEach(() => {
    setQueryState()
    useProfileNotificationsQueryMock.mockClear()
    mutationState.markOne.isPending.value = false
    mutationState.markOne.mutateAsync.mockReset()
    mutationState.markOne.mutateAsync.mockResolvedValue(buildNotification({ is_read: true, read_at: '2026-05-08T11:00:00Z' }))
    mutationState.markAll.isPending.value = false
    mutationState.markAll.mutateAsync.mockReset()
    mutationState.markAll.mutateAsync.mockResolvedValue({ marked_count: 1, unread_count: 0 })
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('renders accessible all/unread filters and switches the status ref without remounting the query', async () => {
    setQueryState({ pages: [buildEnvelope()] })

    const { wrapper } = await mountTab()

    expect(useProfileNotificationsQueryMock).toHaveBeenCalledOnce()
    expect(currentStatus()).toBe('all')
    expect(wrapper.get('[data-testid="notifications-filter-all"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="notifications-filter-unread"]').attributes('aria-pressed')).toBe('false')

    await wrapper.get('[data-testid="notifications-filter-unread"]').trigger('click')

    expect(currentStatus()).toBe('unread')
    expect(wrapper.get('[data-testid="notifications-filter-all"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="notifications-filter-unread"]').attributes('aria-pressed')).toBe('true')
  })

  it('renders a localized loading state while notifications are loading', async () => {
    setQueryState({ isPending: true })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-loading"]').text()).toContain('Загружаем уведомления')
    expect(wrapper.text()).toContain('Проверяем новые приглашения')
  })

  it('renders localized empty states for all and unread filters', async () => {
    setQueryState({ pages: [buildEnvelope([])] })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-empty"]').text()).toContain('Уведомлений пока нет')

    await wrapper.get('[data-testid="notifications-filter-unread"]').trigger('click')

    expect(wrapper.get('[data-testid="notifications-empty"]').text()).toContain('Непрочитанных уведомлений нет')
    expect(wrapper.text()).toContain('Переключитесь на все уведомления')
  })

  it('renders an API/parser error with a retry affordance', async () => {
    setQueryState({ isError: true })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-error"]').text()).toContain('Не удалось загрузить уведомления')

    await wrapper.get('[data-testid="notifications-error"] button').trigger('click')

    expect(queryHarness.state.refetch).toHaveBeenCalledOnce()
  })

  it('renders active unread invitation cards from top-level status and curated question context', async () => {
    setQueryState({ pages: [buildEnvelope()] })

    const { wrapper } = await mountTab()
    const card = wrapper.get('[data-testid="notification-card"]')

    expect(card.classes()).toContain('notification-card--unread')
    expect(card.get('[data-testid="unread-badge"]').text()).toContain('Новое')
    expect(card.get('[data-testid="invitation-status-badge"]').text()).toContain('Приглашение активно')
    expect(card.get('[data-testid="invitation-help"]').text()).toContain('Защищённое окно активно до')
    expect(card.get('[data-testid="question-context"]').text()).toContain('Как типизировать Vue Query?')
    expect(card.text()).toContain('Ada')
    expect(card.text()).toContain('vue')
    expect(card.text()).not.toContain('Приглашение истекло')
  })

  it('renders read cards without a mark-read action and disables mark-all when no unread notifications are loaded', async () => {
    setQueryState({
      pages: [buildEnvelope([buildNotification({ is_read: true, read_at: '2026-05-08T11:00:00Z' })])],
    })

    const { wrapper } = await mountTab()
    const card = wrapper.get('[data-testid="notification-card"]')

    expect(card.classes()).toContain('notification-card--read')
    expect(card.get('[data-testid="read-badge"]').text()).toContain('Прочитано')
    expect(card.find('[data-testid="mark-read-button"]').exists()).toBe(false)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="mark-all-read-button"]').element.disabled).toBe(true)
  })

  it('renders expired invitation copy even when the card is still unread and suppresses the question CTA', async () => {
    setQueryState({
      pages: [buildEnvelope([
        buildNotification({ invitation_status: 'expired', is_expired: true, protected_window_active: false }),
      ])],
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="invitation-status-badge"]').text()).toContain('Приглашение истекло')
    expect(wrapper.get('[data-testid="invitation-help"]').text()).toContain('Срок приглашения истёк')
    expect(wrapper.get('[data-testid="notification-cta-unavailable"]').text()).toContain('Переход к вопросу недоступен')
    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(true)
  })

  it('renders protected-window-ended copy separately from expiration and suppresses the question CTA', async () => {
    setQueryState({
      pages: [buildEnvelope([
        buildNotification({
          invitation_status: 'protected_ended',
          is_expired: false,
          protected_window_active: false,
          protected_window_ended: true,
        }),
      ])],
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="invitation-status-badge"]').text()).toContain('Окно защиты завершено')
    expect(wrapper.get('[data-testid="invitation-help"]').text()).toContain('Защищённое окно завершено')
    expect(wrapper.get('[data-testid="notification-cta-unavailable"]').text()).toContain('Переход к вопросу недоступен')
    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Срок приглашения истёк')
  })

  it('renders unavailable and malformed-context copy without trusting missing payload fields', async () => {
    setQueryState({
      pages: [buildEnvelope([
        buildNotification({
          payload: { question_title: null, question_tags: null },
          invitation_status: 'revoked',
          protected_window_active: false,
          protected_until: null,
          cta_url: null,
        }),
      ])],
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="invitation-status-badge"]').text()).toContain('Приглашение недоступно')
    expect(wrapper.get('[data-testid="missing-context"]').text()).toContain('Детали вопроса недоступны')
    expect(wrapper.get('[data-testid="notification-cta-unavailable"]').text()).toContain('Переход к вопросу недоступен')
    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
  })

  it('marks an unread notification read through the mutation and disables only while pending', async () => {
    setQueryState({ pages: [buildEnvelope()] })
    let resolveMutation!: (value: NotificationItem) => void
    mutationState.markOne.mutateAsync.mockImplementation(() => {
      mutationState.markOne.isPending.value = true

      return new Promise<NotificationItem>((resolve) => {
        resolveMutation = resolve
      }).finally(() => {
        mutationState.markOne.isPending.value = false
      })
    })

    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="mark-read-button"]').trigger('click')
    await nextTick()

    const pendingButton = wrapper.get<HTMLButtonElement>('[data-testid="mark-read-button"]')
    expect(pendingButton.element.disabled).toBe(true)
    expect(pendingButton.text()).toContain('Отмечаем…')
    expect(mutationState.markOne.mutateAsync).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')

    resolveMutation(buildNotification({ is_read: true }))
    await flushPromises()

    const settledButton = wrapper.get<HTMLButtonElement>('[data-testid="mark-read-button"]')
    expect(settledButton.element.disabled).toBe(false)
    expect(settledButton.text()).toContain('Отметить прочитанным')
  })

  it('keeps unread state and shows action error when mark-read fails', async () => {
    setQueryState({ pages: [buildEnvelope()] })
    mutationState.markOne.mutateAsync.mockRejectedValue(new Error('PATCH timeout'))

    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="mark-read-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="unread-badge"]').text()).toContain('Новое')
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mark-read-error"]').text()).toContain('Не удалось отметить уведомление прочитанным')
  })

  it('enables mark-all when one loaded card is unread and calls the server-confirmed mutation without payload data', async () => {
    setQueryState({
      pages: [buildEnvelope([
        buildNotification({ notification_id: '11111111-1111-4111-8111-111111111111', is_read: true, read_at: '2026-05-08T11:00:00Z' }),
        buildNotification({ notification_id: '55555555-5555-4555-8555-555555555555', is_read: false }),
      ])],
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get<HTMLButtonElement>('[data-testid="mark-all-read-button"]').element.disabled).toBe(false)

    await wrapper.get('[data-testid="mark-all-read-button"]').trigger('click')
    await flushPromises()

    expect(mutationState.markAll.mutateAsync).toHaveBeenCalledOnce()
    expect(mutationState.markAll.mutateAsync).toHaveBeenCalledWith()
  })

  it('shows localized mark-all failure without hiding unread actions', async () => {
    setQueryState({ pages: [buildEnvelope()] })
    mutationState.markAll.mutateAsync.mockRejectedValue(new Error('PATCH timeout'))

    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="mark-all-read-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="mark-all-error"]').text()).toContain('Не удалось отметить все уведомления')
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(true)
  })

  it('disables mark-all while the server-confirmed mutation is pending', async () => {
    setQueryState({ pages: [buildEnvelope()] })
    mutationState.markAll.isPending.value = true

    const { wrapper } = await mountTab()

    const pendingButton = wrapper.get<HTMLButtonElement>('[data-testid="mark-all-read-button"]')
    expect(pendingButton.element.disabled).toBe(true)
    expect(pendingButton.text()).toContain('Отмечаем…')
  })

  it('appends loaded pages and triggers explicit load-more when a next page exists', async () => {
    setQueryState({
      pages: [
        buildEnvelope([buildNotification({ notification_id: '11111111-1111-4111-8111-111111111111', title: 'Первое уведомление' })], { count: 2, next: 'http://api.test/notifications/?page=2' }),
        buildEnvelope([buildNotification({ notification_id: '55555555-5555-4555-8555-555555555555', title: 'Второе уведомление' })], { count: 2 }),
      ],
      hasNextPage: true,
    })

    const { wrapper } = await mountTab()

    expect(wrapper.findAll('[data-testid="notification-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Первое уведомление')
    expect(wrapper.text()).toContain('Второе уведомление')

    await wrapper.get('[data-testid="notifications-load-more-button"]').trigger('click')

    expect(queryHarness.state.fetchNextPage).toHaveBeenCalledOnce()
  })

  it('keeps loaded cards visible and offers retry copy during load-more failures and pending states', async () => {
    setQueryState({
      pages: [buildEnvelope([buildNotification({ title: 'Уже загружено' })], { count: 2, next: 'http://api.test/notifications/?page=2' })],
      hasNextPage: true,
      isFetchNextPageError: true,
      isFetchingNextPage: true,
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notification-card"]').text()).toContain('Уже загружено')
    expect(wrapper.get('[data-testid="notifications-load-more-error"]').text()).toContain('Уже загруженные уведомления сохранены')
    const loadMore = wrapper.get<HTMLButtonElement>('[data-testid="notifications-load-more-button"]')
    expect(loadMore.element.disabled).toBe(true)
    expect(loadMore.text()).toContain('Загружаем…')
  })

  it('renders an explicit no-next-page diagnostic when the history is exhausted', async () => {
    setQueryState({ pages: [buildEnvelope()] })

    const { wrapper } = await mountTab()

    expect(wrapper.find('[data-testid="notifications-load-more-button"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="notifications-no-next-page"]').text()).toContain('Больше уведомлений нет')
  })

  it('renders unavailable CTA copy for parser-normalized malformed and foreign CTA values', async () => {
    const parsed = parseNotificationEnvelope({
      count: 2,
      next: null,
      previous: null,
      results: [
        { ...buildNotification(), notification_id: '33333333-3333-4333-8333-333333333333', cta_url: 'https://evil.test/phish' },
        { ...buildNotification(), notification_id: '44444444-4444-4444-8444-444444444444', cta_url: '/admin' },
      ],
    })
    setQueryState({ pages: [parsed] })

    const { wrapper } = await mountTab()

    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
    const unavailableCtas = wrapper.findAll('[data-testid="notification-cta-unavailable"]')
    expect(unavailableCtas).toHaveLength(2)
    expect(unavailableCtas.every((cta) => cta.text().includes('Переход к вопросу недоступен'))).toBe(true)
  })

  it('shows stale refresh errors without hiding cached notification cards', async () => {
    setQueryState({ pages: [buildEnvelope()], isError: true })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-stale-error"]').text()).toContain('Не удалось обновить список')
    expect(wrapper.get('[data-testid="notification-card"]').text()).toContain('Вас пригласили ответить')
    expect(wrapper.find('[data-testid="notifications-error"]').exists()).toBe(false)
  })

  it('renders a router CTA using the backend-provided href', async () => {
    setQueryState({ pages: [buildEnvelope()] })

    const { wrapper } = await mountTab()
    const cta = wrapper.get('[data-testid="notification-cta"]')

    expect(cta.text()).toContain('Перейти к вопросу')
    expect(cta.attributes('href')).toBe('/questions/22222222-2222-4222-8222-222222222222')
  })
})
