import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { useSessionStore } from '@/features/auth/stores/session'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
import type { QuestionDetail } from '@/features/questions/api/questions'

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
  data: ref({ user_id: 'author-newcomer', user_name: 'Newcomer Author' }),
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

vi.mock('@/features/questions/mutations/useUpdateQuestionMutation', () => ({
  useUpdateQuestionMutation: vi.fn(() => updateQuestionMutationState),
}))

vi.mock('@/features/questions/mutations/useCreateQuestionEditMutation', () => ({
  useCreateQuestionEditMutation: vi.fn(() => createQuestionEditMutationState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteQueryState),
}))

function buildBackendQuestion(overrides: Partial<QuestionDetail> = {}): QuestionDetail {
  return {
    question_id: 'protected-question-1',
    user: 'author-newcomer',
    question_title: 'Как защитить вопрос новичка от ранних минусов?',
    question_body: 'Читаемый текст вопроса должен оставаться доступным независимо от protected-window политики.',
    question_status: 'open',
    question_created_at: '2026-04-01T12:00:00Z',
    question_updated_at: '2026-04-01T12:00:00Z',
    tags: [{ name: 'django', questions_count: 4 }],
    upvotes: 3,
    downvotes: 0,
    score: 3,
    user_vote: null,
    is_protected: true,
    protection_reason_code: 'question_protected_newcomer',
    protected_until: '2026-04-02T00:00:00Z',
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
    ...overrides,
  }
}

async function mountProtectedQuestion(question: QuestionDetail) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const sessionStore = useSessionStore()
  sessionStore.setSession({ access: 'access-token', refresh: 'refresh-token' })
  questionDetailState.data.value = question

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/questions/:questionId', component: QuestionDetailPage },
      { path: '/register', component: { template: '<div>register</div>' } },
    ],
  })

  await router.push(`/questions/${question.question_id}`)
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

  return wrapper
}

