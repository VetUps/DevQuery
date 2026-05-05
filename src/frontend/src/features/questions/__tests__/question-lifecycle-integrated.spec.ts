import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import type { QuestionEditRecord } from '@/features/questions/api/questionEdits'
import type { QuestionRevisionRecord } from '@/features/questions/api/questionRevisions'
import type { QuestionDetail } from '@/features/questions/api/questions'
import ProfileQuestionEditReviewQueue from '@/features/questions/components/ProfileQuestionEditReviewQueue.vue'
import QuestionRevisionHistoryModal from '@/features/questions/components/QuestionRevisionHistoryModal.vue'
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

const authorProfileState = {
  data: ref(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const currentUserState = {
  data: ref<{ user_id: string; user_name: string } | null>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
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

const revisionQueryState = {
  data: ref<{ count: number; next: string | null; previous: string | null; results: QuestionRevisionRecord[] } | undefined>(undefined),
  error: ref<unknown>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const questionReviewQueueState = {
  data: ref<QuestionEditRecord[]>([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const moderateQuestionEditMutationState = {
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
  usePublicProfileQuery: vi.fn(() => authorProfileState),
}))

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/solutions/mutations/useCreateSolutionMutation', () => ({
  useCreateSolutionMutation: vi.fn(() => ({ isPending: ref(false), mutateAsync: vi.fn() })),
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

vi.mock('@/features/questions/queries/useQuestionRevisionsQuery', () => ({
  useQuestionRevisionsQuery: vi.fn(() => revisionQueryState),
}))

vi.mock('@/features/questions/queries/useQuestionReviewQueueQuery', () => ({
  useQuestionReviewQueueQuery: vi.fn(() => questionReviewQueueState),
}))

vi.mock('@/features/questions/mutations/useModerateQuestionEditMutation', () => ({
  useModerateQuestionEditMutation: vi.fn(() => moderateQuestionEditMutationState),
}))

function buildQuestionDetail(overrides: Partial<QuestionDetail> = {}): QuestionDetail {
  return {
    question_id: 'question-1',
    user: 'author-1',
    question_title: 'Как доказать полный lifecycle вопроса?',
    question_body: 'Исходное тело вопроса с контекстом Django и Vue.',
    question_status: 'open',
    question_created_at: '2026-05-01T10:00:00Z',
    question_updated_at: '2026-05-01T11:00:00Z',
    tags: [
      { name: 'django', questions_count: 8 },
      { name: 'vue', questions_count: 5 },
    ],
    upvotes: 4,
    downvotes: 1,
    score: 3,
    user_vote: null,
    ...overrides,
  }
}

function buildQuestionEdit(overrides: Partial<QuestionEditRecord> = {}): QuestionEditRecord {
  return {
    question_edit_id: 'proposal-1',
    question: 'question-1',
    question_title: 'Как доказать полный lifecycle вопроса?',
    question_author_id: 'author-1',
    question_author_name: 'Author',
    user: 'contributor-1',
    edit_author_id: 'contributor-1',
    edit_author_name: 'Contributor',
    question_edit_title_before: 'Как доказать полный lifecycle вопроса?',
    question_edit_title_after: 'Как доказать полный lifecycle вопроса с history?',
    question_edit_body_before: 'Исходное тело вопроса с контекстом Django и Vue.',
    question_edit_body_after: 'Предложенное тело вопроса с проверкой истории и тегов.',
    question_edit_tags_before: ['django', 'vue'],
    question_edit_tags_after: ['django', 'vue', 'testing'],
    question_edit_is_approved: null,
    question_edit_edited_at: '2026-05-05T12:00:00Z',
    ...overrides,
  }
}

function buildRevision(overrides: Partial<QuestionRevisionRecord> = {}): QuestionRevisionRecord {
  return {
    question_revision_id: 'revision-1',
    question: 'question-1',
    actor: 'contributor-1',
    actor_name: 'Contributor',
    source: 'proposal_approval',
    question_edit: 'proposal-1',
    title_before: 'Как доказать полный lifecycle вопроса?',
    title_after: 'Как доказать полный lifecycle вопроса с history?',
    body_before: 'Исходное тело вопроса с контекстом Django и Vue.',
    body_after: 'Предложенное тело вопроса с проверкой истории и тегов.',
    tags_before: ['django', 'vue'],
    tags_after: ['django', 'vue', 'testing'],
    created_at: '2026-05-05T12:10:00Z',
    ...overrides,
  }
}

async function mountQuestionDetailPage() {
  const pinia = createPinia()
  setActivePinia(pinia)

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

  return wrapper
}

function mountQuestionReviewQueue() {
  return mount(ProfileQuestionEditReviewQueue, {
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

function mountRevisionHistoryModal() {
  return mount(QuestionRevisionHistoryModal, {
    attachTo: document.body,
    props: {
      open: true,
      questionId: 'question-1',
    },
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('integrated question lifecycle regression', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
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

    authorProfileState.data.value = null
    authorProfileState.isPending.value = false
    authorProfileState.isError.value = false
    authorProfileState.refetch.mockReset()

    currentUserState.data.value = null
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    currentUserState.refetch.mockReset()

    updateQuestionMutationState.isPending.value = false
    updateQuestionMutationState.mutateAsync.mockReset()

    createQuestionEditMutationState.isPending.value = false
    createQuestionEditMutationState.mutateAsync.mockReset()

    tagAutocompleteQueryState.data.value = []
    tagAutocompleteQueryState.isPending.value = false
    tagAutocompleteQueryState.isError.value = false

    revisionQueryState.data.value = undefined
    revisionQueryState.error.value = null
    revisionQueryState.isPending.value = false
    revisionQueryState.isError.value = false
    revisionQueryState.refetch.mockReset()

    questionReviewQueueState.data.value = []
    questionReviewQueueState.isPending.value = false
    questionReviewQueueState.isError.value = false
    questionReviewQueueState.refetch.mockReset()

    moderateQuestionEditMutationState.isPending.value = false
    moderateQuestionEditMutationState.mutateAsync.mockReset()
  })

  it('refetches the backend-shaped detail after an author direct edit before showing the saved state', async () => {
    const originalQuestion = buildQuestionDetail()
    const updatedQuestion = buildQuestionDetail({
      question_title: 'Как доказать полный lifecycle вопроса после PATCH?',
      question_body: 'Обновлённое тело из backend PATCH response.',
      question_updated_at: '2026-05-05T12:30:00Z',
      tags: [
        { name: 'django', questions_count: 8 },
        { name: 'testing', questions_count: 2 },
      ],
    })

    questionDetailState.data.value = originalQuestion
    currentUserState.data.value = { user_id: 'author-1', user_name: 'Author' }
    updateQuestionMutationState.mutateAsync.mockResolvedValue(updatedQuestion)
    questionDetailState.refetch.mockImplementation(async () => {
      questionDetailState.data.value = updatedQuestion
      return { data: updatedQuestion }
    })

    const wrapper = await mountQuestionDetailPage()

    await wrapper.findAll('button').find((button) => button.text() === 'Редактировать вопрос')!.trigger('click')
    await wrapper.get('#question-edit-title').setValue(updatedQuestion.question_title)
    await wrapper.get('#question-edit-body').setValue(updatedQuestion.question_body)
    await wrapper.get('button[aria-label="Удалить тег vue"]').trigger('click')
    await wrapper.get('#question-edit-tags').setValue('testing')
    await wrapper.findAll('button').find((button) => button.text() === 'Добавить')!.trigger('click')
    await wrapper.get('form.question-edit-form').trigger('submit.prevent')
    await flushPromises()

    expect(updateQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      payload: {
        question_title: updatedQuestion.question_title,
        question_body: updatedQuestion.question_body,
        tags: ['django', 'testing'],
      },
    })
    expect(questionDetailState.refetch).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Изменения сохранены. Вопрос обновлён данными с сервера.')
    expect(wrapper.text()).toContain(updatedQuestion.question_title)
    expect(wrapper.text()).toContain(updatedQuestion.question_body)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('keeps contributor proposals pending-only and hides owner-only controls until current-user ownership is proven', async () => {
    const originalQuestion = buildQuestionDetail({ question_title: 'Original title remains visible' })

    questionDetailState.data.value = originalQuestion
    currentUserState.data.value = { user_id: 'contributor-1', user_name: 'Contributor' }
    createQuestionEditMutationState.mutateAsync.mockResolvedValue(buildQuestionEdit())

    const wrapper = await mountQuestionDetailPage()

    expect(wrapper.text()).not.toContain('Редактировать вопрос')

    await wrapper.findAll('button').find((button) => button.text() === 'Предложить правку')!.trigger('click')
    await wrapper.get('#question-edit-proposal-title').setValue('Pending proposal title')
    await wrapper.get('#question-edit-proposal-body').setValue('Pending proposal body')
    await wrapper.get('form.question-edit-proposal-modal').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith({
      question: 'question-1',
      question_edit_title_after: 'Pending proposal title',
      question_edit_body_after: 'Pending proposal body',
      tags: ['django', 'vue'],
    })
    expect(questionDetailState.refetch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Правка отправлена на проверку автору вопроса.')
    expect(wrapper.text()).toContain('Original title remains visible')
    expect(wrapper.text()).not.toContain('Pending proposal title')
  })

  it('settles author review actions while a rejected proposal remains a no-mutation path', async () => {
    questionReviewQueueState.data.value = [
      buildQuestionEdit({ question_edit_id: 'approved-proposal', edit_author_name: 'Approved Contributor' }),
      buildQuestionEdit({
        question_edit_id: 'rejected-proposal',
        edit_author_name: 'Rejected Contributor',
        question_edit_title_after: 'Rejected title must not apply',
        question_edit_tags_after: ['django'],
        question_edit_edited_at: '2026-05-05T12:05:00Z',
      }),
    ]
    moderateQuestionEditMutationState.mutateAsync.mockResolvedValueOnce({ approved: false }).mockResolvedValueOnce({ approved: true })

    const wrapper = mountQuestionReviewQueue()

    await wrapper.get('[data-testid="question-review-item-rejected-proposal"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Отклонить'))!.trigger('click')
    await flushPromises()

    expect(moderateQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith({
      questionEditId: 'rejected-proposal',
      questionId: 'question-1',
      approve: false,
    })
    expect(wrapper.text()).toContain('Правка вопроса отклонена.')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Rejected title must not apply')

    await wrapper.get('[data-testid="question-review-item-approved-proposal"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Одобрить'))!.trigger('click')
    await flushPromises()

    expect(moderateQuestionEditMutationState.mutateAsync).toHaveBeenLastCalledWith({
      questionEditId: 'approved-proposal',
      questionId: 'question-1',
      approve: true,
    })
    expect(wrapper.text()).toContain('Правка вопроса одобрена.')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders backend proposal_approval history and isolates malformed history failures to the modal', async () => {
    revisionQueryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [buildRevision()],
    }

    const historyWrapper = mountRevisionHistoryModal()

    expect(historyWrapper.text()).toContain('Одобренная правка сообщества')
    expect(historyWrapper.text()).toContain('Contributor')
    expect(historyWrapper.text()).toContain('Как доказать полный lifecycle вопроса с history?')
    expect(historyWrapper.text()).toContain('#django, #vue, #testing')
    expect(historyWrapper.text()).not.toContain('proposal_approval')

    historyWrapper.unmount()
    revisionQueryState.data.value = undefined
    revisionQueryState.isError.value = true
    revisionQueryState.error.value = new Error('Malformed revision payload Authorization: Bearer secret')

    const failedHistoryWrapper = mountRevisionHistoryModal()

    expect(failedHistoryWrapper.get('[data-testid="question-revision-history-error"]').text()).toContain(
      'Не удалось загрузить историю правок вопроса. Попробуйте ещё раз.',
    )
    expect(failedHistoryWrapper.text()).not.toContain('Bearer secret')

    await failedHistoryWrapper.get('[data-testid="question-revision-history-error"] button').trigger('click')

    expect(revisionQueryState.refetch).toHaveBeenCalledTimes(1)
  })
})
