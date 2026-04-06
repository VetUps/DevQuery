import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useSessionStore } from '@/features/auth/stores/session'
import { normalizeSolutionSubmitError } from '@/features/solutions/lib/solution-form-errors'
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
      plugins: [pinia, router],
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
  })

  it('shows the guest participation prompt with a register CTA', async () => {
    const { wrapper } = await mountQuestionDetailPage(false)

    expect(wrapper.text()).toContain('Чтобы предложить решение, создайте аккаунт')

    const registerLink = wrapper.findAll('a').find((link) => link.text().includes('Создать аккаунт'))
    expect(registerLink?.attributes('href')).toBe('/register')
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
    expect(wrapper.text()).toContain('Решение добавлено. Мы перенесли вас к нему ниже.')
    expect(wrapper.find('#solution-solution-new').exists()).toBe(true)
    expect(wrapper.find('.solution-read-card--fresh').exists()).toBe(true)
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
