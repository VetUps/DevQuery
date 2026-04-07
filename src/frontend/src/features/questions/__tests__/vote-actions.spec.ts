import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import type { QuestionDetail } from '@/features/questions/api/questions'
import SignalVoteRail from '@/features/votes/components/SignalVoteRail.vue'
import { applyVoteState } from '@/features/votes/lib/apply-vote-state'
import { useVoteMutation } from '@/features/votes/mutations/useVoteMutation'
import { useToastStore } from '@/shared/stores/toast'

const { castVoteMock, removeVoteMock } = vi.hoisted(() => ({
  castVoteMock: vi.fn(),
  removeVoteMock: vi.fn(),
}))

vi.mock('@/features/votes/api/votes', async () => {
  const actual = await vi.importActual<typeof import('@/features/votes/api/votes')>('@/features/votes/api/votes')

  return {
    ...actual,
    castVote: castVoteMock,
    removeVote: removeVoteMock,
  }
})

describe('vote actions', () => {
  beforeEach(() => {
    queryClient.clear()
    castVoteMock.mockReset()
    removeVoteMock.mockReset()

    const { toasts, removeToast } = useToastStore()
    for (const toast of toasts.value) {
      removeToast(toast.id)
    }
  })

  it('keeps guests in readonly mode without interactive controls', () => {
    const wrapper = mount(SignalVoteRail, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
      },
      props: {
        mode: 'readonly',
        score: 5,
        upvotes: 7,
        downvotes: 2,
        userVote: null,
      },
    })

    expect(wrapper.text()).toContain('Чтобы голосовать, войдите в аккаунт.')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('hides controls for own content even in interactive mode', () => {
    const wrapper = mount(SignalVoteRail, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
      },
      props: {
        mode: 'interactive',
        score: 3,
        upvotes: 4,
        downvotes: 1,
        userVote: null,
        targetType: 'solution',
        targetId: 'solution-1',
        questionId: 'question-1',
        isOwnContent: true,
      },
    })

    expect(wrapper.text()).toContain('Свой контент нельзя оценивать собственным голосом.')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('applies the expected vote transitions', () => {
    expect(applyVoteState({
      score: 0,
      upvotes: 0,
      downvotes: 0,
      user_vote: null,
    }, 'up')).toMatchObject({
      score: 1,
      upvotes: 1,
      downvotes: 0,
      user_vote: 'up',
    })

    expect(applyVoteState({
      score: 4,
      upvotes: 6,
      downvotes: 2,
      user_vote: 'up',
    }, 'up')).toMatchObject({
      score: 3,
      upvotes: 5,
      downvotes: 2,
      user_vote: null,
    })

    expect(applyVoteState({
      score: 4,
      upvotes: 6,
      downvotes: 2,
      user_vote: 'up',
    }, 'down')).toMatchObject({
      score: 2,
      upvotes: 5,
      downvotes: 3,
      user_vote: 'down',
    })
  })

  it('optimistically updates and rolls back question voting on failure', async () => {
    let rejectRequest: ((reason?: unknown) => void) | null = null
    let pendingVotePromise: Promise<unknown> | null = null

    castVoteMock.mockImplementation(() => new Promise((_, reject) => {
      rejectRequest = reject
    }))

    const detailKey = ['questions', 'detail', 'question-1'] as const

    queryClient.setQueryData<QuestionDetail>(detailKey, {
      question_id: 'question-1',
      user: 'author-1',
      question_title: 'Vote target',
      question_body: 'Body',
      question_status: 'open',
      question_created_at: '2026-04-01T12:00:00Z',
      question_updated_at: '2026-04-02T12:00:00Z',
      upvotes: 5,
      downvotes: 1,
      score: 4,
      user_vote: null,
    })

    const Harness = defineComponent({
      setup() {
        const mutation = useVoteMutation()

        function castUpvote() {
          pendingVotePromise = mutation.mutateAsync({
            targetType: 'question',
            targetId: 'question-1',
            currentVote: null,
            requestedVote: 'up',
          })
        }

        return { castUpvote }
      },
      template: '<button @click="castUpvote">vote</button>',
    })

    const wrapper = mount(Harness, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
      },
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      upvotes: 6,
      downvotes: 1,
      score: 5,
      user_vote: 'up',
    })

    rejectRequest?.(new Error('failed'))
    await expect(pendingVotePromise).rejects.toThrow('failed')
    await flushPromises()

    expect(queryClient.getQueryData<QuestionDetail>(detailKey)).toMatchObject({
      upvotes: 5,
      downvotes: 1,
      score: 4,
      user_vote: null,
    })
    expect(useToastStore().toasts.value).toHaveLength(1)
  })
})
