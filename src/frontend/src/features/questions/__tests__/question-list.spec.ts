import { nextTick, ref, toValue } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import { useSessionStore } from '@/features/auth/stores/session'
import { useNotificationsQuery } from '@/features/notifications/queries/useNotificationsQuery'
import { useQuestionListQuery } from '@/features/questions/queries/useQuestionListQuery'

const notificationQueryState = {
  data: ref<any>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  isPlaceholderData: ref(false),
  refetch: vi.fn(),
}

const queryState = {
  data: ref<any>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  isPlaceholderData: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => notificationQueryState),
}))

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn(() => queryState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => ({
    data: ref([]),
    isError: ref(false),
    isFetching: ref(false),
  })),
}))

async function mountHomePage(initialPath = '/', options: { authenticated?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const sessionStore = useSessionStore()

  if (options.authenticated) {
    sessionStore.setSession({ access: 'access-token', refresh: 'refresh-token' })
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/questions/:questionId', component: { template: '<div>question detail</div>' } },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })

  await router.push(initialPath)
  await router.isReady()

  const wrapper = mount(HomePage, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: {
        teleport: true,
      },
    },
  })

  await flushPromises()

  return { wrapper, router, sessionStore }
}

describe('question list home page', () => {
  beforeEach(() => {
    localStorage.clear()
    queryState.data.value = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    }
    notificationQueryState.data.value = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    }
    queryState.isPending.value = false
    queryState.isError.value = false
    queryState.isPlaceholderData.value = false
    queryState.refetch.mockReset()
    notificationQueryState.isPending.value = false
    notificationQueryState.isError.value = false
    notificationQueryState.isPlaceholderData.value = false
    notificationQueryState.refetch.mockReset()
    vi.mocked(useQuestionListQuery).mockClear()
    vi.mocked(useNotificationsQuery).mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('renders the loading skeleton while the list query is pending', async () => {
    queryState.data.value = null
    queryState.isPending.value = true

    const { wrapper } = await mountHomePage()

    expect(wrapper.find('[data-testid="question-list-skeleton"]').exists()).toBe(true)
  })

  it('renders the plain empty state when there are no questions', async () => {
    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Вопросов пока нет')
  })

  it('renders the retry action when the list query fails', async () => {
    queryState.isError.value = true

    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Попробовать снова')

    await wrapper.get('[data-testid="question-list-state-error"] button').trigger('click')

    expect(queryState.refetch).toHaveBeenCalled()
  })


  it('highlights only questions matching authenticated expert invitation notifications', async () => {
    queryState.data.value = {
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-invited',
          user: 'user-1',
          question_title: 'Как масштабировать Vue Query notifications?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
        {
          question_id: 'question-public',
          user: 'user-2',
          question_title: 'Обычный публичный вопрос без приглашения',
          question_status: 'open',
          question_created_at: '2026-03-01T13:00:00Z',
          question_updated_at: '2026-03-02T13:00:00Z',
          tags: [],
        },
      ],
    }
    notificationQueryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          notification_id: 'notification-secret-1',
          notification_type: 'expert_invitation',
          title: 'Private title',
          message: 'Private payload',
          payload: { recipient: 'expert-1' },
          source_question_id: 'question-invited',
          created_at: '2026-03-01T12:30:00Z',
          read_at: '2026-03-01T12:40:00Z',
          expires_at: null,
          is_read: true,
          is_expired: false,
          invitation_status: 'pending',
          protected_window_active: false,
          protected_window_ended: false,
          protected_until: null,
          cta_url: '/questions/11111111-1111-1111-1111-111111111111',
        },
      ],
    }

    const { wrapper } = await mountHomePage('/', { authenticated: true })

    const enabledSource = vi.mocked(useNotificationsQuery).mock.calls.at(-1)?.[0]
    expect(toValue(enabledSource)).toBe(true)
    const cards = wrapper.findAll('[data-testid="question-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].attributes('data-invited-for-current-user')).toBe('true')
    expect(cards[0].classes()).toContain('question-card--invited')
    expect(cards[0].get('[data-testid="question-card-invited-badge"]').text()).toBe('Вас позвали ответить')
    expect(cards[1].attributes('data-invited-for-current-user')).toBe('false')
    expect(cards[1].find('[data-testid="question-card-invited-badge"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('notification-secret-1')
    expect(wrapper.text()).not.toContain('Private payload')
    expect(wrapper.text()).not.toContain('expert-1')
    expect(wrapper.text()).not.toContain('2026-03-01T12:40:00Z')
  })

  it('ignores unrelated notification types, null source ids, and invitations for questions off the current page', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-visible',
          user: 'user-1',
          question_title: 'Публичный вопрос без подходящего приглашения',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
      ],
    }
    notificationQueryState.data.value = {
      count: 3,
      next: null,
      previous: null,
      results: [
        { notification_type: 'system', source_question_id: 'question-visible' },
        { notification_type: 'expert_invitation', source_question_id: null },
        { notification_type: 'expert_invitation', source_question_id: 'question-off-page' },
      ],
    }

    const { wrapper } = await mountHomePage('/', { authenticated: true })

    const card = wrapper.get('[data-testid="question-card"]')
    expect(card.attributes('data-invited-for-current-user')).toBe('false')
    expect(card.find('[data-testid="question-card-invited-badge"]').exists()).toBe(false)
  })

  it('keeps the public feed unhighlighted when notifications are pending or fail', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-visible',
          user: 'user-1',
          question_title: 'Лента остаётся видимой без notification highlight',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
      ],
    }
    notificationQueryState.data.value = undefined
    notificationQueryState.isPending.value = true

    const { wrapper } = await mountHomePage('/', { authenticated: true })

    expect(wrapper.text()).toContain('Лента остаётся видимой без notification highlight')
    expect(wrapper.get('[data-testid="question-card"]').attributes('data-invited-for-current-user')).toBe('false')

    notificationQueryState.isPending.value = false
    notificationQueryState.isError.value = true
    await flushPromises()

    expect(wrapper.text()).toContain('Лента остаётся видимой без notification highlight')
    expect(wrapper.get('[data-testid="question-card"]').attributes('data-invited-for-current-user')).toBe('false')
    expect(wrapper.find('[data-testid="question-list-state-error"]').exists()).toBe(false)
  })

  it('does not enable notification matching for anonymous home viewers', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-visible',
          user: 'user-1',
          question_title: 'Анонимный просмотр публичной ленты',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
      ],
    }
    notificationQueryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [{ notification_type: 'expert_invitation', source_question_id: 'question-visible' }],
    }

    const { wrapper } = await mountHomePage()

    const enabledSource = vi.mocked(useNotificationsQuery).mock.calls.at(-1)?.[0]
    expect(toValue(enabledSource)).toBe(false)
    expect(wrapper.get('[data-testid="question-card"]').attributes('data-invited-for-current-user')).toBe('false')
    expect(wrapper.find('[data-testid="question-card-invited-badge"]').exists()).toBe(false)
  })

  it('reacts to post-mount authentication changes without leaking private notification payloads', async () => {
    queryState.data.value = {
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-auth-flip-invited',
          user: 'user-1',
          question_title: 'Вопрос получает приглашение после входа',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
        {
          question_id: 'question-auth-flip-public',
          user: 'user-2',
          question_title: 'Публичный вопрос без личного приглашения',
          question_status: 'open',
          question_created_at: '2026-03-01T13:00:00Z',
          question_updated_at: '2026-03-02T13:00:00Z',
          tags: [],
        },
      ],
    }
    notificationQueryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          notification_id: 'private-auth-flip-notification',
          notification_type: 'expert_invitation',
          title: 'Private invitation title',
          message: 'Private invitation payload',
          payload: { recipient_email: 'expert@example.com' },
          source_question_id: 'question-auth-flip-invited',
          created_at: '2026-03-01T12:30:00Z',
          read_at: null,
          expires_at: null,
          is_read: false,
          is_expired: false,
          invitation_status: 'pending',
          protected_window_active: false,
          protected_window_ended: false,
          protected_until: null,
          cta_url: '/questions/question-auth-flip-invited',
        },
      ],
    }

    const { wrapper, sessionStore } = await mountHomePage()
    const enabledSource = vi.mocked(useNotificationsQuery).mock.calls.at(-1)?.[0]

    expect(toValue(enabledSource)).toBe(false)
    expect(wrapper.findAll('[data-testid="question-card"]')[0].attributes('data-invited-for-current-user')).toBe('false')
    expect(wrapper.find('[data-testid="question-card-invited-badge"]').exists()).toBe(false)

    sessionStore.setSession({ access: 'access-token', refresh: 'refresh-token' })
    await nextTick()

    const cardsAfterLogin = wrapper.findAll('[data-testid="question-card"]')
    expect(toValue(enabledSource)).toBe(true)
    expect(cardsAfterLogin[0].attributes('data-invited-for-current-user')).toBe('true')
    expect(cardsAfterLogin[0].get('[data-testid="question-card-invited-badge"]').text()).toBe('Вас позвали ответить')
    expect(cardsAfterLogin[1].attributes('data-invited-for-current-user')).toBe('false')
    expect(wrapper.text()).not.toContain('private-auth-flip-notification')
    expect(wrapper.text()).not.toContain('Private invitation payload')
    expect(wrapper.text()).not.toContain('expert@example.com')

    sessionStore.clearSession()
    await nextTick()

    expect(toValue(enabledSource)).toBe(false)
    expect(wrapper.findAll('[data-testid="question-card"]')[0].attributes('data-invited-for-current-user')).toBe('false')
    expect(wrapper.find('[data-testid="question-card-invited-badge"]').exists()).toBe(false)
  })

  it('keeps highlighted protected cards compact until the protection chip opens the modal', async () => {
    const answerBlockedReason = 'Этот вопрос новичка защищён на первые 12 часов. Отвечать сейчас могут только участники уровня Эксперт или Мастер.'
    const downvoteBlockedReason = 'В первые 12 часов после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.'

    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-protected-invited',
          user: 'user-protected',
          question_title: 'Приглашённый защищённый вопрос остаётся компактным',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          is_protected: true,
          protection_reason_code: 'question_protected_newcomer',
          protected_until: '2026-03-01T23:59:00Z',
          viewer_answer_reason_message: answerBlockedReason,
          viewer_downvote_reason_message: downvoteBlockedReason,
          viewer_answer_required_level_label: 'Эксперт',
          tags: [],
        },
      ],
    }
    notificationQueryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [{ notification_type: 'expert_invitation', source_question_id: 'question-protected-invited' }],
    }

    const { wrapper } = await mountHomePage('/', { authenticated: true })

    expect(wrapper.get('[data-testid="question-card-invited-badge"]').text()).toBe('Вас позвали ответить')
    expect(wrapper.get('[data-testid="question-card-protection"]').text()).toBe('Защита 12 часов')
    expect(wrapper.find('[data-testid="question-card-protection-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-card-answer-blocked-reason"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-card-downvote-blocked-reason"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="protected-question-info-dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(answerBlockedReason)
    expect(wrapper.text()).not.toContain(downvoteBlockedReason)

    await wrapper.get('[data-testid="question-card-protection"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-dialog"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 12 часов после публикации')
    expect(wrapper.text()).not.toContain(answerBlockedReason)
    expect(wrapper.text()).not.toContain(downvoteBlockedReason)
  })

  it('opens protected newcomer policy from a compact card chip without leaking inline copy', async () => {
    const answerBlockedReason = 'Этот вопрос новичка защищён на первые 12 часов. Отвечать сейчас могут только участники уровня Эксперт или Мастер.'
    const downvoteBlockedReason = 'В первые 12 часов после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.'

    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-protected-1',
          user: 'user-protected',
          question_title: 'Как пережить первые 12 часов вопроса новичка?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          is_protected: true,
          protection_reason_code: 'question_protected_newcomer',
          protected_until: '2026-03-01T23:59:00Z',
          author_level: 'newcomer',
          author_points_to_next_level: 30,
          author_next_level: 'participant',
          author_next_level_label: 'Участник',
          viewer_can_answer: false,
          viewer_answer_reason_code: 'answer_blocked_insufficient_level',
          viewer_answer_reason_message: answerBlockedReason,
          viewer_answer_required_level: 'expert',
          viewer_answer_required_level_label: 'Эксперт',
          viewer_level: 'participant',
          viewer_level_label: 'Участник',
          viewer_points_to_next_level: 70,
          viewer_next_level: 'expert',
          viewer_next_level_label: 'Эксперт',
          viewer_can_downvote: false,
          viewer_downvote_reason_code: 'question_downvote_blocked_protected',
          viewer_downvote_reason_message: downvoteBlockedReason,
          tags: [{ name: 'django', questions_count: 6 }],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.get('[data-testid="question-card-protection"]').text()).toBe('Защита 12 часов')
    expect(wrapper.find('[data-testid="question-card-protection-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-card-answer-blocked-reason"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-card-downvote-blocked-reason"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="protected-question-info-dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(answerBlockedReason)
    expect(wrapper.text()).not.toContain(downvoteBlockedReason)
    expect(wrapper.text()).not.toContain('В течение первых 12 часов после публикации отвечать могут только эксперты и мастера.')

    await wrapper.get('[data-testid="question-card-protection"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-dialog"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 12 часов после публикации')
    expect(wrapper.get('[data-testid="protected-question-info-policy"]').text()).toContain('Эксперт и выше')
    expect(wrapper.get('[data-testid="protected-question-info-policy"]').text()).not.toContain('Эксперт и Мастер')
    expect(wrapper.get('[data-testid="protected-question-info-votes"]').text()).toContain('Даунвоуты на защищённый вопрос временно отключены')
    expect(wrapper.text()).not.toContain(answerBlockedReason)
    expect(wrapper.text()).not.toContain(downvoteBlockedReason)
  })

  it('updates the protected chip label when the backend window duration changes', async () => {
    const answerBlockedReason = 'Этот вопрос новичка защищён на первые 24 часа. Отвечать сейчас могут только участники уровня Эксперт или Мастер.'
    const downvoteBlockedReason = 'В первые 24 часа после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.'

    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-protected-24h',
          user: 'user-protected',
          question_title: 'Как пережить первые 24 часа вопроса новичка?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          is_protected: true,
          protection_reason_code: 'question_protected_newcomer',
          protected_until: '2026-03-02T12:00:00Z',
          author_level: 'newcomer',
          author_points_to_next_level: 30,
          author_next_level: 'participant',
          author_next_level_label: 'Участник',
          viewer_can_answer: false,
          viewer_answer_reason_code: 'answer_blocked_insufficient_level',
          viewer_answer_reason_message: answerBlockedReason,
          viewer_answer_required_level: 'expert',
          viewer_answer_required_level_label: 'Эксперт',
          viewer_level: 'participant',
          viewer_level_label: 'Участник',
          viewer_points_to_next_level: 70,
          viewer_next_level: 'expert',
          viewer_next_level_label: 'Эксперт',
          viewer_can_downvote: false,
          viewer_downvote_reason_code: 'question_downvote_blocked_protected',
          viewer_downvote_reason_message: downvoteBlockedReason,
          tags: [{ name: 'django', questions_count: 6 }],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.get('[data-testid="question-card-protection"]').text()).toBe('Защита 24 часа')
    expect(wrapper.find('[data-testid="question-card-protection-panel"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(answerBlockedReason)
    expect(wrapper.text()).not.toContain(downvoteBlockedReason)

    await wrapper.get('[data-testid="question-card-protection"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('Защита 24 часов')
    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 24 часов после публикации')
    expect(wrapper.text()).not.toContain(answerBlockedReason)
    expect(wrapper.text()).not.toContain(downvoteBlockedReason)
  })

  it('renders linked public tag chips and compact expert reputation on tagged question cards', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-1',
          user: 'user-1',
          question_title: 'Как связать Vue Query и DRF tags?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          reputation: {
            score: 260,
            level: 'expert',
            level_label: 'Backend Expert',
            next_level: 'master',
            points_to_next_level: 90,
          },
          tags: [
            { name: 'vue', questions_count: 12 },
            { name: 'django-rest-framework', questions_count: 8 },
          ],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    const badge = wrapper.get('[data-testid="author-reputation-badge"]')
    expect(badge.text()).toContain('Backend Expert')
    expect(badge.text()).toContain('260')
    expect(badge.attributes('aria-label')).toBe('Репутация автора: Backend Expert, 260 очк.')

    const chips = wrapper.find('[data-testid="question-tag-chips"]')
    expect(chips.exists()).toBe(true)
    expect(chips.text()).toContain('#vue')
    expect(chips.text()).toContain('#django-rest-framework')
    expect(chips.text()).not.toContain('questions_count')

    const tagLinks = chips.findAll('a')
    expect(tagLinks).toHaveLength(2)
    expect(tagLinks[0].attributes('href')).toBe('/?tag=vue')
    expect(tagLinks[0].attributes('aria-label')).toBe('Фильтровать вопросы по тегу vue')
    expect(tagLinks[1].attributes('href')).toBe('/?tag=django-rest-framework')
  })

  it('renders a legacy score-only reputation badge without requiring summary metadata', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-legacy-reputation',
          user: 'user-legacy',
          question_title: 'Legacy question with score-only reputation remains readable',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          user_reputation_score: 42,
          tags: [],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Legacy question with score-only reputation remains readable')
    expect(wrapper.find('[data-testid="question-card-protection"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="protected-question-info-dialog"]').exists()).toBe(false)
    const badge = wrapper.get('[data-testid="author-reputation-badge"]')
    expect(badge.text()).toContain('Репутация')
    expect(badge.text()).toContain('42')
  })

  it('does not render an empty tag chip container for untagged question cards', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-2',
          user: 'user-2',
          question_title: 'Legacy question without tags remains readable',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Legacy question without tags remains readable')
    expect(wrapper.find('[data-testid="question-tag-chips"]').exists()).toBe(false)
  })

  it('passes discovery URL params into the question list query', async () => {
    await mountHomePage('/?search=django&ordering=question_created_at&page=2')

    const params = toValue(vi.mocked(useQuestionListQuery).mock.calls.at(-1)?.[0])

    expect(params).toEqual({
      page: 2,
      search: 'django',
      ordering: 'question_created_at',
      tags: [],
    })
  })
})
