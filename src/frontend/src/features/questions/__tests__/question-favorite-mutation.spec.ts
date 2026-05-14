import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/query-client'
import type { PaginatedResponse, QuestionDetail, QuestionListItem } from '@/features/questions/api/questions'
import { useQuestionFavoriteMutation } from '@/features/questions/mutations/useQuestionFavoriteMutation'
import { useToastStore } from '@/shared/stores/toast'

const { addQuestionFavoriteMock, removeQuestionFavoriteMock } = vi.hoisted(() => ({
  addQuestionFavoriteMock: vi.fn(),
  removeQuestionFavoriteMock: vi.fn(),
}))

vi.mock('@/features/questions/api/questions', async () => {
  const actual = await vi.importActual<typeof import('@/features/questions/api/questions')>('@/features/questions/api/questions')

  return {
    ...actual,
    addQuestionFavorite: addQuestionFavoriteMock,
    removeQuestionFavorite: removeQuestionFavoriteMock,
  }
})

function makeQuestion(overrides: Partial<QuestionListItem> = {}): QuestionListItem {
  return {
    question_id: 'question-1',
    user: 'author-1',
    question_title: 'Favorite target',
    question_status: 'open',
    question_created_at: '2026-04-01T12:00:00Z',
    question_updated_at: '2026-04-01T12:30:00Z',
    favorites_count: 2,
    is_favorited: false,
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
    ...overrides,
  }
}

function makeDetail(overrides: Partial<QuestionDetail> = {}): QuestionDetail {
  return {
    ...makeQuestion(),
    question_body: 'Body',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    user_vote: null,
    ...overrides,
  }
}

function makePage(question: QuestionListItem): PaginatedResponse<QuestionListItem> {
  return {
    count: 1,
    next: null,
    previous: null,
    results: [question],
  }
}

function clearToasts() {
  const { toasts, removeToast } = useToastStore()

  for (const toast of toasts.value) {
    removeToast(toast.id)
  }
}

function mountFavoriteHarness() {
  let pendingFavoritePromise: Promise<unknown> | null = null

  const Harness = defineComponent({
    setup() {
      const mutation = useQuestionFavoriteMutation()

      function addFavorite() {
        pendingFavoritePromise = mutation.mutateAsync({ questionId: 'question-1', isFavorited: true })
      }

      function removeFavorite() {
        pendingFavoritePromise = mutation.mutateAsync({ questionId: 'question-1', isFavorited: false })
      }

      return { addFavorite, removeFavorite }
    },
    template: '<button data-testid="add" @click="addFavorite">add</button><button data-testid="remove" @click="removeFavorite">remove</button>',
  })

  const wrapper = mount(Harness, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })

  return {
    wrapper,
    get pendingFavoritePromise() {
      return pendingFavoritePromise
    },
  }
}

describe('question favorite mutation cache boundary', () => {
  beforeEach(() => {
    queryClient.clear()
    addQuestionFavoriteMock.mockReset()
    removeQuestionFavoriteMock.mockReset()
    clearToasts()
  })

  it('optimistically favorites a question across list and detail caches, then writes server truth', async () => {
    let resolveRequest: ((value: unknown) => void) | null = null

    addQuestionFavoriteMock.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const listKey = ['questions', 'list', { page: 1 }] as const
    const detailKey = ['questions', 'detail', 'question-1'] as const

    queryClient.setQueryData(listKey, makePage(makeQuestion({ favorites_count: 2, is_favorited: false })))
    queryClient.setQueryData(detailKey, makeDetail({ favorites_count: 2, is_favorited: false }))

    const harness = mountFavoriteHarness()

    await harness.wrapper.get('[data-testid="add"]').trigger('click')
    await flushPromises()

    expect(queryClient.getQueryData<PaginatedResponse<QuestionListItem>>(listKey)?.results[0]).toMatchObject({
      favorites_count: 3,
      is_favorited: true,
    })
    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      favorites_count: 3,
      is_favorited: true,
    })

    resolveRequest?.({
      question_id: 'question-1',
      favorites_count: 7,
      is_favorited: true,
    })
    await expect(harness.pendingFavoritePromise).resolves.toEqual({
      question_id: 'question-1',
      favorites_count: 7,
      is_favorited: true,
    })
    await flushPromises()

    expect(queryClient.getQueryData<PaginatedResponse<QuestionListItem>>(listKey)?.results[0]).toMatchObject({
      favorites_count: 7,
      is_favorited: true,
    })
    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      favorites_count: 7,
      is_favorited: true,
    })
  })

  it('rolls back list and detail snapshots and shows a danger toast when the request fails', async () => {
    let rejectRequest: ((reason?: unknown) => void) | null = null

    addQuestionFavoriteMock.mockImplementation(() => new Promise((_, reject) => {
      rejectRequest = reject
    }))

    const listKey = ['questions', 'list', { page: 1 }] as const
    const detailKey = ['questions', 'detail', 'question-1'] as const

    queryClient.setQueryData(listKey, makePage(makeQuestion({ favorites_count: 2, is_favorited: false })))
    queryClient.setQueryData(detailKey, makeDetail({ favorites_count: 2, is_favorited: false }))

    const harness = mountFavoriteHarness()

    await harness.wrapper.get('[data-testid="add"]').trigger('click')
    await flushPromises()

    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      favorites_count: 3,
      is_favorited: true,
    })

    rejectRequest?.(new Error('network failed'))
    await expect(harness.pendingFavoritePromise).rejects.toThrow('network failed')
    await flushPromises()

    expect(queryClient.getQueryData<PaginatedResponse<QuestionListItem>>(listKey)?.results[0]).toMatchObject({
      favorites_count: 2,
      is_favorited: false,
    })
    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      favorites_count: 2,
      is_favorited: false,
    })
    expect(useToastStore().toasts.value).toHaveLength(1)
    expect(useToastStore().toasts.value[0]).toMatchObject({
      tone: 'danger',
      message: 'Не удалось обновить избранное. Попробуйте ещё раз.',
    })
  })

  it('clamps optimistic unfavorite counts at zero for repeated remove-like states', async () => {
    removeQuestionFavoriteMock.mockResolvedValue({
      question_id: 'question-1',
      favorites_count: 0,
      is_favorited: false,
    })

    const listKey = ['questions', 'list', { page: 1 }] as const
    const detailKey = ['questions', 'detail', 'question-1'] as const

    queryClient.setQueryData(listKey, makePage(makeQuestion({ favorites_count: 0, is_favorited: true })))
    queryClient.setQueryData(detailKey, makeDetail({ favorites_count: 0, is_favorited: true }))

    const harness = mountFavoriteHarness()

    await harness.wrapper.get('[data-testid="remove"]').trigger('click')
    await flushPromises()

    expect(queryClient.getQueryData<PaginatedResponse<QuestionListItem>>(listKey)?.results[0]).toMatchObject({
      favorites_count: 0,
      is_favorited: false,
    })
    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      favorites_count: 0,
      is_favorited: false,
    })
    expect(removeQuestionFavoriteMock).toHaveBeenCalledWith('question-1')
  })
})
