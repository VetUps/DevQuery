import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { useSessionStore } from '@/features/auth/stores/session'
import { normalizeSolutionSubmitError } from '@/features/solutions/libs/solution-form-errors'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'

const questionDetailState = {
  data: ref(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const solutionsState = {
  data: ref<any[]>([]),
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
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const createSolutionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const bestSolutionMutationState = {
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

vi.mock('@/features/solutions/mutations/useCreateSolutionMutation', () => ({
  useCreateSolutionMutation: vi.fn(() => createSolutionMutationState),
}))

vi.mock('@/features/solutions/mutations/useBestSolutionMutation', () => ({
  useBestSolutionMutation: vi.fn(() => bestSolutionMutationState),
}))

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
      { path: '/questions/:questionId', component: QuestionDetailPage },
      { path: '/register', component: { template: '<div>register</div>' } },
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

function buildQuestionDetail() {
  return {
    question_id: 'question-1',
    user: 'author-1',
    question_title: 'Как собрать модальный solution flow?',
    question_body: 'Нужно аккуратно добавить решение и прокрутить к нему страницу.',
    question_status: 'open',
    question_created_at: '2026-04-01T12:00:00Z',
    question_updated_at: '2026-04-02T12:00:00Z',
    upvotes: 8,
    downvotes: 1,
    score: 7,
    user_vote: null,
    tags: [],
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
}

function buildSolution(overrides: Record<string, unknown> = {}) {
  return {
    solution_id: 'solution-1',
    user: 'author-2',
    question_id: 'question-1',
    solution_body: 'Базовое решение с кодом.',
    solution_is_best: false,
    solution_created_at: '2026-04-02T10:00:00Z',
    solution_updated_at: '2026-04-02T11:00:00Z',
    upvotes: 3,
    downvotes: 0,
    score: 3,
    user_vote: null,
    ...overrides,
  }
}

describe('solution authoring flow', () => {
  beforeEach(() => {
    queryClient.clear()
    HTMLElement.prototype.scrollIntoView = vi.fn()

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

    profileState.data.value = {
      user_name: 'Автор',
      user_role: 'user',
      user_reputation_score: 100,
      user_created_at: '2026-03-01T12:00:00Z',
    }
    profileState.isPending.value = false
    profileState.isError.value = false
    profileState.refetch.mockReset()

    currentUserState.data.value = null
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    currentUserState.refetch.mockReset()

    createSolutionMutationState.isPending.value = false
    createSolutionMutationState.mutateAsync.mockReset()

    bestSolutionMutationState.isPending.value = false
    bestSolutionMutationState.mutateAsync.mockReset()
    vi.restoreAllMocks()
  })

  it('shows the guest participation prompt with a register CTA', async () => {
    const { wrapper } = await mountQuestionDetailPage(false)

    expect(wrapper.text()).toContain('Чтобы предложить решение, создайте аккаунт')

    const registerLink = wrapper.findAll('a').find((link) => link.text().includes('Создать аккаунт'))
    expect(registerLink?.attributes('href')).toBe('/register')
  })

  it('renders compact newcomer reputation on solution author metadata', async () => {
    solutionsState.data.value = [
      buildSolution({
        user_name: 'Newcomer Nina',
        reputation: {
          score: 8,
          level: 'newcomer',
          level_label: 'Newcomer',
          next_level: 'participant',
          points_to_next_level: 42,
        },
      }),
    ]

    const { wrapper } = await mountQuestionDetailPage(false)

    expect(wrapper.text()).toContain('Newcomer Nina')
    const badge = wrapper.findAll('[data-testid="author-reputation-badge"]')
      .find((candidate) => candidate.text().includes('Newcomer') && candidate.text().includes('8'))
    expect(badge).toBeTruthy()
    expect(badge?.get('[data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('newcomer')
    expect(badge?.findAll('[data-rank-part="star"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('points_to_next_level')
  })

  it('renders solution author legacy score-only reputation without crashing', async () => {
    solutionsState.data.value = [
      buildSolution({
        user_name: 'Legacy Solver',
        user_reputation_score: 64,
      }),
    ]

    const { wrapper } = await mountQuestionDetailPage(false)

    expect(wrapper.text()).toContain('Legacy Solver')
    const badgeTexts = wrapper.findAll('[data-testid="author-reputation-badge"]').map((badge) => badge.text())
    expect(badgeTexts.some((text) => text.includes('Репутация') && text.includes('64'))).toBe(true)
  })

  it('shows a protected-question block for participants during the expert-only answer window', async () => {
    currentUserState.data.value = {
      user_id: 'participant-1',
      user_name: 'Participant',
    }
    questionDetailState.data.value = {
      ...buildQuestionDetail(),
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
      protected_until: '2026-04-01T23:59:00Z',
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
    }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.text()).toContain('Ответ временно ограничен')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только участники уровня Эксперт или Мастер')
    expect(wrapper.get('[data-testid="solution-composer-progress-hint"]').text()).toContain('не хватает 70 очков до уровня Эксперт')
    expect(wrapper.findAll('button').some((button) => button.text().trim() === 'Написать решение')).toBe(false)
  })

  it('keeps answer authoring available for experts on protected newcomer questions', async () => {
    currentUserState.data.value = {
      user_id: 'expert-1',
      user_name: 'Expert',
    }
    questionDetailState.data.value = {
      ...buildQuestionDetail(),
      is_protected: true,
      protection_reason_code: 'question_protected_newcomer',
      protected_until: '2026-04-01T23:59:00Z',
      author_level: 'newcomer',
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_answer_required_level: 'expert',
      viewer_answer_required_level_label: 'Эксперт',
      viewer_level: 'expert',
      viewer_level_label: 'Эксперт',
      viewer_points_to_next_level: 200,
      viewer_next_level: 'master',
      viewer_next_level_label: 'Мастер',
      viewer_can_downvote: false,
      viewer_downvote_reason_code: 'question_downvote_blocked_protected',
      viewer_downvote_reason_message: 'В первые 12 часов после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.',
    }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.text()).toContain('Есть рабочее решение?')
    const openComposerButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Написать решение')
    expect(openComposerButton).toBeDefined()
  })

  it('returns to the regular composer after the protected window expires', async () => {
    currentUserState.data.value = {
      user_id: 'participant-1',
      user_name: 'Participant',
    }
    questionDetailState.data.value = {
      ...buildQuestionDetail(),
      is_protected: false,
      protection_reason_code: 'question_not_protected',
      protected_until: null,
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_can_downvote: true,
      viewer_downvote_reason_code: 'question_downvote_allowed',
      viewer_downvote_reason_message: '',
    }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.text()).toContain('Есть рабочее решение?')
    expect(wrapper.find('[data-testid="solution-composer-blocked-reason"]').exists()).toBe(false)
    const openComposerButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Написать решение')
    expect(openComposerButton).toBeDefined()
  })

  it('renders the existing-solution notice for the current author', async () => {
    currentUserState.data.value = {
      user_id: 'user-own',
      user_name: 'Own User',
    }
    solutionsState.data.value = [buildSolution({ solution_id: 'solution-own', user: 'user-own' })]

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.text()).toContain('Вы уже ответили на этот вопрос')
  })

  it('does not allow the question author to post their own solution', async () => {
    currentUserState.data.value = {
      user_id: 'author-1',
      user_name: 'Question Author',
    }

    const { wrapper } = await mountQuestionDetailPage(true)

    expect(wrapper.text()).toContain('Вы автор вопроса')
    expect(wrapper.text()).not.toContain('Есть рабочее решение?')
  })

  it('lets the question author mark a community solution as best', async () => {
    currentUserState.data.value = {
      user_id: 'author-1',
      user_name: 'Question Author',
    }
    solutionsState.data.value = [buildSolution()]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    bestSolutionMutationState.mutateAsync.mockResolvedValue(buildSolution({ solution_is_best: true }))

    const { wrapper } = await mountQuestionDetailPage(true)

    const bestButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Выбрать лучшим')
    expect(bestButton).toBeDefined()

    await bestButton!.trigger('click')
    await flushPromises()

    expect(bestSolutionMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      solutionId: 'solution-1',
      solution_is_best: true,
    })
  })

  it('normalizes the duplicate-solution backend error into user-facing copy', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: {
          non_field_errors: ['Пользователь уже выложил решение на данный вопрос'],
        },
      },
    }

    expect(normalizeSolutionSubmitError(error)).toBe('Вы уже ответили на этот вопрос. Откройте своё решение ниже.')
  })

  it('submits a new solution, shows the success banner, and highlights the created card', async () => {
    currentUserState.data.value = {
      user_id: 'user-new',
      user_name: 'Answer Author',
    }
    solutionsState.data.value = [buildSolution()]

    createSolutionMutationState.mutateAsync.mockResolvedValue({
      solution_id: 'solution-new',
      user: 'user-new',
      question: 'question-1',
      solution_body: 'Новое решение с кодом.',
      solution_is_best: false,
      solution_created_at: '2026-04-03T10:00:00Z',
      solution_updated_at: '2026-04-03T10:00:00Z',
    })

    solutionsState.refetch.mockImplementation(async () => {
      solutionsState.data.value = [
        buildSolution(),
        buildSolution({
          solution_id: 'solution-new',
          user: 'user-new',
          solution_body: 'Новое решение с кодом.',
          solution_created_at: '2026-04-03T10:00:00Z',
          solution_updated_at: '2026-04-03T10:00:00Z',
        }),
      ]

      return { data: solutionsState.data.value }
    })

    const { wrapper } = await mountQuestionDetailPage(true)

    const openComposerButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Написать решение')
    expect(openComposerButton).toBeDefined()
    await openComposerButton!.trigger('click')
    await flushPromises()

    await wrapper.get('#solution-body').setValue('Новое решение с кодом.')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createSolutionMutationState.mutateAsync).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Решение добавлено.')
    expect(wrapper.find('#solution-solution-new').exists()).toBe(true)
    expect(wrapper.find('.solution-read-card--fresh').exists()).toBe(true)
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
