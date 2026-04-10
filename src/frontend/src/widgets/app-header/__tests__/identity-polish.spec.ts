import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import { createAppRouter } from '@/app/router'
import { useSessionStore } from '@/features/auth/stores/session'
import SolutionReadCard from '@/features/solutions/components/SolutionReadCard.vue'
import AppHeader from '@/widgets/app-header/AppHeader.vue'

const currentUserState = {
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const commentQueryState = {
  data: ref({ comments: [], hasMore: false, count: 0 }),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/comments/queries/useCommentContextQuery', () => ({
  useCommentContextQuery: vi.fn(() => commentQueryState),
}))

async function mountHeader() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const sessionStore = useSessionStore()
  sessionStore.setSession({
    access: 'test-access-token',
    refresh: 'test-refresh-token',
  })

  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  await router.isReady()

  const wrapper = mount(AppHeader, {
    global: {
      plugins: [pinia, router],
    },
  })

  await flushPromises()

  return { wrapper }
}

describe('identity polish', () => {
  beforeEach(() => {
    localStorage.clear()
    currentUserState.data.value = {
      user_id: 'user-1',
      user_name: 'ОченьДлинныйНикДляПроверкиШапки',
    }
    commentQueryState.data.value = { comments: [], hasMore: false, count: 0 }
    commentQueryState.isPending.value = false
    commentQueryState.isError.value = false
    commentQueryState.refetch.mockReset()
  })

  it('preserves the full nickname in the account toggle title for truncate behavior', async () => {
    const { wrapper } = await mountHeader()
    const toggle = wrapper.get('[data-testid="account-menu-toggle"]')

    expect(toggle.attributes('title')).toBe('ОченьДлинныйНикДляПроверкиШапки')
    expect(toggle.text()).toContain('ОченьДлинныйНикДляПроверкиШапки')
  })

  it('renders the solution author nickname near the update stamp', () => {
    const wrapper = mount(SolutionReadCard, {
      props: {
        solution: {
          solution_id: 'solution-1',
          user: 'author-1',
          user_name: 'Автор решения',
          question_id: 'question-1',
          solution_body: 'Текст решения',
          solution_is_best: false,
          solution_created_at: '2026-04-02T10:00:00Z',
          solution_updated_at: '2026-04-02T11:00:00Z',
          upvotes: 3,
          downvotes: 0,
          score: 3,
          user_vote: null,
        },
        questionId: 'question-1',
        isAuthenticated: false,
      },
      global: {
        stubs: {
          SignalVoteRail: {
            template: '<div data-testid="signal-vote-rail" />',
          },
          CommentContextBlock: {
            template: '<div data-testid="comment-context-block" />',
          },
          PublicSolutionEditHistoryButton: {
            template: '<div data-testid="public-history-button">История изменений</div>',
          },
          DiscussionThreadModal: true,
          SolutionEditProposalModal: true,
          MarkdownContent: {
            props: ['source'],
            template: '<div data-testid="markdown-content">{{ source }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Автор решения')
    expect(wrapper.text()).toContain('Обновлено')
  })
})
