import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { PaginatedNotificationResponse, NotificationItem } from '@/features/notifications/api/notifications'
import { parseNotificationEnvelope } from '@/features/notifications/api/notifications'
import ProfileNotificationsTab from '@/features/notifications/components/ProfileNotificationsTab.vue'

const queryState = vi.hoisted(() => ({
  data: { value: undefined as PaginatedNotificationResponse | undefined },
  isPending: { value: false },
  isError: { value: false },
  error: { value: null as unknown },
  refetch: vi.fn(),
}))

const mutationState = vi.hoisted(() => ({
  isPending: { value: false },
  mutateAsync: vi.fn(),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => queryState),
}))

vi.mock('@/features/notifications/mutations/useMarkNotificationReadMutation', () => ({
  useMarkNotificationReadMutation: vi.fn(() => mutationState),
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

function buildEnvelope(results: NotificationItem[] = [buildNotification()]): PaginatedNotificationResponse {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
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

function setQueryState(overrides: Partial<typeof queryState>) {
  queryState.data.value = undefined
  queryState.isPending.value = false
  queryState.isError.value = false
  queryState.error.value = null
  queryState.refetch.mockReset()

  Object.assign(queryState, overrides)
}

describe('ProfileNotificationsTab', () => {
  beforeEach(() => {
    setQueryState({})
    mutationState.isPending.value = false
    mutationState.mutateAsync.mockReset()
    mutationState.mutateAsync.mockResolvedValue(buildNotification({ is_read: true, read_at: '2026-05-08T11:00:00Z' }))
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('renders a localized loading state while notifications are loading', async () => {
    setQueryState({ isPending: { value: true } })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-loading"]').text()).toContain('Загружаем уведомления')
    expect(wrapper.text()).toContain('Проверяем новые приглашения')
  })

  it('renders a localized empty state when the recipient has no notifications', async () => {
    setQueryState({ data: { value: buildEnvelope([]) } })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-empty"]').text()).toContain('Уведомлений пока нет')
    expect(wrapper.text()).toContain('пригласят помочь')
  })

  it('renders an API/parser error with a retry affordance', async () => {
    setQueryState({ isError: { value: true }, error: { value: new Error('Malformed notification response') } })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-error"]').text()).toContain('Не удалось загрузить уведомления')

    await wrapper.get('[data-testid="notifications-error"] button').trigger('click')

    expect(queryState.refetch).toHaveBeenCalledOnce()
  })

  it('renders active unread invitation cards from top-level status and curated question context', async () => {
    setQueryState({ data: { value: buildEnvelope() } })

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

  it('renders read cards without a mark-read action', async () => {
    setQueryState({
      data: { value: buildEnvelope([buildNotification({ is_read: true, read_at: '2026-05-08T11:00:00Z' })]) },
    })

    const { wrapper } = await mountTab()
    const card = wrapper.get('[data-testid="notification-card"]')

    expect(card.classes()).toContain('notification-card--read')
    expect(card.get('[data-testid="read-badge"]').text()).toContain('Прочитано')
    expect(card.find('[data-testid="mark-read-button"]').exists()).toBe(false)
  })

  it('renders expired invitation copy even when the card is still unread', async () => {
    setQueryState({
      data: {
        value: buildEnvelope([
          buildNotification({ invitation_status: 'expired', is_expired: true, protected_window_active: false }),
        ]),
      },
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="invitation-status-badge"]').text()).toContain('Приглашение истекло')
    expect(wrapper.get('[data-testid="invitation-help"]').text()).toContain('Срок приглашения истёк')
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(true)
  })

  it('renders protected-window-ended copy separately from expiration', async () => {
    setQueryState({
      data: {
        value: buildEnvelope([
          buildNotification({
            invitation_status: 'protected_ended',
            is_expired: false,
            protected_window_active: false,
            protected_window_ended: true,
          }),
        ]),
      },
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="invitation-status-badge"]').text()).toContain('Окно защиты завершено')
    expect(wrapper.get('[data-testid="invitation-help"]').text()).toContain('Защищённое окно завершено')
    expect(wrapper.text()).not.toContain('Срок приглашения истёк')
  })

  it('renders unavailable and malformed-context copy without trusting missing payload fields', async () => {
    setQueryState({
      data: {
        value: buildEnvelope([
          buildNotification({
            payload: { question_title: null, question_tags: null },
            invitation_status: 'revoked',
            protected_window_active: false,
            protected_until: null,
            cta_url: null,
          }),
        ]),
      },
    })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="invitation-status-badge"]').text()).toContain('Приглашение недоступно')
    expect(wrapper.get('[data-testid="missing-context"]').text()).toContain('Детали вопроса недоступны')
    expect(wrapper.get('[data-testid="notification-cta-unavailable"]').text()).toContain('Переход к вопросу недоступен')
    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
  })

  it('marks an unread notification read through the mutation and disables only while pending', async () => {
    setQueryState({ data: { value: buildEnvelope() } })
    let resolveMutation!: (value: NotificationItem) => void
    mutationState.mutateAsync.mockImplementation(() => {
      mutationState.isPending.value = true

      return new Promise<NotificationItem>((resolve) => {
        resolveMutation = resolve
      }).finally(() => {
        mutationState.isPending.value = false
      })
    })

    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="mark-read-button"]').trigger('click')
    await nextTick()

    const pendingButton = wrapper.get<HTMLButtonElement>('[data-testid="mark-read-button"]')
    expect(pendingButton.element.disabled).toBe(true)
    expect(pendingButton.text()).toContain('Отмечаем…')
    expect(mutationState.mutateAsync).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')

    resolveMutation(buildNotification({ is_read: true }))
    await flushPromises()

    const settledButton = wrapper.get<HTMLButtonElement>('[data-testid="mark-read-button"]')
    expect(settledButton.element.disabled).toBe(false)
    expect(settledButton.text()).toContain('Отметить прочитанным')
  })

  it('keeps unread state and shows action error when mark-read fails', async () => {
    setQueryState({ data: { value: buildEnvelope() } })
    mutationState.mutateAsync.mockRejectedValue(new Error('PATCH timeout'))

    const { wrapper } = await mountTab()

    await wrapper.get('[data-testid="mark-read-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="unread-badge"]').text()).toContain('Новое')
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mark-read-error"]').text()).toContain('Не удалось отметить уведомление прочитанным')
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
    setQueryState({ data: { value: parsed } })

    const { wrapper } = await mountTab()

    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
    const unavailableCtas = wrapper.findAll('[data-testid="notification-cta-unavailable"]')
    expect(unavailableCtas).toHaveLength(2)
    expect(unavailableCtas.every((cta) => cta.text().includes('Переход к вопросу недоступен'))).toBe(true)
  })

  it('shows stale refresh errors without hiding cached notification cards', async () => {
    setQueryState({ data: { value: buildEnvelope() }, isError: { value: true }, error: { value: new Error('GET timeout') } })

    const { wrapper } = await mountTab()

    expect(wrapper.get('[data-testid="notifications-stale-error"]').text()).toContain('Не удалось обновить список')
    expect(wrapper.get('[data-testid="notification-card"]').text()).toContain('Вас пригласили ответить')
    expect(wrapper.find('[data-testid="notifications-error"]').exists()).toBe(false)
  })

  it('renders a router CTA using the backend-provided href', async () => {
    setQueryState({ data: { value: buildEnvelope() } })

    const { wrapper } = await mountTab()
    const cta = wrapper.get('[data-testid="notification-cta"]')

    expect(cta.text()).toContain('Перейти к вопросу')
    expect(cta.attributes('href')).toBe('/questions/22222222-2222-4222-8222-222222222222')
  })
})
