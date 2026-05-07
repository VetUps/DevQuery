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

  return { wrapper }
}

describe('question detail page', () => {
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

    profileState.data.value = null
    profileState.isPending.value = false
    profileState.isError.value = false
    profileState.refetch.mockReset()

    currentUserState.data.value = null
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

  it('renders protected newcomer state with badge, answer block, and vote explanation', async () => {
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

    expect(wrapper.get('[data-testid="question-protection-badge"]').text()).toContain('Защищённый вопрос')
    expect(wrapper.get('[data-testid="question-protection-panel"]').text()).toContain('Защита новых авторов включена')
    expect(wrapper.get('[data-testid="solution-composer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только участники уровня Эксперт или Мастер')
    expect(wrapper.get('[data-testid="solution-composer-progress-hint"]').text()).toContain('не хватает 70 очков до уровня Эксперт')
    expect(wrapper.find('[data-testid="vote-downvote-blocked"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи')
    expect(wrapper.text()).not.toContain('Написать решение')
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
