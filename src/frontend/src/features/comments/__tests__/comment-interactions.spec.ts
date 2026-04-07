import { defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import type { UserProfile } from '@/features/auth/api/auth'
import {
  buildCommentContextQueryKey,
  type CommentContextSlice,
} from '@/features/comments/queries/useCommentContextQuery'
import { buildCommentThreadQueryKey } from '@/features/comments/queries/useCommentThreadQuery'
import { useCreateCommentMutation } from '@/features/comments/mutations/useCreateCommentMutation'
import { useSessionStore } from '@/features/auth/stores/session'
import { http } from '@/shared/api/http'
import { useToastStore } from '@/shared/stores/toast'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'

const questionDetailState = {
  data: ref<any>(null),
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
  data: ref<CommentContextSlice>({ comments: [], hasMore: false, count: 0 }),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const threadState = {
  data: ref<any[]>([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const profileState = {
  data: ref<any>(null),
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

vi.mock('@/features/comments/queries/useCommentContextQuery', async () => {
  const actual = await vi.importActual<typeof import('@/features/comments/queries/useCommentContextQuery')>('@/features/comments/queries/useCommentContextQuery')

  return {
    ...actual,
    useCommentContextQuery: vi.fn(() => commentState),
  }
})

vi.mock('@/features/comments/queries/useCommentThreadQuery', async () => {
  const actual = await vi.importActual<typeof import('@/features/comments/queries/useCommentThreadQuery')>('@/features/comments/queries/useCommentThreadQuery')

  return {
    ...actual,
    useCommentThreadQuery: vi.fn(() => threadState),
  }
})

vi.mock('@/features/users/queries/usePublicProfileQuery', () => ({
  usePublicProfileQuery: vi.fn(() => profileState),
}))

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/solutions/mutations/useCreateSolutionMutation', () => ({
  useCreateSolutionMutation: vi.fn(() => createSolutionMutationState),
}))

function buildQuestionDetail() {
  return {
    question_id: 'question-1',
    user: 'author-1',
    question_title: 'Как организовать discussion flow?',
    question_body: 'Нужно добавить modal для полной дискуссии.',
    question_status: 'open',
    question_created_at: '2026-04-01T12:00:00Z',
    question_updated_at: '2026-04-02T12:00:00Z',
    upvotes: 8,
    downvotes: 1,
    score: 7,
    user_vote: null,
  }
}

function buildSolution() {
  return {
    solution_id: 'solution-1',
    user: 'author-2',
    question_id: 'question-1',
    solution_body: 'Используйте modal и optimistic update.',
    solution_is_best: false,
    solution_created_at: '2026-04-02T10:00:00Z',
    solution_updated_at: '2026-04-02T11:00:00Z',
    upvotes: 3,
    downvotes: 0,
    score: 3,
    user_vote: null,
  }
}

function buildCommentThread() {
  return {
    comment_id: 'comment-1',
    user: 'user-1',
    user_name: 'Комментатор',
    user_avatar_url: null,
    target_type: 'question',
    target_id: 'question-1',
    parent_id: null,
    body: 'Корневой комментарий',
    created_at: '2026-04-03T10:00:00Z',
    replies: [
      {
        comment_id: 'comment-1-reply',
        user: 'user-2',
        user_name: 'Ответивший',
        user_avatar_url: null,
        target_type: 'question',
        target_id: 'question-1',
        parent_id: 'comment-1',
        body: 'Короткий ответ',
        created_at: '2026-04-03T10:30:00Z',
      },
    ],
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
      { path: '/questions/:questionId', component: QuestionDetailPage },
      { path: '/login', component: { template: '<div>login</div>' } },
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

describe('comment interactions', () => {
  beforeEach(() => {
    queryClient.clear()

    const { toasts, removeToast } = useToastStore()
    for (const toast of toasts.value) {
      removeToast(toast.id)
    }

    questionDetailState.data.value = buildQuestionDetail()
    questionDetailState.isPending.value = false
    questionDetailState.isError.value = false
    questionDetailState.refetch.mockReset()

    solutionsState.data.value = [buildSolution()]
    solutionsState.isPending.value = false
    solutionsState.isError.value = false
    solutionsState.refetch.mockReset()

    commentState.data.value = {
      comments: [buildCommentThread()],
      hasMore: true,
      count: 4,
    }
    commentState.isPending.value = false
    commentState.isError.value = false
    commentState.refetch.mockReset()

    threadState.data.value = [buildCommentThread()]
    threadState.isPending.value = false
    threadState.isError.value = false
    threadState.refetch.mockReset()

    profileState.data.value = {
      user_name: 'Автор',
      user_role: 'user',
      user_reputation_score: 100,
      user_created_at: '2026-03-01T12:00:00Z',
    }

    currentUserState.data.value = {
      user_id: 'current-user',
      user_name: 'Текущий пользователь',
    }

    createSolutionMutationState.isPending.value = false
    createSolutionMutationState.mutateAsync.mockReset()
  })

  it('keeps only one inline composer open across the detail page', async () => {
    const { wrapper } = await mountQuestionDetailPage(true)

    const blocks = wrapper.findAll('.comment-context-block')
    expect(blocks).toHaveLength(2)

    const questionCommentButton = blocks[0].findAll('button').find((button) => button.text().includes('Комментировать'))
    await questionCommentButton!.trigger('click')
    await flushPromises()

    expect(blocks[0].find('textarea').exists()).toBe(true)
    expect(blocks[1].find('textarea').exists()).toBe(false)

    const solutionCommentButton = blocks[1].findAll('button').find((button) => button.text().includes('Комментировать'))
    await solutionCommentButton!.trigger('click')
    await flushPromises()

    expect(blocks[0].find('textarea').exists()).toBe(false)
    expect(blocks[1].find('textarea').exists()).toBe(true)
  })

  it('opens the full discussion modal with question context', async () => {
    const { wrapper } = await mountQuestionDetailPage(true)

    const showMoreButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Показать ещё')
    await showMoreButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Полная дискуссия')
    expect(wrapper.text()).toContain('Как организовать discussion flow?')
    expect(wrapper.text()).toContain('Нужно добавить modal для полной дискуссии.')
  })

  it('optimistically inserts a comment and rolls it back on failure', async () => {
    let rejectRequest: ((reason?: unknown) => void) | null = null

    const requestSpy = vi.spyOn(http, 'post').mockImplementation(() => new Promise((_, reject) => {
      rejectRequest = reject
    }) as never)

    const currentUserProfile: UserProfile = {
      user_id: 'current-user',
      user_name: 'Текущий пользователь',
      user_email: 'user@example.com',
      user_reputation_score: 10,
      user_avatar_url: null,
      user_bio: null,
      user_created_at: '2026-03-01T12:00:00Z',
    }

    queryClient.clear()
    queryClient.setQueryData(['auth', 'profile'], currentUserProfile)

    const contextKey = buildCommentContextQueryKey('question', 'question-1')
    const threadKey = buildCommentThreadQueryKey('question', 'question-1', null)

    queryClient.setQueryData<CommentContextSlice>(contextKey, {
      count: 0,
      hasMore: false,
      comments: [],
    })
    queryClient.setQueryData(threadKey, [])

    const Harness = defineComponent({
      setup() {
        const mutation = useCreateCommentMutation()

        function submitComment() {
          mutation.mutate({
            target_type: 'question',
            target_id: 'question-1',
            body: 'Оптимистичный комментарий',
          })
        }

        return { submitComment }
      },
      template: '<button @click="submitComment">submit</button>',
    })

    const wrapper = mount(Harness, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
      },
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    const optimisticContext = queryClient.getQueryData<CommentContextSlice>(contextKey)
    const optimisticThread = queryClient.getQueryData<any[]>(threadKey)

    expect(optimisticContext?.comments[0]?.comment_id).toContain('optimistic-comment-')
    expect(optimisticThread?.[0]?.comment_id).toContain('optimistic-comment-')

    rejectRequest?.(new Error('failed'))
    await flushPromises()

    expect(queryClient.getQueryData<CommentContextSlice>(contextKey)?.comments).toHaveLength(0)
    expect(queryClient.getQueryData<any[]>(threadKey)).toHaveLength(0)
    expect(useToastStore().toasts.value).toHaveLength(1)

    requestSpy.mockRestore()
  })
})
