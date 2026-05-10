import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { useSessionStore } from '@/features/auth/stores/session'
import type { NotificationItem, PaginatedNotificationResponse } from '@/features/notifications/api/notifications'
import type {
  EligibleExpertsEnvelope,
  ExpertInvitationCreateResponse,
  InvitedExpertInvitationsEnvelope,
} from '@/features/questions/api/questionExpertInvitations'
import type { QuestionDetail } from '@/features/questions/api/questions'
import ProfilePage from '@/pages/ProfilePage.vue'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'

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

const profileState = {
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const notificationsState = {
  data: ref<PaginatedNotificationResponse>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const notificationSummaryState = {
  data: ref({ unread_count: 0, latest: [] as NotificationItem[] }),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const profileNotificationsState = {
  ...notificationsState,
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
  hasNextPage: ref(false),
  isFetchingNextPage: ref(false),
  isFetchNextPageError: ref(false),
  fetchNextPage: vi.fn(),
}

const createSolutionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const updateQuestionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const createQuestionEditMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const tagAutocompleteQueryState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
}

const eligibleExpertsState = {
  data: ref<EligibleExpertsEnvelope | undefined>(undefined),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const invitedExpertsState = {
  data: ref<InvitedExpertInvitationsEnvelope | undefined>(undefined),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
  refetch: vi.fn(),
}

const createExpertInvitationsMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const markNotificationReadMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const markAllNotificationsReadMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

vi.mock('@/features/questions/queries/useQuestionDetailQuery', () => ({
  useQuestionDetailQuery: vi.fn(() => questionDetailState),
}))

vi.mock('@/features/solutions/queries/useSolutionsQuery', () => ({
  useSolutionsQuery: vi.fn(() => solutionsState),
}))

vi.mock('@/features/comments/queries/useCommentContextQuery', () => ({
  useCommentContextQuery: vi.fn(() => commentState),
}))

vi.mock('@/features/users/queries/usePublicProfileQuery', () => ({
  usePublicProfileQuery: vi.fn(() => profileState),
}))

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => profileState),
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

vi.mock('@/features/solutions/mutations/useCreateSolutionMutation', () => ({
  useCreateSolutionMutation: vi.fn(() => createSolutionMutationState),
}))

vi.mock('@/features/questions/mutations/useUpdateQuestionMutation', () => ({
  useUpdateQuestionMutation: vi.fn(() => updateQuestionMutationState),
}))

vi.mock('@/features/questions/mutations/useCreateQuestionEditMutation', () => ({
  useCreateQuestionEditMutation: vi.fn(() => createQuestionEditMutationState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteQueryState),
}))

vi.mock('@/features/questions/queries/useEligibleExpertsQuery', () => ({
  useEligibleExpertsQuery: vi.fn(() => eligibleExpertsState),
}))

vi.mock('@/features/questions/queries/useInvitedExpertInvitationsQuery', () => ({
  useInvitedExpertInvitationsQuery: vi.fn(() => invitedExpertsState),
}))

vi.mock('@/features/questions/mutations/useCreateExpertInvitationsMutation', () => ({
  useCreateExpertInvitationsMutation: vi.fn(() => createExpertInvitationsMutationState),
}))

const mountedWrappers: VueWrapper[] = []

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'expert-1',
    user_name: 'Expert Alice',
    user_email: 'expert@example.com',
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
    viewer_answer_reason_message: 'Отвечать сейчас могут только участники уровня Эксперт или Мастер.',
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

function buildEligibleExpertsEnvelope(overrides: Partial<EligibleExpertsEnvelope> = {}): EligibleExpertsEnvelope {
  return {
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        user_id: 'expert-1',
        user_name: 'Expert Alice',
        user_reputation_score: 450,
        reputation_level: 'expert',
        reputation_level_label: 'Эксперт',
        is_manual_override: false,
      },
      {
        user_id: 'master-1',
        user_name: 'Master Bob',
        user_reputation_score: 1200,
        reputation_level: 'master',
        reputation_level_label: 'Мастер',
        is_manual_override: true,
      },
    ],
    question_id: 'question-1',
    max_invites: 3,
    invited_count: 1,
    remaining_slots: 2,
    can_invite: true,
    reason_code: 'invites_available',
    ...overrides,
  }
}

