import { ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { queryClient } from '@/app/query-client'
import { useSessionStore } from '@/features/auth/stores/session'
import type { NotificationItem, PaginatedNotificationResponse } from '@/features/notifications/api/notifications'
import { parseNotificationEnvelope } from '@/features/notifications/api/notifications'
import type { QuestionDetail } from '@/features/questions/api/questions'
import ProfilePage from '@/pages/ProfilePage.vue'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
import AppHeader from '@/widgets/app-header/AppHeader.vue'

const currentUserState = {
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const publicProfileState = {
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const notificationSummaryState = {
  data: ref<{ unread_count: number; latest: NotificationItem[] } | undefined>(undefined),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const profileNotificationsState = {
  data: ref({ pages: [] as PaginatedNotificationResponse[] }),
  pages: ref<PaginatedNotificationResponse[]>([]),
  notifications: ref<NotificationItem[]>([]),
  totalCount: ref(0),
  hasLoadedPages: ref(false),
  hasLoadedNotifications: ref(false),
  isInitialLoading: ref(false),
  isInitialError: ref(false),
  isStaleError: ref(false),
  isLoadMorePending: ref(false),
  isLoadMoreError: ref(false),
  isPending: ref(false),
  isError: ref(false),
  isFetchingNextPage: ref(false),
  isFetchNextPageError: ref(false),
  hasNextPage: ref(false),
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
}

const notificationsState = {
  data: ref<PaginatedNotificationResponse>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const markNotificationReadMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const markAllNotificationsReadMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const questionDetailState = {
  data: ref<QuestionDetail | null>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const solutionsState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const commentState = {
  data: ref({ comments: [], hasMore: false, count: 0 }),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const createSolutionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const inertMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const tagAutocompleteQueryState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
}

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/users/queries/usePublicProfileQuery', () => ({
  usePublicProfileQuery: vi.fn(() => publicProfileState),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => notificationsState),
  useNotificationSummaryQuery: vi.fn(() => notificationSummaryState),
  useProfileNotificationsQuery: vi.fn(() => profileNotificationsState),
}))

vi.mock('@/features/notifications/mutations/useMarkNotificationReadMutation', () => ({
  useMarkNotificationReadMutation: vi.fn(() => markNotificationReadMutationState),
  useMarkAllNotificationsReadMutation: vi.fn(() => markAllNotificationsReadMutationState),
}))

vi.mock('@/features/questions/queries/useQuestionDetailQuery', () => ({
  useQuestionDetailQuery: vi.fn(() => questionDetailState),
}))

vi.mock('@/features/solutions/queries/useSolutionsQuery', () => ({
  useSolutionsQuery: vi.fn(() => solutionsState),
}))

vi.mock('@/features/comments/queries/useCommentContextQuery', () => ({
  useCommentContextQuery: vi.fn(() => commentState),
}))

vi.mock('@/features/solutions/mutations/useCreateSolutionMutation', () => ({
  useCreateSolutionMutation: vi.fn(() => createSolutionMutationState),
}))

vi.mock('@/features/questions/mutations/useUpdateQuestionMutation', () => ({
  useUpdateQuestionMutation: vi.fn(() => inertMutationState),
}))

vi.mock('@/features/questions/mutations/useCreateQuestionEditMutation', () => ({
  useCreateQuestionEditMutation: vi.fn(() => inertMutationState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteQueryState),
}))

vi.mock('@/features/questions/queries/useEligibleExpertsQuery', () => ({
  useEligibleExpertsQuery: vi.fn(() => ({
    data: ref(undefined),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  })),
}))

vi.mock('@/features/questions/queries/useInvitedExpertInvitationsQuery', () => ({
  useInvitedExpertInvitationsQuery: vi.fn(() => ({
    data: ref(undefined),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  })),
}))

vi.mock('@/features/questions/mutations/useCreateExpertInvitationsMutation', () => ({
  useCreateExpertInvitationsMutation: vi.fn(() => inertMutationState),
}))

function buildCurrentUser(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'expert-1',
    user_name: 'Expert Alice',
    user_email: 'expert@example.test',
    user_role: 'user',
    user_reputation_score: 450,
    user_avatar_url: null,
    user_bio: null,
    user_created_at: '2026-05-08T09:00:00Z',
    reputation: {
      score: 450,
      level: 'expert',
      level_label: 'Эксперт',
      next_level: 'master',
      next_level_label: 'Мастер',
      points_to_next_level: 50,
    },
    reputation_ledger: [],
    ...overrides,
  }
}

function buildNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: '11111111-1111-4111-8111-111111111111',
    notification_type: 'expert_invitation',
    title: 'Вас пригласили ответить',
    message: 'Новый защищённый вопрос ждёт экспертного ответа.',
    payload: {
      question_title: 'Как новичку типизировать Vue Query?',
      question_tags: ['vue', 'typescript'],
      author_name: 'Newcomer Nina',
    },
    source_question_id: 'question-1',
    created_at: '2026-05-08T10:00:00Z',
    read_at: null,
    expires_at: '2026-05-09T10:00:00Z',
    is_read: false,
    is_expired: false,
    invitation_status: 'active',
    protected_window_active: true,
    protected_window_ended: false,
    protected_until: '2026-05-08T22:00:00Z',
    cta_url: '/questions/question-1',
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

function buildQuestionDetail(overrides: Partial<QuestionDetail> = {}): QuestionDetail {
  return {
    question_id: 'question-1',
    user: 'author-1',
    question_title: 'Как новичку типизировать Vue Query?',
    question_body: 'Нужно помочь новичку с защищённым вопросом и объяснить решение.',
    question_status: 'open',
    question_created_at: '2026-05-08T10:00:00Z',
    question_updated_at: '2026-05-08T10:05:00Z',
    tags: [{ name: 'vue', questions_count: 8 }],
    upvotes: 4,
    downvotes: 0,
    score: 4,
    user_vote: null,
    is_protected: true,
    protection_reason_code: 'question_protected_newcomer',
    protected_until: '2026-05-08T22:00:00Z',
    author_level: 'newcomer',
    author_points_to_next_level: 20,
    author_next_level: 'participant',
    author_next_level_label: 'Участник',
    viewer_can_answer: false,
    viewer_answer_reason_code: 'answer_blocked_insufficient_level',
    viewer_answer_reason_message: 'Отвечать сейчас могут только эксперты.',
    viewer_answer_required_level: 'expert',
    viewer_answer_required_level_label: 'Эксперт',
    viewer_level: 'participant',
    viewer_level_label: 'Участник',
    viewer_points_to_next_level: 70,
    viewer_next_level: 'expert',
    viewer_next_level_label: 'Эксперт',
    viewer_can_downvote: false,
    viewer_downvote_reason_code: 'question_downvote_blocked_protected',
    viewer_downvote_reason_message: 'В первые 12 часов после публикации у вопросов новичков отключены даунвоуты.',
    ...overrides,
  }
}

const mountedWrappers: VueWrapper[] = []

function setProfileNotifications(results: NotificationItem[], options: { staleError?: boolean; initialError?: boolean } = {}) {
  const envelope = buildEnvelope(results)

  profileNotificationsState.pages.value = options.initialError ? [] : [envelope]
  profileNotificationsState.data.value = { pages: profileNotificationsState.pages.value }
  profileNotificationsState.notifications.value = options.initialError ? [] : results
  profileNotificationsState.totalCount.value = results.length
  profileNotificationsState.hasLoadedPages.value = !options.initialError
  profileNotificationsState.hasLoadedNotifications.value = results.length > 0 && !options.initialError
  profileNotificationsState.isInitialError.value = options.initialError === true
  profileNotificationsState.isStaleError.value = options.staleError === true
  profileNotificationsState.isError.value = options.initialError === true || options.staleError === true
}

function setSummary(unreadCount: number, latest: NotificationItem[] = profileNotificationsState.notifications.value) {
  notificationSummaryState.data.value = { unread_count: unreadCount, latest }
}

function resetState() {
  queryClient.clear()
  localStorage.clear()
  vi.clearAllMocks()

  currentUserState.data.value = buildCurrentUser()
  currentUserState.isPending.value = false
  currentUserState.isError.value = false
  currentUserState.error.value = null
  currentUserState.refetch.mockReset()

  publicProfileState.data.value = buildCurrentUser({ user_id: 'author-1', user_name: 'Newcomer Nina', user_reputation_score: 20 })
  publicProfileState.isPending.value = false
  publicProfileState.isError.value = false
  publicProfileState.refetch.mockReset()

  const notification = buildNotification()
  setProfileNotifications([notification])
  setSummary(1, [notification])

  notificationSummaryState.isPending.value = false
  notificationSummaryState.isError.value = false
  notificationSummaryState.error.value = null
  notificationSummaryState.refetch.mockReset()

  notificationsState.data.value = buildEnvelope([notification])
  notificationsState.isPending.value = false
  notificationsState.isError.value = false
  notificationsState.error.value = null
  notificationsState.refetch.mockReset()

  markNotificationReadMutationState.isPending.value = false
  markNotificationReadMutationState.mutateAsync.mockReset()
  markNotificationReadMutationState.mutateAsync.mockImplementation(async (notificationId: string) => {
    const nextNotifications = profileNotificationsState.notifications.value.map((notification) =>
      notification.notification_id === notificationId
        ? { ...notification, is_read: true, read_at: '2026-05-08T11:00:00Z' }
        : notification,
    )

    setProfileNotifications(nextNotifications)
    setSummary(nextNotifications.filter((notification) => !notification.is_read).length, nextNotifications)

    return nextNotifications.find((notification) => notification.notification_id === notificationId)
  })

  markAllNotificationsReadMutationState.isPending.value = false
  markAllNotificationsReadMutationState.mutateAsync.mockReset()
  markAllNotificationsReadMutationState.mutateAsync.mockImplementation(async () => {
    const nextNotifications = profileNotificationsState.notifications.value.map((notification) => ({
      ...notification,
      is_read: true,
      read_at: notification.read_at ?? '2026-05-08T11:00:00Z',
    }))

    setProfileNotifications(nextNotifications)
    setSummary(0, nextNotifications)

    return { marked_count: nextNotifications.length, unread_count: 0 }
  })

  questionDetailState.data.value = buildQuestionDetail()
  questionDetailState.isPending.value = false
  questionDetailState.isError.value = false
  questionDetailState.refetch.mockReset()

  solutionsState.data.value = []
  solutionsState.isPending.value = false
  solutionsState.isError.value = false
  solutionsState.refetch.mockReset()

  commentState.data.value = { comments: [], hasMore: false, count: 0 }
  commentState.isPending.value = false
  commentState.isError.value = false
  commentState.refetch.mockReset()

  createSolutionMutationState.isPending.value = false
  createSolutionMutationState.mutateAsync.mockReset()
  inertMutationState.isPending.value = false
  inertMutationState.mutateAsync.mockReset()
  profileNotificationsState.refetch.mockReset()
  profileNotificationsState.fetchNextPage.mockReset()
}

async function mountAssembly(initialRoute = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const sessionStore = useSessionStore()
  sessionStore.setSession({ access: 'test-access-token', refresh: 'test-refresh-token' })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main data-testid="home-page">Home</main>' } },
      { path: '/profile', component: ProfilePage },
      { path: '/questions/:questionId', component: QuestionDetailPage },
      { path: '/login', component: { template: '<main data-testid="login-page">Login</main>' } },
      { path: '/register', component: { template: '<main data-testid="register-page">Register</main>' } },
    ],
  })

  await router.push(initialRoute)
  await router.isReady()

  const wrapper = mount(
    {
      components: { AppHeader },
      template: '<AppHeader /><RouterView />',
    },
    {
      global: {
        plugins: [pinia, router, [VueQueryPlugin, { queryClient }]],
      },
    },
  )

  mountedWrappers.push(wrapper)
  await flushPromises()

  return { wrapper, router, sessionStore }
}

