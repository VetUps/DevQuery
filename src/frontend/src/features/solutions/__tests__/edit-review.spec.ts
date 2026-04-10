import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProfileEditReviewQueue from '@/features/solutions/components/ProfileEditReviewQueue.vue'

const reviewQueueState = {
  data: ref<any[]>([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

const moderateMutationState = {
  mutateAsync: vi.fn(),
}

vi.mock('@/features/solutions/queries/useReviewQueueQuery', () => ({
  useReviewQueueQuery: vi.fn(() => reviewQueueState),
}))

vi.mock('@/features/solutions/mutations/useModerateSolutionEditMutation', () => ({
  useModerateSolutionEditMutation: vi.fn(() => moderateMutationState),
}))

function buildReviewItems() {
  return [
    {
      solution_edit_id: 'edit-older',
      solution: 'solution-1',
      solution_id: 'solution-1',
      solution_question_id: 'question-1',
      solution_question_title: 'Почему не проходит типизация?',
      solution_owner_id: 'owner-1',
      solution_owner_name: 'Owner',
      user: 'editor-1',
      edit_author_id: 'editor-1',
      edit_author_name: 'Ирина',
      solution_excerpt: 'Старый фрагмент решения',
      solution_edit_body_before: 'before-1',
      solution_edit_body_after: 'after-1',
      solution_edit_is_approved: null,
      solution_edit_edited_at: '2026-04-09T10:00:00Z',
    },
    {
      solution_edit_id: 'edit-newer',
      solution: 'solution-2',
      solution_id: 'solution-2',
      solution_question_id: 'question-2',
      solution_question_title: 'Как разобрать diff правильно?',
      solution_owner_id: 'owner-1',
      solution_owner_name: 'Owner',
      user: 'editor-2',
      edit_author_id: 'editor-2',
      edit_author_name: 'Максим',
      solution_excerpt: 'Новый фрагмент решения',
      solution_edit_body_before: 'before-2',
      solution_edit_body_after: 'after-2',
      solution_edit_is_approved: null,
      solution_edit_edited_at: '2026-04-10T12:30:00Z',
    },
    {
      solution_edit_id: 'edit-same-solution',
      solution: 'solution-2',
      solution_id: 'solution-2',
      solution_question_id: 'question-2',
      solution_question_title: 'Как разобрать diff правильно?',
      solution_owner_id: 'owner-1',
      solution_owner_name: 'Owner',
      user: 'editor-3',
      edit_author_id: 'editor-3',
      edit_author_name: 'Ольга',
      solution_excerpt: 'Ещё один фрагмент решения',
      solution_edit_body_before: 'before-3',
      solution_edit_body_after: 'after-3',
      solution_edit_is_approved: null,
      solution_edit_edited_at: '2026-04-10T11:15:00Z',
    },
  ]
}

function mountReviewQueue() {
  return mount(ProfileEditReviewQueue, {
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('edit review workspace', () => {
  beforeEach(() => {
    reviewQueueState.data.value = buildReviewItems()
    reviewQueueState.isPending.value = false
    reviewQueueState.isError.value = false
    reviewQueueState.refetch.mockReset()
    moderateMutationState.mutateAsync.mockReset()
  })

  it('renders the newest-first queue by default', () => {
    const wrapper = mountReviewQueue()

    const itemTexts = wrapper.findAll('[data-testid^="review-item-"]').map((item) => item.text())

    expect(itemTexts[0]).toContain('Максим')
    expect(itemTexts[1]).toContain('Ольга')
    expect(itemTexts[2]).toContain('Ирина')
  })

  it('switches to the grouped-by-solution view', async () => {
    const wrapper = mountReviewQueue()

    await wrapper.get('[data-testid="review-mode-grouped"]').trigger('click')

    expect(wrapper.text()).toContain('По решениям')
    expect(wrapper.text()).toContain('Решение с 2 правками')
    expect(wrapper.find('[data-testid="grouped-review-item-edit-same-solution"]').exists()).toBe(true)
  })

  it('opens the moderation modal with metadata and actions', async () => {
    const wrapper = mountReviewQueue()

    await wrapper.get('[data-testid="review-item-edit-newer"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Правка от Максим')
    expect(wrapper.text()).toContain('Новый фрагмент решения')
    expect(wrapper.text()).toContain('Одобрить')
    expect(wrapper.text()).toContain('Отклонить')
  })

  it('closes the modal and shows success feedback after moderation', async () => {
    moderateMutationState.mutateAsync.mockResolvedValue({ approved: true })

    const wrapper = mountReviewQueue()

    await wrapper.get('[data-testid="review-item-edit-newer"]').trigger('click')
    await flushPromises()

    const approveButton = wrapper.findAll('button').find((button) => button.text().includes('Одобрить'))
    await approveButton!.trigger('click')
    await flushPromises()

    expect(moderateMutationState.mutateAsync).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Правка одобрена.')
    expect(wrapper.text()).not.toContain('Отклонить')
  })
})