function buildCreateInvitationsResponse(
  overrides: Partial<ExpertInvitationCreateResponse> = {},
): ExpertInvitationCreateResponse {
  return {
    question_id: 'question-1',
    max_invites: 3,
    invited_count: 3,
    remaining_slots: 0,
    created_count: 2,
    invitations: [],
    ...overrides,
  }
}

function buildInvitedExpertsEnvelope(
  overrides: Partial<InvitedExpertInvitationsEnvelope> = {},
): InvitedExpertInvitationsEnvelope {
  return {
    count: 1,
    next: null,
    previous: null,
    results: [],
    question_id: 'question-1',
    invited_count: 1,
    ...overrides,
  }
}

function buildInvitationNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: 'notification-1',
    notification_type: 'expert_invitation',
    title: 'Вас пригласили ответить',
    message: 'Автор защищённого вопроса ждёт экспертного ответа.',
    payload: {
      question_title: 'Как новичку типизировать Vue Query?',
      question_tags: ['vue', 'typescript'],
      author_name: 'Newcomer Ada',
    },
    source_question_id: 'question-1',
    created_at: '2026-05-08T10:10:00Z',
    read_at: null,
    expires_at: '2026-05-08T22:00:00Z',
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

function resetMockState() {
  queryClient.clear()
  document.body.innerHTML = ''

  questionDetailState.data.value = null
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

  profileState.data.value = buildProfile()
  profileState.isPending.value = false
  profileState.isError.value = false
  profileState.error.value = null
  profileState.refetch.mockReset()

  notificationsState.data.value = { count: 0, next: null, previous: null, results: [] }
  notificationsState.isPending.value = false
  notificationsState.isError.value = false
  notificationsState.error.value = null
  notificationsState.refetch.mockReset()

  notificationSummaryState.data.value = { unread_count: 0, latest: [] }
  notificationSummaryState.isPending.value = false
  notificationSummaryState.isError.value = false
  notificationSummaryState.error.value = null
  notificationSummaryState.refetch.mockReset()

  profileNotificationsState.data.value = { count: 0, next: null, previous: null, results: [] }
  profileNotificationsState.pages.value = []
  profileNotificationsState.notifications.value = []
  profileNotificationsState.totalCount.value = 0
  profileNotificationsState.hasLoadedPages.value = false
  profileNotificationsState.hasLoadedNotifications.value = false
  profileNotificationsState.isPending.value = false
  profileNotificationsState.isError.value = false
  profileNotificationsState.isInitialLoading.value = false
  profileNotificationsState.isInitialError.value = false
  profileNotificationsState.isStaleError.value = false
  profileNotificationsState.isLoadMorePending.value = false
  profileNotificationsState.isLoadMoreError.value = false
  profileNotificationsState.hasNextPage.value = false
  profileNotificationsState.isFetchingNextPage.value = false
  profileNotificationsState.isFetchNextPageError.value = false
  profileNotificationsState.error.value = null
  profileNotificationsState.refetch.mockReset()
  profileNotificationsState.fetchNextPage.mockReset()

  createSolutionMutationState.isPending.value = false
  createSolutionMutationState.mutateAsync.mockReset()

  updateQuestionMutationState.isPending.value = false
  updateQuestionMutationState.mutateAsync.mockReset()

  createQuestionEditMutationState.isPending.value = false
  createQuestionEditMutationState.mutateAsync.mockReset()

  tagAutocompleteQueryState.data.value = []
  tagAutocompleteQueryState.isPending.value = false
  tagAutocompleteQueryState.isError.value = false

  eligibleExpertsState.data.value = undefined
  eligibleExpertsState.isPending.value = false
  eligibleExpertsState.isError.value = false
  eligibleExpertsState.error.value = null
  eligibleExpertsState.refetch.mockReset()

  invitedExpertsState.data.value = buildInvitedExpertsEnvelope()
  invitedExpertsState.isPending.value = false
  invitedExpertsState.isError.value = false
  invitedExpertsState.error.value = null
  invitedExpertsState.refetch.mockReset()

  createExpertInvitationsMutationState.isPending.value = false
  createExpertInvitationsMutationState.mutateAsync.mockReset()

  markNotificationReadMutationState.isPending.value = false
  markNotificationReadMutationState.mutateAsync.mockReset()

  markAllNotificationsReadMutationState.isPending.value = false
  markAllNotificationsReadMutationState.mutateAsync.mockReset()
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/profile', component: ProfilePage },
      { path: '/questions/:questionId', component: QuestionDetailPage },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/admin', component: { template: '<div>admin</div>' } },
    ],
  })
}

