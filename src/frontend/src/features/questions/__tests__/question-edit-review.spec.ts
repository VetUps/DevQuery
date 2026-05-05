import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QuestionEditRecord } from '@/features/questions/api/questionEdits'
import ProfileQuestionEditReviewQueue from '@/features/questions/components/ProfileQuestionEditReviewQueue.vue'

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

vi.mock('@/features/questions/queries/useQuestionReviewQueueQuery', () => ({
  useQuestionReviewQueueQuery: vi.fn(() => questionReviewQueueState),
}))

vi.mock('@/features/questions/mutations/useModerateQuestionEditMutation', () => ({
  useModerateQuestionEditMutation: vi.fn(() => moderateQuestionEditMutationState),
}))

function buildQuestionEdit(overrides: Partial<QuestionEditRecord> = {}): QuestionEditRecord {
  return {
    question_edit_id: 'question-edit-1',
    question: 'question-1',
    question_title: 'Как обновить вопрос через review?',
    question_author_id: 'author-1',
    question_author_name: 'Author',
    user: 'proposer-1',
    edit_author_id: 'proposer-1',
    edit_author_name: 'Мария',
    question_edit_title_before: 'Старый заголовок',
    question_edit_title_after: 'Новый заголовок',
    question_edit_body_before: 'Старое тело вопроса',
    question_edit_body_after: 'Новое тело вопроса',
    question_edit_tags_before: ['django', 'mysql'],
    question_edit_tags_after: ['django', 'vue'],
    question_edit_is_approved: null,
    question_edit_edited_at: '2026-05-05T11:00:00Z',
    ...overrides,
  }
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

describe('question edit review workspace', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    questionReviewQueueState.data.value = [
      buildQuestionEdit({
        question_edit_id: 'older-edit',
        edit_author_name: 'Ирина',
        question_title: 'Старый вопрос',
        question_edit_edited_at: '2026-05-04T10:00:00Z',
      }),
      buildQuestionEdit({
        question_edit_id: 'newer-edit',
        edit_author_name: 'Максим',
        question_title: 'Новый вопрос',
        question_edit_edited_at: '2026-05-05T12:00:00Z',
      }),
    ]
    questionReviewQueueState.isPending.value = false
    questionReviewQueueState.isError.value = false
    questionReviewQueueState.refetch.mockReset()
    moderateQuestionEditMutationState.isPending.value = false
    moderateQuestionEditMutationState.mutateAsync.mockReset()
  })

  it('renders loading, empty, and retryable error states independently of solution review', async () => {
    questionReviewQueueState.data.value = []
    questionReviewQueueState.isPending.value = true
    const wrapper = mountQuestionReviewQueue()

    expect(wrapper.text()).toContain('Загружаем предложения к вопросам')

    questionReviewQueueState.isPending.value = false
    await flushPromises()
    expect(wrapper.text()).toContain('Пока нет предложений к вашим вопросам.')

    questionReviewQueueState.isError.value = true
    await flushPromises()
    expect(wrapper.text()).toContain('Не удалось загрузить правки вопросов')

    await wrapper.get('[data-testid="question-review-queue-error"] button').trigger('click')
    expect(questionReviewQueueState.refetch).toHaveBeenCalled()
  })

  it('renders a newest-first question proposal queue and opens a comparison modal', async () => {
    const wrapper = mountQuestionReviewQueue()

    const itemTexts = wrapper.findAll('[data-testid^="question-review-item-"]').map((item) => item.text())
    expect(itemTexts[0]).toContain('Максим')
    expect(itemTexts[1]).toContain('Ирина')

    await wrapper.get('[data-testid="question-review-item-newer-edit"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Правка вопроса от Максим')
    expect(wrapper.text()).toContain('Старый заголовок')
    expect(wrapper.text()).toContain('Новый заголовок')
    expect(wrapper.text()).toContain('Старое тело вопроса')
    expect(wrapper.text()).toContain('Новое тело вопроса')
    expect(wrapper.text()).toContain('+ #vue')
    expect(wrapper.text()).toContain('- #mysql')
    expect(wrapper.text()).toContain('Одобрить')
    expect(wrapper.text()).toContain('Отклонить')
  })

  it('disables duplicate moderation, closes on success, and shows success state', async () => {
    moderateQuestionEditMutationState.mutateAsync.mockResolvedValue({ approved: true })
    const wrapper = mountQuestionReviewQueue()

    await wrapper.get('[data-testid="question-review-item-newer-edit"]').trigger('click')
    await flushPromises()

    const approveButton = wrapper.findAll('button').find((button) => button.text().includes('Одобрить'))
    await approveButton!.trigger('click')
    await flushPromises()

    expect(moderateQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith({
      questionEditId: 'newer-edit',
      questionId: 'question-1',
      approve: true,
    })
    expect(wrapper.text()).toContain('Правка вопроса одобрена.')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('keeps the modal open with a safe summary when moderation fails', async () => {
    moderateQuestionEditMutationState.mutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { detail: 'Вы не автор оригинального вопроса', traceback: 'Authorization: Bearer secret' },
      },
    })
    const wrapper = mountQuestionReviewQueue()

    await wrapper.get('[data-testid="question-review-item-newer-edit"]').trigger('click')
    await flushPromises()

    const rejectButton = wrapper.findAll('button').find((button) => button.text().includes('Отклонить'))
    await rejectButton!.trigger('click')
    await flushPromises()

    expect(moderateQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ approve: false }))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Вы не автор оригинального вопроса')
    expect(wrapper.text()).not.toContain('Bearer secret')
  })

  it('shows pending action labels and disables both controls while moderation is in flight', async () => {
    moderateQuestionEditMutationState.isPending.value = true
    const wrapper = mountQuestionReviewQueue()

    await wrapper.get('[data-testid="question-review-item-newer-edit"]').trigger('click')
    await flushPromises()

    const actionButtons = wrapper.findAll('button').filter((button) =>
      button.text().includes('Одобр') || button.text().includes('Отклон'),
    )

    expect(actionButtons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