describe('protected newcomer question integrated policy proof', () => {
  beforeEach(() => {
    queryClient.clear()

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

    profileState.data.value = { user_id: 'author-newcomer', user_name: 'Newcomer Author' }
    profileState.isPending.value = false
    profileState.isError.value = false
    profileState.refetch.mockReset()

    currentUserState.data.value = { user_id: 'viewer-1', user_name: 'Viewer' }
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    currentUserState.refetch.mockReset()

    createSolutionMutationState.isPending.value = false
    createSolutionMutationState.mutateAsync.mockReset()

    updateQuestionMutationState.isPending.value = false
    updateQuestionMutationState.mutateAsync.mockReset()

    createQuestionEditMutationState.isPending.value = false
    createQuestionEditMutationState.mutateAsync.mockReset()

    tagAutocompleteQueryState.data.value = []
    tagAutocompleteQueryState.isPending.value = false
    tagAutocompleteQueryState.isError.value = false
  })

  it('renders participant-visible protected metadata without hiding readable question content', async () => {
    const wrapper = await mountProtectedQuestion(buildBackendQuestion())

    expect(wrapper.text()).toContain('Как защитить вопрос новичка от ранних минусов?')
    expect(wrapper.text()).toContain('Читаемый текст вопроса должен оставаться доступным')
    expect(wrapper.get('[data-testid="question-protection-badge"]').text()).toContain('Защищённый вопрос')
    expect(wrapper.get('[data-testid="question-protection-badge"]').text()).toContain('Эксперт+ отвечают первые 12 часов')
    expect(wrapper.get('[data-testid="question-protection-panel"]').text()).toContain('Защита новых авторов включена')
    expect(wrapper.get('[data-testid="question-protection-panel"]').text()).toContain('В течение первых 12 часов после публикации отвечать могут только эксперты и мастера.')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только участники уровня Эксперт или Мастер')
    expect(wrapper.get('[data-testid="solution-composer-progress-hint"]').text()).toContain('не хватает 70 очков до уровня Эксперт')
    expect(wrapper.find('[data-testid="vote-downvote-blocked"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи')
    expect(wrapper.findAll('button').some((button) => button.text() === 'Против')).toBe(false)
    expect(wrapper.text()).not.toContain('Написать решение')
  })

  it('updates protected-question copy when the backend window expands beyond the default duration', async () => {
    const wrapper = await mountProtectedQuestion(buildBackendQuestion({
      protected_until: '2026-04-02T12:00:00Z',
      viewer_answer_reason_message: 'Этот вопрос новичка защищён на первые 24 часа. Отвечать сейчас могут только участники уровня Эксперт или Мастер.',
      viewer_downvote_reason_message: 'В первые 24 часа после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.',
    }))

    expect(wrapper.get('[data-testid="question-protection-badge"]').text()).toContain('Эксперт+ отвечают первые 24 часов')
    expect(wrapper.get('[data-testid="question-protection-panel"]').text()).toContain('В течение первых 24 часов после публикации отвечать могут только эксперты и мастера.')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('первые 24 часа')
    expect(wrapper.text()).toContain('В первые 24 часа после публикации у вопросов новичков отключены даунвоуты')
  })

  it('uses backend-provided required level labels for non-default protected newcomer fixtures', async () => {
    const wrapper = await mountProtectedQuestion(buildBackendQuestion({
      viewer_answer_reason_message: 'Этот вопрос новичка защищён на первые 12 часов. Отвечать сейчас могут только участники уровня Участник или Мастер.',
      viewer_answer_required_level: 'participant',
      viewer_answer_required_level_label: 'Участник',
      viewer_level: 'newcomer',
      viewer_level_label: 'Новичок',
      viewer_points_to_next_level: 12,
      viewer_next_level: 'participant',
      viewer_next_level_label: 'Участник',
    }))

    expect(wrapper.get('[data-testid="question-protection-badge"]').text()).toContain('Участник+ отвечают первые 12 часов')
    expect(wrapper.get('[data-testid="question-protection-panel"]').text()).toContain('В течение первых 12 часов после публикации отвечать могут только участники и мастера.')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только участники уровня Участник или Мастер')
    expect(wrapper.get('[data-testid="solution-composer-progress-hint"]').text()).toContain('не хватает 12 очков до уровня Участник')
  })

  it('keeps answer authoring available for experts while downvote protection remains visible', async () => {
    const wrapper = await mountProtectedQuestion(buildBackendQuestion({
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_level: 'expert',
      viewer_level_label: 'Эксперт',
      viewer_points_to_next_level: 200,
      viewer_next_level: 'master',
      viewer_next_level_label: 'Мастер',
    }))

    expect(wrapper.text()).toContain('Читаемый текст вопроса должен оставаться доступным')
    expect(wrapper.get('[data-testid="question-protection-badge"]').text()).toContain('Защищённый вопрос')
    expect(wrapper.text()).toContain('Написать решение')
    expect(wrapper.find('[data-testid="solution-composer-blocked-reason"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="vote-downvote-blocked"]').exists()).toBe(true)
  })

  it('returns to ordinary answer and downvote affordances after the 12-hour window expires', async () => {
    const wrapper = await mountProtectedQuestion(buildBackendQuestion({
      is_protected: false,
      protection_reason_code: 'question_not_protected',
      protected_until: null,
      viewer_can_answer: true,
      viewer_answer_reason_code: 'answer_allowed',
      viewer_answer_reason_message: '',
      viewer_can_downvote: true,
      viewer_downvote_reason_code: 'question_downvote_allowed',
      viewer_downvote_reason_message: '',
    }))

    expect(wrapper.text()).toContain('Читаемый текст вопроса должен оставаться доступным')
    expect(wrapper.find('[data-testid="question-protection-badge"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="question-protection-panel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Написать решение')
    expect(wrapper.find('[data-testid="vote-downvote-blocked"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'Против')).toBe(true)
  })
})