function installSession(authenticatedUserId: string) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const sessionStore = useSessionStore()
  sessionStore.setSession({ access: 'access-token', refresh: 'refresh-token' })
  profileState.data.value = buildProfile({ user_id: authenticatedUserId })

  return pinia
}

async function mountQuestionPage(router: Router, authenticatedUserId = 'expert-1') {
  const pinia = installSession(authenticatedUserId)

  await router.push('/questions/question-1')
  await router.isReady()

  const wrapper = mount(QuestionDetailPage, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, [VueQueryPlugin, { queryClient }]],
      stubs: {
        teleport: true,
      },
    },
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return wrapper
}

async function openExpertInvitationDialog(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="question-expert-invitation-trigger"]').trigger('click')
  await flushPromises()
}

async function mountProfileNotifications(router: Router, authenticatedUserId = 'expert-1') {
  const pinia = installSession(authenticatedUserId)

  await router.push({ path: '/profile', query: { tab: 'notifications' } })
  await router.isReady()

  const wrapper = mount(ProfilePage, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: {
        AppShellLayout: {
          template: '<div data-testid="shell-layout"><slot /></div>',
        },
      },
    },
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return wrapper
}

describe('newcomer help loop integration', () => {
  beforeEach(() => {
    resetMockState()
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
  })

  it('lets a protected question author invite experts up to the remaining slots and confirms server-created counts', async () => {
    questionDetailState.data.value = buildQuestionDetail({ user: 'author-1' })
    profileState.data.value = buildProfile({ user_id: 'author-1', user_name: 'Newcomer Ada' })
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    createExpertInvitationsMutationState.mutateAsync.mockResolvedValue(buildCreateInvitationsResponse())

    const wrapper = await mountQuestionPage(createTestRouter(), 'author-1')
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(true)
    const panel = wrapper.get('[data-testid="question-expert-invitation-panel"]')
    expect(panel.text()).toContain('Позвать эксперта или мастера')
    expect(panel.get('[data-testid="expert-invitation-slot-summary"]').text()).toContain('Приглашено 1 из 3')

    await wrapper.get('#expert-invitation-search').setValue('Expert')
    await wrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').setValue(true)
    await wrapper.get('[data-testid="expert-invitation-candidate-master-1"]').setValue(true)

    expect(wrapper.get('[data-testid="expert-invitation-selection-summary"]').text()).toContain('Выбрано: 2 из 2')

    await wrapper.get('[data-testid="expert-invitation-send"]').trigger('click')
    await flushPromises()

    expect(createExpertInvitationsMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      recipientIds: ['expert-1', 'master-1'],
    })
    expect(wrapper.get('[data-testid="expert-invitation-success"]').text()).toContain('Отправлено приглашений: 2')
    expect(wrapper.get('[data-testid="expert-invitation-success"]').text()).toContain('Осталось слотов: 0')
    expect(wrapper.get('[data-testid="expert-invitation-selection-summary"]').text()).toContain('Выбрано: 0 из 2')
  })

  it('keeps invitation mutation and selector failures visible without losing retry-safe state', async () => {
    questionDetailState.data.value = buildQuestionDetail({ user: 'author-1' })
    profileState.data.value = buildProfile({ user_id: 'author-1', user_name: 'Newcomer Ada' })
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    createExpertInvitationsMutationState.mutateAsync.mockRejectedValue(new Error('timeout Authorization: Bearer secret'))

    const mutationWrapper = await mountQuestionPage(createTestRouter(), 'author-1')
    await openExpertInvitationDialog(mutationWrapper)

    await mutationWrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').setValue(true)
    await mutationWrapper.get('[data-testid="expert-invitation-send"]').trigger('click')
    await flushPromises()

    expect(mutationWrapper.get('[data-testid="expert-invitation-mutation-error"]').text()).toContain('Не удалось обновить приглашения экспертов')
    expect(mutationWrapper.text()).not.toContain('Bearer secret')
    expect(mutationWrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').element).toHaveProperty('checked', true)

    mutationWrapper.unmount()
    resetMockState()

    questionDetailState.data.value = buildQuestionDetail({ user: 'author-1' })
    profileState.data.value = buildProfile({ user_id: 'author-1', user_name: 'Newcomer Ada' })
    eligibleExpertsState.isError.value = true
    eligibleExpertsState.error.value = new Error('selector backend traceback secret')

    const selectorWrapper = await mountQuestionPage(createTestRouter(), 'author-1')
    await openExpertInvitationDialog(selectorWrapper)

    expect(selectorWrapper.get('[data-testid="expert-invitation-available-error"]').text()).toContain('Не удалось обновить приглашения экспертов')
    expect(selectorWrapper.text()).not.toContain('traceback secret')

    await selectorWrapper.get('[data-testid="expert-invitation-available-retry"]').trigger('click')

    expect(eligibleExpertsState.refetch).toHaveBeenCalledOnce()
  })

  it('shows the expert notification CTA on the profile tab and carries the same invitation context into question detail', async () => {
    const invitation = buildInvitationNotification()
    notificationsState.data.value = { count: 1, next: null, previous: null, results: [invitation] }
    profileNotificationsState.data.value = { count: 1, next: null, previous: null, results: [invitation] }
    profileNotificationsState.pages.value = [{ count: 1, next: null, previous: null, results: [invitation] }]
    profileNotificationsState.notifications.value = [invitation]
    profileNotificationsState.totalCount.value = 1
    profileNotificationsState.hasLoadedPages.value = true
    profileNotificationsState.hasLoadedNotifications.value = true
    notificationSummaryState.data.value = { unread_count: 1, latest: [invitation] }
    profileState.data.value = buildProfile({ user_id: 'expert-1', user_name: 'Expert Alice' })

    const router = createTestRouter()
    const profileWrapper = await mountProfileNotifications(router, 'expert-1')

    expect(profileWrapper.get('[data-testid="profile-tab-notifications"]').classes()).toContain('profile-page__tab--active')
    const card = profileWrapper.get('[data-testid="notification-card"]')
    expect(card.get('[data-testid="invitation-status-badge"]').text()).toContain('Приглашение активно')
    expect(card.get('[data-testid="question-context"]').text()).toContain('Как новичку типизировать Vue Query?')
    expect(card.get('[data-testid="notification-cta"]').attributes('href')).toBe('/questions/question-1')

    profileWrapper.unmount()
    document.body.innerHTML = ''

    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_level: 'expert',
      viewer_level_label: 'Эксперт',
    })

    const questionWrapper = await mountQuestionPage(router, 'expert-1')

    expect(questionWrapper.get('[data-testid="question-invitation-context-active"]').text()).toContain('сервер разрешил вам ответить')
    expect(questionWrapper.text()).toContain('Написать решение')
    expect(questionWrapper.find('[data-testid="solution-composer-blocked-reason"]').exists()).toBe(false)
  })

  it('shows invitation loading before ordinary blocked copy while keeping answer controls disabled', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      viewer_can_answer: false,
      viewer_answer_reason_message: 'Сервер ждёт проверки приглашений.',
    })
    notificationsState.isPending.value = true
    notificationsState.data.value = { count: 0, next: null, previous: null, results: [] }

    const wrapper = await mountQuestionPage(createTestRouter(), 'participant-1')

    expect(wrapper.get('[data-testid="question-invitation-context-loading"]').text()).toContain('Загружаем ваши уведомления')
    expect(wrapper.find('[data-testid="question-invitation-context-ordinary-blocked"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Сервер ждёт проверки приглашений')
  })

  it('matches only the current question invitation and prefers the latest relevant row deterministically', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      viewer_can_answer: false,
      viewer_answer_reason_message: 'Сервер не разрешил ответ по уведомлению.',
    })
    notificationsState.data.value = {
      count: 4,
      next: null,
      previous: null,
      results: [
        buildInvitationNotification({
          notification_id: 'other-question-newer',
          source_question_id: 'other-question',
          created_at: '2026-05-08T10:45:00Z',
          cta_url: '/questions/other-question',
        }),
        buildInvitationNotification({
          notification_id: 'current-active-older',
          source_question_id: 'question-1',
          invitation_status: 'active',
          protected_window_active: true,
          protected_window_ended: false,
          created_at: '2026-05-08T10:15:00Z',
          cta_url: '/questions/question-1',
        }),
        buildInvitationNotification({
          notification_id: 'current-expired-latest',
          source_question_id: 'question-1',
          invitation_status: 'expired',
          protected_window_active: false,
          protected_window_ended: true,
          created_at: '2026-05-08T10:30:00Z',
          cta_url: '/questions/question-1',
        }),
        buildInvitationNotification({
          notification_id: 'unsafe-current-latest',
          source_question_id: 'question-1',
          invitation_status: 'active',
          protected_window_active: true,
          protected_window_ended: false,
          created_at: '2026-05-08T10:50:00Z',
          cta_url: '/admin',
        }),
      ],
    }

    const wrapper = await mountQuestionPage(createTestRouter(), 'participant-1')

    expect(wrapper.get('[data-testid="question-invitation-context-stale"]').text()).toContain('Уведомление найдено')
    expect(wrapper.find('[data-testid="question-invitation-context-active"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Сервер не разрешил ответ')
  })

  it('does not let ordinary, forged, stale, or unavailable notifications enable answer authoring', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      viewer_can_answer: false,
      viewer_answer_reason_message: 'Сервер по-прежнему блокирует ответ.',
    })
    notificationsState.data.value = { count: 0, next: null, previous: null, results: [] }

    const ordinaryWrapper = await mountQuestionPage(createTestRouter(), 'participant-1')

    expect(ordinaryWrapper.get('[data-testid="question-invitation-context-ordinary-blocked"]').text()).toContain('У вас нет активного приглашения')
    expect(ordinaryWrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Сервер по-прежнему блокирует ответ')
    expect(ordinaryWrapper.text()).not.toContain('Написать решение')

    ordinaryWrapper.unmount()
    resetMockState()

    questionDetailState.data.value = buildQuestionDetail({
      viewer_can_answer: false,
      viewer_answer_reason_message: 'Сервер по-прежнему блокирует ответ.',
    })
    notificationsState.isError.value = true
    notificationsState.data.value = {
      count: 2,
      next: null,
      previous: null,
      results: [
        buildInvitationNotification({ source_question_id: 'other-question', cta_url: '/questions/other-question' }),
        buildInvitationNotification({
          invitation_status: 'expired',
          protected_window_active: false,
          protected_window_ended: true,
          cta_url: null,
        }),
      ],
    }

    const staleWrapper = await mountQuestionPage(createTestRouter(), 'participant-1')

    expect(staleWrapper.get('[data-testid="question-invitation-context-warning"]').text()).toContain('Не удалось проверить ваши приглашения')
    expect(staleWrapper.get('[data-testid="question-invitation-context-stale"]').text()).toContain('Наличие уведомления не является разрешением')
    expect(staleWrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Сервер по-прежнему блокирует ответ')
    expect(staleWrapper.text()).not.toContain('Написать решение')
  })
})
