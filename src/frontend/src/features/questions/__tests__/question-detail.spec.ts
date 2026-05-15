import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { useSessionStore } from '@/features/auth/stores/session'
import type { NotificationItem, PaginatedNotificationResponse } from '@/features/notifications/api/notifications'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
import type { QuestionDetail } from '@/features/questions/api/questions'
import type {
  EligibleExpertsEnvelope,
  ExpertInvitationCreateResponse,
  InvitedExpertInvitation,
  InvitedExpertInvitationsEnvelope,
} from '@/features/questions/api/questionExpertInvitations'
import VoteBalanceMeter from '@/features/questions/components/VoteBalanceMeter.vue'
import SignalVoteRail from '@/features/votes/components/SignalVoteRail.vue'

const questionDetailState = {
  data: ref(null),
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
  data: ref(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const currentUserState = {
  data: ref(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const notificationsState = {
  data: ref<PaginatedNotificationResponse>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
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
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => notificationsState),
  useNotificationSummaryQuery: vi.fn(() => notificationsState),
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

function buildInvitationNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: 'notification-1',
    notification_type: 'expert_invitation',
    title: 'Автор приглашает вас ответить',
    message: 'Помогите новичку с защищённым вопросом.',
    payload: {},
    source_question_id: 'question-1',
    created_at: '2026-03-01T12:05:00Z',
    read_at: null,
    expires_at: '2026-03-02T00:00:00Z',
    is_read: false,
    is_expired: false,
    invitation_status: 'active',
    protected_window_active: true,
    protected_window_ended: false,
    protected_until: '2026-03-02T00:00:00Z',
    cta_url: '/questions/question-1',
    ...overrides,
  }
}

function buildQuestionDetail(overrides: Partial<QuestionDetail> = {}): QuestionDetail {
  return {
    question_id: 'question-1',
    user: 'user-1',
    question_title: 'Как типизировать read-only detail page?',
    question_body: 'Нужно собрать question-first detail route без активного голосования.',
    question_status: 'open',
    question_created_at: '2026-03-01T12:00:00Z',
    question_updated_at: '2026-03-02T12:00:00Z',
    tags: [],
    upvotes: 12,
    downvotes: 3,
    score: 9,
    user_vote: null,
    is_protected: false,
    protection_reason_code: 'question_not_protected',
    protected_until: null,
    author_level: null,
    author_points_to_next_level: null,
    author_next_level: null,
    author_next_level_label: null,
    viewer_can_answer: true,
    viewer_answer_reason_code: 'answer_allowed',
    viewer_answer_reason_message: '',
    viewer_answer_required_level: null,
    viewer_answer_required_level_label: null,
    viewer_level: null,
    viewer_level_label: null,
    viewer_points_to_next_level: null,
    viewer_next_level: null,
    viewer_next_level_label: null,
    viewer_can_downvote: true,
    viewer_downvote_reason_code: 'question_downvote_allowed',
    viewer_downvote_reason_message: '',
    ...overrides,
  }
}

function buildInvitedExpertInvitation(overrides: Partial<InvitedExpertInvitation> = {}): InvitedExpertInvitation {
  return {
    recipient_id: 'expert-2',
    recipient_name: 'Invited Eve',
    recipient_reputation_score: 820,
    reputation_level: 'expert',
    reputation_level_label: 'Эксперт',
    notification_id: 'notification-2',
    is_read: false,
    read_at: null,
    invitation_status: 'active',
    protected_window_active: true,
    protected_until: '2026-03-02T00:00:00Z',
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
    results: [buildInvitedExpertInvitation()],
    question_id: 'question-1',
    invited_count: 1,
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

function buildCreateExpertInvitationsResponse(
  overrides: Partial<ExpertInvitationCreateResponse> = {},
): ExpertInvitationCreateResponse {
  return {
    question_id: 'question-1',
    max_invites: 3,
    invited_count: 2,
    remaining_slots: 1,
    created_count: 1,
    invitations: [],
    ...overrides,
  }
}

async function mountQuestionDetailPage(authenticated = false) {
  const pinia = createPinia()
  setActivePinia(pinia)

  if (authenticated) {
    const sessionStore = useSessionStore()
    sessionStore.setSession({ access: 'access-token', refresh: 'refresh-token' })
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/questions/:questionId', component: QuestionDetailPage },
    ],
  })

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

  await flushPromises()

  return { wrapper, router }
}

async function openExpertInvitationDialog(wrapper: Awaited<ReturnType<typeof mountQuestionDetailPage>>['wrapper']) {
  await wrapper.get('[data-testid="question-expert-invitation-trigger"]').trigger('click')
  await flushPromises()
}

describe('question detail page', () => {
  beforeEach(() => {
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

    profileState.data.value = null
    profileState.isPending.value = false
    profileState.isError.value = false
    profileState.refetch.mockReset()

    currentUserState.data.value = null
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    currentUserState.refetch.mockReset()

    notificationsState.data.value = { count: 0, next: null, previous: null, results: [] }
    notificationsState.isPending.value = false
    notificationsState.isError.value = false
    notificationsState.refetch.mockReset()

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

    invitedExpertsState.data.value = undefined
    invitedExpertsState.isPending.value = false
    invitedExpertsState.isError.value = false
    invitedExpertsState.error.value = null
    invitedExpertsState.refetch.mockReset()

    createExpertInvitationsMutationState.isPending.value = false
    createExpertInvitationsMutationState.mutateAsync.mockReset()
  })

  it('renders the loading skeleton while the detail query is pending', async () => {
    questionDetailState.isPending.value = true

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.find('[data-testid="question-detail-skeleton"]').exists()).toBe(true)
  })

  it('renders the retry state when the detail query fails', async () => {
    questionDetailState.isError.value = true

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Не удалось загрузить данные. Попробуйте снова.')

    await wrapper.get('[data-testid="question-detail-error"] button').trigger('click')

    expect(questionDetailState.refetch).toHaveBeenCalled()
  })

  it('renders the vote rail in readonly mode on the public detail route', async () => {
    questionDetailState.data.value = {
      question_id: 'question-1',
      user: 'user-1',
      question_title: 'Как типизировать read-only detail page?',
      question_body: 'Нужно собрать question-first detail route без активного голосования.',
      question_status: 'open',
      question_created_at: '2026-03-01T12:00:00Z',
      question_updated_at: '2026-03-02T12:00:00Z',
      tags: [],
      upvotes: 12,
      downvotes: 3,
      score: 9,
      user_vote: null,
      is_protected: false,
      protection_reason_code: 'question_not_protected',
      protected_until: null,
      author_level: null,
      author_points_to_next_level: null,
      author_next_level: null,
      author_next_level_label: null,
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_answer_required_level: null,
      viewer_answer_required_level_label: null,
      viewer_level: null,
      viewer_level_label: null,
      viewer_points_to_next_level: null,
      viewer_next_level: null,
      viewer_next_level_label: null,
      viewer_can_downvote: true,
      viewer_downvote_reason_code: 'question_downvote_allowed',
      viewer_downvote_reason_message: '',
    }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Как типизировать read-only detail page?')
    expect(wrapper.findComponent(SignalVoteRail).exists()).toBe(true)
    expect(wrapper.findComponent(VoteBalanceMeter).exists()).toBe(true)
    expect(wrapper.text()).toContain('Чтобы голосовать, войдите в аккаунт.')
  })

  it('shows the expert invitation trigger only to authenticated authors on protected questions and keeps the panel closed by default', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()

    const guest = await mountQuestionDetailPage(false)
    expect(guest.wrapper.find('[data-testid="question-expert-invitation-trigger"]').exists()).toBe(false)
    expect(guest.wrapper.find('[data-testid="question-expert-invitation-panel"]').exists()).toBe(false)
    guest.wrapper.unmount()

    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    const nonAuthor = await mountQuestionDetailPage(true)
    expect(nonAuthor.wrapper.find('[data-testid="question-expert-invitation-trigger"]').exists()).toBe(false)
    expect(nonAuthor.wrapper.find('[data-testid="question-expert-invitation-panel"]').exists()).toBe(false)
    nonAuthor.wrapper.unmount()

    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    questionDetailState.data.value = buildQuestionDetail({ user: 'author-1', is_protected: false })
    const unprotected = await mountQuestionDetailPage(true)
    expect(unprotected.wrapper.find('[data-testid="question-expert-invitation-trigger"]').exists()).toBe(false)
    expect(unprotected.wrapper.find('[data-testid="question-expert-invitation-panel"]').exists()).toBe(false)
    unprotected.wrapper.unmount()

    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    currentUserState.isPending.value = true
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    const pendingIdentity = await mountQuestionDetailPage(true)
    expect(pendingIdentity.wrapper.find('[data-testid="question-expert-invitation-trigger"]').exists()).toBe(false)
    pendingIdentity.wrapper.unmount()
    currentUserState.isPending.value = false

    currentUserState.isError.value = true
    const erroredIdentity = await mountQuestionDetailPage(true)
    expect(erroredIdentity.wrapper.find('[data-testid="question-expert-invitation-trigger"]').exists()).toBe(false)
    erroredIdentity.wrapper.unmount()
    currentUserState.isError.value = false

    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    const author = await mountQuestionDetailPage(true)

    expect(author.wrapper.get('[data-testid="question-expert-invitation-trigger"]').text()).toContain('Позвать эксперта')
    expect(author.wrapper.find('[data-testid="question-expert-invitation-panel"]').exists()).toBe(false)

    await openExpertInvitationDialog(author.wrapper)

    expect(author.wrapper.get('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(true)
    expect(author.wrapper.get('[data-testid="question-expert-invitation-panel"]').text()).toContain('Позвать эксперта или мастера')
    expect(author.wrapper.get('[data-testid="expert-invitation-slot-summary"]').text()).toContain('Приглашено 1 из 3')
  })

  it('closes the expert invitation dialog from the dialog close action and route changes', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    invitedExpertsState.data.value = buildInvitedExpertsEnvelope()

    const { wrapper, router } = await mountQuestionDetailPage(true)

    expect(wrapper.find('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(false)

    await openExpertInvitationDialog(wrapper)
    expect(wrapper.get('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="expert-invitation-available-section"]').text()).toContain('Кого можно пригласить сейчас')
    expect(wrapper.get('[data-testid="expert-invitation-invited-section"]').text()).toContain('Получатели приглашений')

    const closeButton = wrapper.findAll('button').find((button) => button.text() === 'Закрыть')
    expect(closeButton).toBeDefined()

    await closeButton!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-expert-invitation-panel"]').exists()).toBe(false)

    await openExpertInvitationDialog(wrapper)
    expect(wrapper.get('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(true)

    await router.push('/questions/question-2')
    await flushPromises()

    expect(wrapper.find('[data-testid="question-expert-invitation-dialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-expert-invitation-panel"]').exists()).toBe(false)
  })

  it('renders available and invited expert sections with read and protected-window statuses', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    invitedExpertsState.data.value = buildInvitedExpertsEnvelope({
      count: 2,
      invited_count: 2,
      results: [
        buildInvitedExpertInvitation({
          recipient_id: 'expert-2',
          recipient_name: 'Invited Eve',
          recipient_reputation_score: 820,
          reputation_level_label: 'Эксперт',
          notification_id: 'notification-2',
          is_read: false,
          invitation_status: 'active',
          protected_window_active: true,
        }),
        buildInvitedExpertInvitation({
          recipient_id: 'master-2',
          recipient_name: 'Invited Mallory',
          recipient_reputation_score: 1400,
          reputation_level: 'master',
          reputation_level_label: 'Мастер',
          notification_id: 'notification-3',
          is_read: true,
          read_at: '2026-03-01T13:00:00Z',
          invitation_status: 'expired',
          protected_window_active: false,
          protected_until: null,
        }),
      ],
    })

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="expert-invitation-available-section"]').text()).toContain('Кого можно пригласить сейчас')
    expect(wrapper.get('[data-testid="expert-invitation-available-list"]').text()).toContain('Expert Alice')
    expect(wrapper.get('[data-testid="expert-invitation-available-row-expert-1"] [data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('expert')
    expect(wrapper.get('[data-testid="expert-invitation-available-row-master-1"] [data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('master')
    expect(wrapper.get('[data-testid="expert-invitation-invited-section"]').text()).toContain('Получатели приглашений')
    expect(wrapper.get('[data-testid="expert-invitation-invited-row-expert-2"]').text()).toContain('Invited Eve')
    expect(wrapper.get('[data-testid="expert-invitation-invited-row-expert-2"] [data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('expert')
    expect(wrapper.get('[data-testid="expert-invitation-invited-row-master-2"] [data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('master')
    expect(wrapper.get('[data-testid="expert-invitation-status-expert-2"]').text()).toContain('Приглашение активно')
    expect(wrapper.get('[data-testid="expert-invitation-read-expert-2"]').text()).toContain('Уведомление не прочитано')
    expect(wrapper.get('[data-testid="expert-invitation-window-expert-2"]').text()).toContain('Защитное окно активно')
    expect(wrapper.get('[data-testid="expert-invitation-status-master-2"]').text()).toContain('Приглашение истекло')
    expect(wrapper.get('[data-testid="expert-invitation-read-master-2"]').text()).toContain('Уведомление прочитано')
    expect(wrapper.get('[data-testid="expert-invitation-window-master-2"]').text()).toContain('Защитное окно завершено')
    expect(wrapper.text()).not.toContain('dedupe_key')
    expect(wrapper.text()).not.toContain('payload')
    expect(wrapper.text()).not.toContain('email')
  })

  it('renders an empty invited list without hiding available candidates', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope({ invited_count: 0 })
    invitedExpertsState.data.value = buildInvitedExpertsEnvelope({ count: 0, invited_count: 0, results: [] })

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="expert-invitation-available-list"]').text()).toContain('Expert Alice')
    expect(wrapper.get('[data-testid="expert-invitation-invited-empty"]').text()).toContain('Пока никто не приглашён')
  })

  it('keeps invited rows visible when candidate discovery fails', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.isError.value = true
    eligibleExpertsState.error.value = new Error('traceback Authorization: Bearer secret')
    invitedExpertsState.data.value = buildInvitedExpertsEnvelope()

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="expert-invitation-available-error"]').text()).toContain('Не удалось обновить приглашения экспертов')
    expect(wrapper.get('[data-testid="expert-invitation-invited-list"]').text()).toContain('Invited Eve')
    expect(wrapper.get('[data-testid="expert-invitation-send"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Bearer secret')

    await wrapper.get('[data-testid="expert-invitation-available-retry"]').trigger('click')

    expect(eligibleExpertsState.refetch).toHaveBeenCalled()
  })

  it('keeps sending available when invited list loading fails with a redacted retry state', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    invitedExpertsState.isError.value = true
    invitedExpertsState.error.value = new Error('Traceback Authorization: Bearer secret token')
    createExpertInvitationsMutationState.mutateAsync.mockResolvedValue(buildCreateExpertInvitationsResponse())

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="expert-invitation-invited-error"]').text()).toContain('Не удалось загрузить уже приглашённых экспертов')
    expect(wrapper.text()).not.toContain('Bearer secret')
    expect(wrapper.text()).not.toContain('Traceback')

    await wrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').setValue(true)
    await wrapper.get('[data-testid="expert-invitation-send"]').trigger('click')
    await flushPromises()

    expect(createExpertInvitationsMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      recipientIds: ['expert-1'],
    })

    await wrapper.get('[data-testid="expert-invitation-invited-retry"]').trigger('click')

    expect(invitedExpertsState.refetch).toHaveBeenCalled()
  })

  it('searches candidates, posts selected expert ids, and clears selection after server-confirmed success', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    createExpertInvitationsMutationState.mutateAsync.mockResolvedValue(
      buildCreateExpertInvitationsResponse({ created_count: 2, remaining_slots: 0 }),
    )

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    await wrapper.get('#expert-invitation-search').setValue('Alice')
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
    expect(wrapper.get('[data-testid="expert-invitation-selection-summary"]').text()).toContain('Выбрано: 0 из 2')
  })

  it('uses server slot metadata to disable over-selection without treating it as authorization', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope({ remaining_slots: 1 })

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    await wrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').setValue(true)

    expect(wrapper.get('[data-testid="expert-invitation-candidate-master-1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="expert-invitation-selection-summary"]').text()).toContain('Выбрано: 1 из 1')
  })

  it('renders backend unavailable reason states and empty candidate states safely', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope({
      count: 0,
      results: [],
      remaining_slots: 0,
      can_invite: false,
      reason_code: 'slots_exhausted',
    })

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="expert-invitation-unavailable"]').text()).toContain('Все слоты приглашений уже использованы')
    expect(wrapper.get('[data-testid="expert-invitation-available-empty"]').text()).toContain('Подходящие эксперты не найдены')
    expect(wrapper.get('[data-testid="expert-invitation-send"]').attributes('disabled')).toBeDefined()
  })

  it('keeps selected candidates for retry and sanitizes invitation mutation errors', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.data.value = buildEligibleExpertsEnvelope()
    createExpertInvitationsMutationState.mutateAsync.mockRejectedValue(new Error('timeout Authorization: Bearer secret'))

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    await wrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').setValue(true)
    await wrapper.get('[data-testid="expert-invitation-send"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="expert-invitation-mutation-error"]').text()).toContain('Не удалось обновить приглашения экспертов')
    expect(wrapper.text()).not.toContain('Bearer secret')
    expect(wrapper.get('[data-testid="expert-invitation-candidate-expert-1"]').element).toHaveProperty('checked', true)
  })

  it('shows a retryable selector error when candidate discovery fails', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    eligibleExpertsState.isError.value = true
    eligibleExpertsState.error.value = new Error('traceback secret')

    const { wrapper } = await mountQuestionDetailPage(true)
    await openExpertInvitationDialog(wrapper)

    expect(wrapper.get('[data-testid="expert-invitation-available-error"]').text()).toContain('Не удалось обновить приглашения экспертов')
    expect(wrapper.text()).not.toContain('traceback secret')

    await wrapper.get('[data-testid="expert-invitation-available-error"] button').trigger('click')

    expect(eligibleExpertsState.refetch).toHaveBeenCalled()
  })

  it('renders protected newcomer state with compact chip, modal-only policy, answer block, and vote block', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
      protected_until: '2026-03-01T23:59:00Z',
      author_level: 'newcomer',
      author_points_to_next_level: 30,
      author_next_level: 'participant',
      author_next_level_label: 'Участник',
      viewer_can_answer: false,
      viewer_answer_reason_code: 'answer_blocked_insufficient_level',
      viewer_answer_reason_message: 'Этот вопрос новичка защищён на первые 12 часов. Отвечать сейчас могут только участники уровня Эксперт или Мастер.',
      viewer_answer_required_level: 'expert',
      viewer_answer_required_level_label: 'Эксперт',
      viewer_level: 'participant',
      viewer_level_label: 'Участник',
      viewer_points_to_next_level: 70,
      viewer_next_level: 'expert',
      viewer_next_level_label: 'Эксперт',
      viewer_can_downvote: false,
      viewer_downvote_reason_code: 'question_downvote_blocked_protected',
      viewer_downvote_reason_message: 'В первые 12 часов после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.',
    })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.get('[data-testid="protected-question-chip"]').text()).toBe('Защита 12 часов')
    expect(wrapper.find('[data-testid="question-protection-badge"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-protection-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="protected-question-info-dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Защита новых авторов включена')
    expect(wrapper.text()).not.toContain('даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только участники уровня Эксперт или Мастер')
    expect(wrapper.get('[data-testid="solution-composer-progress-hint"]').text()).toContain('не хватает 70 очков до уровня Эксперт')
    expect(wrapper.get('[data-testid="question-invitation-context-ordinary-blocked"]').text()).toContain('У вас нет активного приглашения')
    expect(wrapper.find('[data-testid="vote-downvote-blocked"]').exists()).toBe(true)

    await wrapper.get('[data-testid="protected-question-chip"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-dialog"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 12 часов после публикации')
    expect(wrapper.get('[data-testid="protected-question-info-votes"]').text()).toContain('Даунвоуты на защищённый вопрос временно отключены')
    expect(wrapper.text()).not.toContain('Написать решение')
  })

  it('shows active invitation context only for matching recipient notifications while composer remains backend-controlled', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      is_protected: true,
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_level: 'master',
      viewer_level_label: 'Мастер',
    })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    notificationsState.data.value = {
      count: 2,
      next: null,
      previous: null,
      results: [
        buildInvitationNotification({ source_question_id: 'other-question' }),
        buildInvitationNotification(),
      ],
    }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.get('[data-testid="question-invitation-context-active"]').text()).toContain('сервер разрешил вам ответить')
    expect(wrapper.text()).toContain('Написать решение')
    expect(wrapper.find('[data-testid="solution-composer-blocked-reason"]').exists()).toBe(false)
  })

  it('hides invitation recipient context for authors and unprotected questions', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    notificationsState.data.value = { count: 1, next: null, previous: null, results: [buildInvitationNotification()] }

    const author = await mountQuestionDetailPage(true)
    expect(author.wrapper.find('[data-testid="question-invitation-context-panel"]').exists()).toBe(false)
    author.wrapper.unmount()

    questionDetailState.data.value = buildQuestionDetail({ is_protected: false })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    const unprotected = await mountQuestionDetailPage(true)
    expect(unprotected.wrapper.find('[data-testid="question-invitation-context-panel"]').exists()).toBe(false)
  })

  it('does not let stale or malformed-looking notification metadata unblock the answer prompt', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      is_protected: true,
      viewer_can_answer: false,
      viewer_answer_reason_code: 'answer_blocked_insufficient_level',
      viewer_answer_reason_message: 'Сервер по-прежнему блокирует ответ.',
    })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    notificationsState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [buildInvitationNotification({
        invitation_status: 'expired',
        protected_window_active: false,
        protected_window_ended: true,
        cta_url: null,
        protected_until: null,
      })],
    }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.get('[data-testid="question-invitation-context-stale"]').text()).toContain('Наличие уведомления не является разрешением')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Сервер по-прежнему блокирует ответ')
    expect(wrapper.text()).not.toContain('Написать решение')
  })

  it('degrades notification query errors to ordinary protected context without exposing raw errors', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      is_protected: true,
      viewer_can_answer: false,
      viewer_answer_reason_message: 'Сервер временно ограничивает ответы.',
    })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    notificationsState.isError.value = true

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.get('[data-testid="question-invitation-context-warning"]').text()).toContain('Не удалось проверить ваши приглашения')
    expect(wrapper.get('[data-testid="question-invitation-context-ordinary-blocked"]').text()).toContain('У вас нет активного приглашения')
    expect(wrapper.text()).not.toContain('Error:')
  })

  it('keeps legacy payloads readable by falling back to default protection state', async () => {
    questionDetailState.data.value = {
      question_id: 'question-1',
      user: 'user-1',
      question_title: 'Legacy payload without protection metadata',
      question_body: 'Старые ответы API не должны ломать detail page.',
      question_status: 'open',
      question_created_at: '2026-03-01T12:00:00Z',
      question_updated_at: '2026-03-02T12:00:00Z',
      tags: [],
      upvotes: 1,
      downvotes: 0,
      score: 1,
      user_vote: null,
    }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Legacy payload without protection metadata')
    expect(wrapper.find('[data-testid="protected-question-chip"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-protection-badge"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-protection-panel"]').exists()).toBe(false)
  })
  it('renders linked public tag chips on the question detail hero', async () => {
    questionDetailState.data.value = {
      question_id: 'question-1',
      user: 'user-1',
      question_title: 'Как типизировать теги на detail page?',
      question_body: 'Нужно показать теги рядом с описанием вопроса.',
      question_status: 'open',
      question_created_at: '2026-03-01T12:00:00Z',
      question_updated_at: '2026-03-02T12:00:00Z',
      tags: [
        { name: 'typescript', questions_count: 21 },
        { name: 'vue-router', questions_count: 7 },
      ],
      upvotes: 4,
      downvotes: 1,
      score: 3,
      user_vote: null,
    }

    const { wrapper } = await mountQuestionDetailPage()

    const chips = wrapper.find('[data-testid="question-tag-chips"]')
    expect(chips.exists()).toBe(true)
    expect(chips.text()).toContain('#typescript')
    expect(chips.text()).toContain('#vue-router')
    expect(chips.text()).not.toContain('questions_count')

    const tagLinks = chips.findAll('a')
    expect(tagLinks).toHaveLength(2)
    expect(tagLinks[0].attributes('href')).toBe('/?tag=typescript')
    expect(tagLinks[0].attributes('aria-label')).toBe('Фильтровать вопросы по тегу typescript')
    expect(tagLinks[1].attributes('href')).toBe('/?tag=vue-router')
  })

  it('does not render an empty tag chip container on untagged question detail', async () => {
    questionDetailState.data.value = {
      question_id: 'question-1',
      user: 'user-1',
      question_title: 'Legacy detail question remains readable',
      question_body: 'Старый вопрос без тегов должен показывать тело и метаданные.',
      question_status: 'open',
      question_created_at: '2026-03-01T12:00:00Z',
      question_updated_at: '2026-03-02T12:00:00Z',
      tags: [],
      upvotes: 0,
      downvotes: 0,
      score: 0,
      user_vote: null,
    }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Legacy detail question remains readable')
    expect(wrapper.find('[data-testid="question-tag-chips"]').exists()).toBe(false)
  })

  it('renders compact master reputation for the question author profile', async () => {
    questionDetailState.data.value = buildQuestionDetail()
    profileState.data.value = {
      user_id: 'user-1',
      user_name: 'Master Alice',
      user_reputation_score: 510,
      user_avatar_url: null,
      user_bio: null,
      user_created_at: '2026-03-01T12:00:00Z',
      reputation: {
        score: 510,
        level: 'master',
        level_label: 'Master',
        next_level: null,
        points_to_next_level: 0,
      },
    }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Master Alice')
    const badge = wrapper.get('[data-testid="author-reputation-badge"]')
    expect(badge.text()).toContain('Master')
    expect(badge.text()).toContain('510')
    expect(badge.get('[data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('master')
    expect(badge.findAll('[data-rank-part="star"]')).toHaveLength(3)
    expect(wrapper.text()).not.toContain('manual_level')
  })

  it('keeps legacy public author fixtures readable when only reputation score is present', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      question_title: 'Legacy detail author reputation remains readable',
    })
    profileState.data.value = {
      user_name: 'Legacy Author',
      user_reputation_score: 37,
      user_created_at: '2026-03-01T12:00:00Z',
    }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Legacy detail author reputation remains readable')
    expect(wrapper.text()).toContain('Legacy Author')
    const badge = wrapper.get('[data-testid="author-reputation-badge"]')
    expect(badge.text()).toContain('Репутация')
    expect(badge.text()).toContain('37')
  })

  it('hides the edit and proposal actions for guests, authorship mismatches, and unresolved current-user state', async () => {
    questionDetailState.data.value = buildQuestionDetail({ user: 'author-1' })

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).not.toContain('Редактировать вопрос')
    expect(wrapper.text()).not.toContain('Предложить правку')

    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    await flushPromises()
    expect(wrapper.text()).not.toContain('Редактировать вопрос')
    expect(wrapper.text()).toContain('Предложить правку')

    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    currentUserState.isPending.value = true
    await flushPromises()
    expect(wrapper.text()).not.toContain('Редактировать вопрос')
    expect(wrapper.text()).not.toContain('Предложить правку')
  })

  it('keeps proposal success pending-only for authenticated non-authors', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      question_title: 'Original visible title',
      tags: [{ name: 'vue', questions_count: 2 }],
    })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    createQuestionEditMutationState.mutateAsync.mockResolvedValue({ question_edit_id: 'edit-1' })

    const { wrapper } = await mountQuestionDetailPage()

    const proposalButton = wrapper.findAll('button').find((button) => button.text() === 'Предложить правку')
    expect(proposalButton).toBeDefined()

    await proposalButton!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('#question-edit-proposal-title').exists()).toBe(true)

    await wrapper.get('#question-edit-proposal-title').setValue('Pending proposed title')
    await wrapper.get('form.question-edit-proposal-modal').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith({
      question: 'question-1',
      question_edit_title_after: 'Pending proposed title',
      question_edit_body_after: 'Нужно собрать question-first detail route без активного голосования.',
      tags: ['vue'],
    })
    expect(questionDetailState.refetch).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Правка отправлена на проверку автору вопроса.')
    expect(wrapper.text()).toContain('Original visible title')
    expect(wrapper.text()).not.toContain('Pending proposed title')
  })

  it('keeps the proposal dialog open and preserves draft on submit failure', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      tags: [{ name: 'vue', questions_count: 2 }],
    })
    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    createQuestionEditMutationState.mutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { detail: 'Вы не автор оригинального вопроса', traceback: 'Authorization: Bearer secret' },
      },
    })

    const { wrapper } = await mountQuestionDetailPage()

    const proposalButton = wrapper.findAll('button').find((button) => button.text() === 'Предложить правку')
    await proposalButton!.trigger('click')
    await wrapper.get('#question-edit-proposal-title').setValue('Draft proposal title')
    await wrapper.get('form.question-edit-proposal-modal').trigger('submit.prevent')
    await flushPromises()

    expect(questionDetailState.refetch).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Вы не автор оригинального вопроса')
    expect(wrapper.text()).not.toContain('Bearer secret')
    expect((wrapper.get('#question-edit-proposal-title').element as HTMLInputElement).value).toBe('Draft proposal title')
  })

  it('keeps authors on direct edit only without rendering proposal action', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      tags: [{ name: 'vue', questions_count: 2 }],
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Редактировать вопрос')
    expect(wrapper.text()).not.toContain('Предложить правку')
  })

  it('lets the positively identified author open and cancel the edit dialog without mutating', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      tags: [{ name: 'vue', questions_count: 2 }],
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }

    const { wrapper } = await mountQuestionDetailPage()

    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Редактировать вопрос')
    expect(editButton).toBeDefined()

    await editButton!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('#question-edit-title').exists()).toBe(true)

    const closeButton = wrapper.findAll('button').find((button) => button.text() === 'Закрыть')
    expect(closeButton).toBeDefined()

    await closeButton!.trigger('click')
    await flushPromises()

    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('refetches detail after a successful edit, closes the dialog, and renders the saved state notice', async () => {
    const updatedQuestion = buildQuestionDetail({
      user: 'author-1',
      question_title: 'Как безопасно обновить вопрос?',
      question_body: 'Обновлённое тело вопроса из backend response.',
      question_updated_at: '2026-03-03T12:00:00Z',
      tags: [
        { name: 'vue', questions_count: 3 },
        { name: 'django', questions_count: 5 },
      ],
    })

    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      tags: [{ name: 'vue', questions_count: 2 }],
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    updateQuestionMutationState.mutateAsync.mockResolvedValue(updatedQuestion)
    questionDetailState.refetch.mockImplementation(async () => {
      questionDetailState.data.value = updatedQuestion
      return { data: updatedQuestion }
    })

    const { wrapper } = await mountQuestionDetailPage()

    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Редактировать вопрос')
    await editButton!.trigger('click')
    await wrapper.get('#question-edit-title').setValue('Как безопасно обновить вопрос?')
    await wrapper.get('#question-edit-body').setValue('Обновлённое тело вопроса из backend response.')
    await wrapper.get('form.question-edit-form').trigger('submit.prevent')
    await flushPromises()

    expect(updateQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      payload: {
        question_title: 'Как безопасно обновить вопрос?',
        question_body: 'Обновлённое тело вопроса из backend response.',
        tags: ['vue'],
      },
    })
    expect(questionDetailState.refetch).toHaveBeenCalledTimes(1)
    expect(solutionsState.refetch).not.toHaveBeenCalled()
    expect(commentState.refetch).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Изменения сохранены. Вопрос обновлён данными с сервера.')
    expect(wrapper.text()).toContain('Как безопасно обновить вопрос?')
    expect(wrapper.text()).toContain('Обновлённое тело вопроса из backend response.')
  })

  it('keeps the edit dialog open with safe form feedback when save fails', async () => {
    questionDetailState.data.value = buildQuestionDetail({
      user: 'author-1',
      tags: [{ name: 'vue', questions_count: 2 }],
    })
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    updateQuestionMutationState.mutateAsync.mockRejectedValue(new Error('forbidden Authorization: Bearer secret'))

    const { wrapper } = await mountQuestionDetailPage()

    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Редактировать вопрос')
    await editButton!.trigger('click')
    await wrapper.get('#question-edit-title').setValue('Черновик остаётся после ошибки')
    await wrapper.get('form.question-edit-form').trigger('submit.prevent')
    await flushPromises()

    expect(questionDetailState.refetch).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Не удалось сохранить изменения. Попробуйте ещё раз.')
    expect(wrapper.text()).not.toContain('Bearer secret')
    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe('Черновик остаётся после ошибки')
  })
})
