import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import SolutionReadCard from '@/features/solutions/components/SolutionReadCard.vue'

const commentState = {
  data: ref({ comments: [], hasMore: false, count: 0 }),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const createSolutionEditMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

vi.mock('@/features/comments/queries/useCommentContextQuery', () => ({
  useCommentContextQuery: vi.fn(() => commentState),
}))

vi.mock('@/features/solutions/mutations/useCreateSolutionEditMutation', () => ({
  useCreateSolutionEditMutation: vi.fn(() => createSolutionEditMutationState),
}))

function buildSolution() {
  return {
    solution_id: 'solution-1',
    user: 'solution-author',
    question_id: 'question-1',
    solution_body: '```ts\\nconsole.log(\"before\")\\n```',
    solution_is_best: false,
    solution_created_at: '2026-04-02T10:00:00Z',
    solution_updated_at: '2026-04-02T11:00:00Z',
    upvotes: 4,
    downvotes: 1,
    score: 3,
    user_vote: null,
  }
}

function mountSolutionReadCard(options?: {
  viewerUserId?: string
  isAuthenticated?: boolean
}) {
  return mount(SolutionReadCard, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        teleport: true,
      },
    },
    props: {
      solution: buildSolution(),
      questionId: 'question-1',
      viewerUserId: options?.viewerUserId ?? '',
      isAuthenticated: options?.isAuthenticated ?? false,
      activeComposerKey: null,
    },
  })
}

describe('edit proposals', () => {
  beforeEach(() => {
    queryClient.clear()

    commentState.data.value = { comments: [], hasMore: false, count: 0 }
    commentState.isPending.value = false
    commentState.isError.value = false
    commentState.refetch.mockReset()

    createSolutionEditMutationState.isPending.value = false
    createSolutionEditMutationState.mutateAsync.mockReset()
  })

  it('hides the suggested edit action for guests', () => {
    const wrapper = mountSolutionReadCard({
      viewerUserId: '',
      isAuthenticated: false,
    })

    expect(wrapper.text()).not.toContain('Предложить правку')
  })

  it('hides the suggested edit action for the solution owner', () => {
    const wrapper = mountSolutionReadCard({
      viewerUserId: 'solution-author',
      isAuthenticated: true,
    })

    expect(wrapper.text()).not.toContain('Предложить правку')
  })

  it('opens the modal with compare controls for an authenticated non-owner', async () => {
    const wrapper = mountSolutionReadCard({
      viewerUserId: 'reviewer-1',
      isAuthenticated: true,
    })

    const editButton = wrapper.findAll('button').find((button) => button.text().includes('Предложить правку'))
    await editButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Редактор')
    expect(wrapper.text()).toContain('Предпросмотр')
    expect(wrapper.text()).toContain('Изменения')

    await wrapper.get('#solution-edit-body').setValue('```ts\\nconsole.log(\"after\")\\n```')
    const changesTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Изменения')
    await changesTab!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Предлагаемая версия')
  })

  it('submits a suggested edit and leaves the local success state on the card', async () => {
    createSolutionEditMutationState.mutateAsync.mockResolvedValue({
      solution_edit_id: 'edit-1',
      solution: 'solution-1',
      user: 'reviewer-1',
      solution_edit_body_before: 'before',
      solution_edit_body_after: 'after',
      solution_edit_is_approved: null,
      solution_edit_edited_at: '2026-04-04T10:00:00Z',
    })

    const wrapper = mountSolutionReadCard({
      viewerUserId: 'reviewer-1',
      isAuthenticated: true,
    })

    const editButton = wrapper.findAll('button').find((button) => button.text().includes('Предложить правку'))
    await editButton!.trigger('click')
    await flushPromises()

    await wrapper.get('#solution-edit-body').setValue('```ts\\nconsole.log(\"after\")\\n```')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createSolutionEditMutationState.mutateAsync).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Правка отправлена на проверку')
    expect(wrapper.text()).not.toContain('Предложить правку')
  })

  it('keeps the modal open and preserves the draft when submission fails', async () => {
    createSolutionEditMutationState.mutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          non_field_errors: ['Пользователь уже выложил правку на данное решение, которое находится в статусе ожидания'],
        },
      },
    })

    const wrapper = mountSolutionReadCard({
      viewerUserId: 'reviewer-1',
      isAuthenticated: true,
    })

    const editButton = wrapper.findAll('button').find((button) => button.text().includes('Предложить правку'))
    await editButton!.trigger('click')
    await flushPromises()

    await wrapper.get('#solution-edit-body').setValue('```ts\\nconsole.log(\"draft\")\\n```')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('У вас уже есть правка этого решения в ожидании проверки.')
    expect(wrapper.get('#solution-edit-body').element.value).toContain('console.log("draft")')
    expect(wrapper.text()).toContain('Предложить правку')
  })
})
