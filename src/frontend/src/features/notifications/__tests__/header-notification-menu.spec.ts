import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { NotificationItem, NotificationSummaryResponse } from '@/features/notifications/api/notifications'
import HeaderNotificationMenu from '@/features/notifications/components/HeaderNotificationMenu.vue'
import { useNotificationSummaryQuery } from '@/features/notifications/queries/useNotificationsQuery'

const queryState = vi.hoisted(() => ({
  data: { value: undefined as NotificationSummaryResponse | undefined },
  isPending: { value: false },
  isError: { value: false },
  error: { value: null as unknown },
  refetch: vi.fn(),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationSummaryQuery: vi.fn(() => queryState),
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

function buildSummary(overrides: Partial<NotificationSummaryResponse> = {}): NotificationSummaryResponse {
  return {
    unread_count: 1,
    latest: [buildNotification()],
    ...overrides,
  }
}

function setQueryState(overrides: Partial<typeof queryState>) {
  queryState.data.value = undefined
  queryState.isPending.value = false
  queryState.isError.value = false
  queryState.error.value = null
  queryState.refetch.mockReset()

  Object.assign(queryState, overrides)
}

async function mountMenu() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/profile', component: { template: '<div />' } },
    ],
  })

  await router.push('/')
  await router.isReady()

  const wrapper = mount(HeaderNotificationMenu, {
    global: {
      plugins: [router],
    },
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return { wrapper, router }
}

async function openMenu(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="header-notification-trigger"]').trigger('click')
  await flushPromises()
}

describe('HeaderNotificationMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setQueryState({})
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it.each([
    [0, '0'],
    [1, '1'],
    [99, '99'],
    [100, '99+'],
  ])('renders unread badge boundary %i as %s', async (unreadCount, expectedText) => {
    setQueryState({ data: { value: buildSummary({ unread_count: unreadCount }) } })

    const { wrapper } = await mountMenu()

    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe(expectedText)
    expect(useNotificationSummaryQuery).toHaveBeenCalledOnce()
  })

  it('renders a localized loading preview state without latest rows', async () => {
    setQueryState({ isPending: { value: true } })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(wrapper.get('[data-testid="header-notification-loading"]').text()).toContain('Загружаем последние уведомления')
    expect(wrapper.find('[data-testid="header-notification-row"]').exists()).toBe(false)
  })

  it('renders a localized empty preview state', async () => {
    setQueryState({ data: { value: buildSummary({ unread_count: 0, latest: [] }) } })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(wrapper.get('[data-testid="header-notification-empty"]').text()).toContain('Пока ничего нового')
    expect(wrapper.find('[data-testid="header-notification-row"]').exists()).toBe(false)
  })

  it('renders initial API/parser errors with a retry affordance', async () => {
    setQueryState({
      isError: { value: true },
      error: { value: new Error('Malformed notification response: summary.latest must be an array') },
    })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(wrapper.get('[data-testid="header-notification-error"]').text()).toContain('Не удалось загрузить уведомления')

    await wrapper.get('[data-testid="header-notification-error"] button').trigger('click')

    expect(queryState.refetch).toHaveBeenCalledOnce()
  })

  it('preserves cached latest notifications and shows a stale warning after refresh errors', async () => {
    setQueryState({
      data: { value: buildSummary({ unread_count: 2 }) },
      isError: { value: true },
      error: { value: new Error('summary timeout') },
    })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(wrapper.get('[data-testid="header-notification-stale-error"]').text()).toContain('Не удалось обновить сводку')
    expect(wrapper.get('[data-testid="header-notification-row"]').text()).toContain('Вас пригласили ответить')
    expect(wrapper.find('[data-testid="header-notification-error"]').exists()).toBe(false)
  })

  it('renders latest preview rows with escaped notification copy and created time', async () => {
    setQueryState({
      data: {
        value: buildSummary({
          unread_count: 2,
          latest: [
            buildNotification({ title: '<strong>Новый ответ</strong>', message: 'Проверьте защищённый вопрос.', is_read: false }),
            buildNotification({
              notification_id: '33333333-3333-4333-8333-333333333333',
              title: 'Вопрос обновлён',
              message: 'Автор добавил детали.',
              is_read: true,
              read_at: '2026-05-08T11:00:00Z',
            }),
          ],
        }),
      },
    })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    const rows = wrapper.findAll('[data-testid="header-notification-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('<strong>Новый ответ</strong>')
    expect(rows[0]?.html()).not.toContain('<strong>Новый ответ</strong></h3>')
    expect(rows[0]?.get('[data-testid="header-notification-row-state"]').text()).toBe('Новое')
    expect(rows[1]?.get('[data-testid="header-notification-row-state"]').text()).toBe('Просмотрено')
    expect(wrapper.get('[data-testid="header-notification-latest"]').text()).toContain('08.05.2026')
  })

  it('uses the fixed profile notifications link and closes when it is clicked', async () => {
    setQueryState({ data: { value: buildSummary() } })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    const link = wrapper.get('[data-testid="header-notification-profile-link"]')
    expect(link.attributes('href')).toBe('/profile?tab=notifications')

    await link.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="header-notification-panel"]').exists()).toBe(false)
  })

  it('does not expose preview read-management controls', async () => {
    setQueryState({ data: { value: buildSummary({ unread_count: 3 }) } })

    const { wrapper } = await mountMenu()
    await openMenu(wrapper)

    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mark-all-read-button"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Отметить прочитанным')
    expect(wrapper.text()).not.toContain('Отметить все')
  })
})