async function openHeaderNotifications(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="header-notification-trigger"]').trigger('click')
  await flushPromises()
}

async function navigateToProfileNotifications(wrapper: VueWrapper, router: Router) {
  await openHeaderNotifications(wrapper)
  await wrapper.get('[data-testid="header-notification-profile-link"]').trigger('click')
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe('/profile?tab=notifications')
}

describe('notification center assembly', () => {
  beforeEach(() => {
    resetState()
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  it('keeps guest headers free of notification controls', async () => {
    const { wrapper, sessionStore } = await mountAssembly()

    sessionStore.clearSession()
    await flushPromises()

    expect(wrapper.find('[data-testid="header-notification-menu"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="login-link"]').attributes('href')).toBe('/login')
    expect(wrapper.get('[data-testid="register-link"]').attributes('href')).toBe('/register')
  })

  it('hands authenticated header preview off to the profile notifications route without exposing read controls in preview', async () => {
    const { wrapper, router } = await mountAssembly()

    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('1')

    await openHeaderNotifications(wrapper)

    expect(wrapper.get('[data-testid="header-notification-row"]').text()).toContain('Вас пригласили ответить')
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mark-all-read-button"]').exists()).toBe(false)

    await wrapper.get('[data-testid="header-notification-profile-link"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/profile?tab=notifications')
    expect(wrapper.get('[data-testid="profile-tab-notifications"]').classes()).toContain('profile-page__tab--active')
    expect(wrapper.get('[data-testid="profile-notifications-tab"]').text()).toContain('Вас пригласили ответить')
  })

  it('updates profile read state and the shared header badge only after server-confirmed read mutations', async () => {
    const notification = buildNotification()
    setProfileNotifications([notification])
    setSummary(0, [notification])

    const { wrapper, router } = await mountAssembly('/profile?tab=notifications')

    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('0')

    setSummary(1, [notification])
    await flushPromises()
    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('1')

    await wrapper.get('[data-testid="mark-read-button"]').trigger('click')
    await flushPromises()

    expect(markNotificationReadMutationState.mutateAsync).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(wrapper.get('[data-testid="read-badge"]').text()).toContain('Прочитано')
    expect(wrapper.find('[data-testid="mark-read-button"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('0')

    const secondNotification = buildNotification({
      notification_id: '22222222-2222-4222-8222-222222222222',
      title: 'Второе приглашение',
      is_read: false,
      read_at: null,
    })
    setProfileNotifications([secondNotification])
    setSummary(1, [secondNotification])
    await flushPromises()

    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('1')

    await wrapper.get('[data-testid="mark-all-read-button"]').trigger('click')
    await flushPromises()

    expect(markAllNotificationsReadMutationState.mutateAsync).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('0')
    expect(router.currentRoute.value.fullPath).toBe('/profile?tab=notifications')
  })

  it('keeps cached route surfaces navigable when notification queries fail or DTO CTAs are unsafe', async () => {
    const parsed = parseNotificationEnvelope({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          ...buildNotification({ notification_id: '33333333-3333-4333-8333-333333333333' }),
          cta_url: 'https://evil.example/phish',
        },
      ],
    })

    setProfileNotifications(parsed.results, { staleError: true })
    notificationSummaryState.isError.value = true
    setSummary(1, parsed.results)

    const { wrapper } = await mountAssembly('/profile?tab=notifications')

    expect(wrapper.get('[data-testid="header-notification-badge"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="notifications-stale-error"]').text()).toContain('Не удалось обновить список')
    expect(wrapper.find('[data-testid="notification-cta"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="notification-cta-unavailable"]').text()).toContain('Переход к вопросу недоступен')

    await openHeaderNotifications(wrapper)

    expect(wrapper.get('[data-testid="header-notification-stale-error"]').text()).toContain('Не удалось обновить сводку')
    expect(wrapper.get('[data-testid="header-notification-row"]').text()).toContain('Вас пригласили ответить')
  })

  it('navigates from a safe notification CTA while answer permission remains governed by viewer_can_answer', async () => {
    const notification = buildNotification()
    questionDetailState.data.value = buildQuestionDetail({ viewer_can_answer: false })
    notificationsState.data.value = buildEnvelope([notification])
    setProfileNotifications([notification])
    setSummary(1, [notification])

    const { wrapper, router } = await mountAssembly('/profile?tab=notifications')

    await wrapper.get('[data-testid="notification-cta"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/questions/question-1')
    expect(wrapper.get('[data-testid="question-invitation-context-stale"]').text()).toContain('Наличие уведомления не является разрешением')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только эксперты')
    expect(wrapper.text()).toContain('Ответ временно недоступен')
    expect(wrapper.text()).not.toContain('Откройте короткий модальный редактор')
  })

  it('surfaces initial notification query errors without breaking profile route handoff', async () => {
    setProfileNotifications([], { initialError: true })
    notificationSummaryState.data.value = undefined
    notificationSummaryState.isError.value = true
    notificationSummaryState.error.value = new Error('Malformed notification summary')

    const { wrapper, router } = await mountAssembly()

    await openHeaderNotifications(wrapper)

    expect(wrapper.get('[data-testid="header-notification-error"]').text()).toContain('Не удалось загрузить уведомления')

    await wrapper.get('[data-testid="header-notification-profile-link"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/profile?tab=notifications')
    expect(wrapper.get('[data-testid="notifications-error"]').text()).toContain('Не удалось загрузить уведомления')
  })
})
