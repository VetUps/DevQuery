import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProfileEditHistoryTab from '@/features/solutions/components/ProfileEditHistoryTab.vue'
import SolutionReadCard from '@/features/solutions/components/SolutionReadCard.vue'

const myHistoryState = {
  data: ref<any[]>([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const publicHistoryState = {
  data: ref<any[]>([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const moderateMutationState = {
  mutateAsync: vi.fn(),
}

const bestSolutionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

vi.mock('@/features/solutions/queries/useMyEditHistoryQuery', () => ({
  useMyEditHistoryQuery: vi.fn(() => myHistoryState),
}))

vi.mock('@/features/solutions/queries/usePublicSolutionEditHistoryQuery', () => ({
  usePublicSolutionEditHistoryQuery: vi.fn(() => publicHistoryState),
}))

vi.mock('@/features/solutions/mutations/useModerateSolutionEditMutation', () => ({
  useModerateSolutionEditMutation: vi.fn(() => moderateMutationState),
}))

vi.mock('@/features/solutions/mutations/useBestSolutionMutation', () => ({
  useBestSolutionMutation: vi.fn(() => bestSolutionMutationState),
}))

vi.mock('@/features/comments/queries/useCommentContextQuery', () => ({
  useCommentContextQuery: vi.fn(() => ({
    data: ref({ comments: [], hasMore: false, count: 0 }),
    isPending: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
  })),
}))

function buildHistoryItems() {
  return [
    {
      solution_edit_id: 'history-approved',
      solution: 'solution-1',
      solution_id: 'solution-1',
      solution_question_id: 'question-1',
      solution_question_title: 'Как вести историю правок?',
      solution_owner_id: 'owner-1',
      solution_owner_name: 'Owner',
      user: 'editor-1',
      edit_author_id: 'editor-1',
      edit_author_name: 'Ирина',
      solution_excerpt: 'Фрагмент исходного решения',
      solution_edit_body_before: 'before-approved',
      solution_edit_body_after: 'after-approved',
      solution_edit_is_approved: true,
      solution_edit_edited_at: '2026-04-10T09:00:00Z',
    },
    {
      solution_edit_id: 'history-rejected',
      solution: 'solution-1',
      solution_id: 'solution-1',
      solution_question_id: 'question-1',
      solution_question_title: 'Как вести историю правок?',
      solution_owner_id: 'owner-1',
      solution_owner_name: 'Owner',
      user: 'editor-2',
      edit_author_id: 'editor-2',
      edit_author_name: 'Максим',
      solution_excerpt: 'Ещё один фрагмент решения',
      solution_edit_body_before: 'before-rejected',
      solution_edit_body_after: 'after-rejected',
      solution_edit_is_approved: false,
      solution_edit_edited_at: '2026-04-08T09:00:00Z',
    },
  ]
}

function mountHistoryTab() {
  return mount(ProfileEditHistoryTab, {
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

function mountSolutionReadCard() {
  return mount(SolutionReadCard, {
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
        SignalVoteRail: {
          template: '<div data-testid="signal-vote-rail" />',
        },
        CommentContextBlock: {
          template: '<div data-testid="comment-context-block" />',
        },
        DiscussionThreadModal: true,
        SolutionEditProposalModal: true,
        MarkdownContent: {
          props: ['source'],
          template: '<div data-testid="markdown-content">{{ source }}</div>',
        },
      },
    },
    props: {
      solution: {
        solution_id: 'solution-1',
        user: 'solution-author',
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
      viewerUserId: '',
      isAuthenticated: false,
    },
  })
}

describe('edit history surfaces', () => {
  beforeEach(() => {
    myHistoryState.data.value = buildHistoryItems()
    myHistoryState.isPending.value = false
    myHistoryState.isError.value = false
    myHistoryState.refetch.mockReset()

    publicHistoryState.data.value = buildHistoryItems().filter((item) => item.solution_edit_is_approved)
    publicHistoryState.isPending.value = false
    publicHistoryState.isError.value = false
    publicHistoryState.refetch.mockReset()
    moderateMutationState.mutateAsync.mockReset()
    bestSolutionMutationState.isPending.value = false
    bestSolutionMutationState.mutateAsync.mockReset()
  })

  it('groups owner history by solution and keeps private statuses visible', async () => {
    const wrapper = mountHistoryTab()

    expect(wrapper.text()).toContain('Как вести историю правок?')
    expect(wrapper.text()).toContain('Одобрено')
    expect(wrapper.text()).toContain('Отклонено')

    await wrapper.get('[data-testid="history-item-history-approved"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('История правки')
    expect(wrapper.text()).toContain('Фрагмент исходного решения')
  })

  it('shows the public approved-history entry on the solution card', () => {
    const wrapper = mountSolutionReadCard()

    expect(wrapper.text()).toContain('История изменений')
  })

  it('opens public history with approved edits only', async () => {
    const wrapper = mountSolutionReadCard()

    await wrapper.get('[data-testid="public-history-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('История изменений')
    expect(wrapper.text()).toContain('Одобрено')
    expect(wrapper.text()).not.toContain('Отклонено')
    expect(wrapper.text()).toContain('Оригинал')
    expect(wrapper.text()).toContain('Предлагаемая версия')
  })
})
