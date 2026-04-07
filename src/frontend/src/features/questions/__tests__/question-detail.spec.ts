import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
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

async function mountQuestionDetailPage() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/questions/:questionId', component: QuestionDetailPage }],
  })

  await router.push('/questions/question-1')
  await router.isReady()

  const wrapper = mount(QuestionDetailPage, {
    global: {
      plugins: [pinia, router, [VueQueryPlugin, { queryClient }]],
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
      upvotes: 12,
      downvotes: 3,
      score: 9,
      user_vote: null,
    }

    const { wrapper } = await mountQuestionDetailPage()

    expect(wrapper.text()).toContain('Как типизировать read-only detail page?')
    expect(wrapper.findComponent(SignalVoteRail).exists()).toBe(true)
    expect(wrapper.findComponent(VoteBalanceMeter).exists()).toBe(true)
    expect(wrapper.text()).toContain('Чтобы голосовать, войдите в аккаунт.')
  })
})
