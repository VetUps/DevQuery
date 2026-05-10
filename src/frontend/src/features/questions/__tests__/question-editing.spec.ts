import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateQuestion, type QuestionDetail } from '@/features/questions/api/questions'
import QuestionEditForm from '@/features/questions/components/QuestionEditForm.vue'
import { http } from '@/shared/api/http'

const updateQuestionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const tagAutocompleteQueryState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
}

vi.mock('@/features/questions/mutations/useUpdateQuestionMutation', () => ({
  useUpdateQuestionMutation: vi.fn(() => updateQuestionMutationState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteQueryState),
}))

const baseQuestion: QuestionDetail = {
  question_id: 'question-1',
  user: 'author',
  question_title: 'How do I edit a Vue question?',
  question_body: 'The existing body explains the original problem.',
  question_status: 'open',
  question_created_at: '2026-01-01T00:00:00Z',
  question_updated_at: '2026-01-01T00:00:00Z',
  tags: [
    { name: 'vue', questions_count: 12 },
    { name: 'django', questions_count: 7 },
  ],
  upvotes: 3,
  downvotes: 1,
  score: 2,
  user_vote: null,
}

const updatedQuestion: QuestionDetail = {
  ...baseQuestion,
  question_title: 'How do I edit a Vue question safely?',
  question_body: 'Updated body from the backend.',
  question_updated_at: '2026-01-02T00:00:00Z',
  tags: [
    { name: 'vue', questions_count: 12 },
    { name: 'mysql', questions_count: 4 },
  ],
}

function mountQuestionEditForm(question: QuestionDetail = baseQuestion) {
  return mount(QuestionEditForm, {
    props: { question },
  })
}

function getAddTagButton(wrapper: VueWrapper) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Добавить')

  if (!button) {
    throw new Error('Expected the add tag button to be rendered')
  }

  return button
}

async function removeTag(wrapper: VueWrapper, tagName: string) {
  const button = wrapper.find(`button[aria-label="Удалить тег ${tagName}"]`)

  if (!button.exists()) {
    throw new Error(`Expected the ${tagName} remove button to be rendered`)
  }

  await button.trigger('click')
}

describe('question update API boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('patches the live question endpoint with the selected edit payload', async () => {
    const patchSpy = vi.spyOn(http, 'patch').mockResolvedValue({ data: updatedQuestion })

    await expect(
      updateQuestion('question-1', {
        question_title: 'Updated title',
        question_body: 'Updated body',
        tags: ['vue', 'mysql'],
      }),
    ).resolves.toMatchObject(updatedQuestion)

    expect(patchSpy).toHaveBeenCalledWith('/question/question-1/', {
      question_title: 'Updated title',
      question_body: 'Updated body',
      tags: ['vue', 'mysql'],
    })
  })

  it('rejects malformed update responses before the UI emits saved data', async () => {
    vi.spyOn(http, 'patch').mockResolvedValue({ data: { question_id: 'question-1' } })

    await expect(
      updateQuestion('question-1', {
        question_title: 'Updated title',
        question_body: 'Updated body',
        tags: ['vue'],
      }),
    ).rejects.toThrow('Malformed question update response')
  })
})

describe('question edit form', () => {
  beforeEach(() => {
    updateQuestionMutationState.isPending.value = false
    updateQuestionMutationState.mutateAsync.mockReset()

    tagAutocompleteQueryState.data.value = []
    tagAutocompleteQueryState.isPending.value = false
    tagAutocompleteQueryState.isError.value = false
  })

  it('hydrates editable fields from the question detail', () => {
    const wrapper = mountQuestionEditForm()

    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe(baseQuestion.question_title)
    expect((wrapper.get('#question-edit-body').element as HTMLTextAreaElement).value).toBe(baseQuestion.question_body)
    expect(wrapper.text()).toContain('#vue')
    expect(wrapper.text()).toContain('#django')
  })

  it('blocks submit when required fields are empty', async () => {
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('   ')
    await wrapper.get('#question-edit-body').setValue('   ')
    await removeTag(wrapper, 'vue')
    await removeTag(wrapper, 'django')
    await wrapper.get('form').trigger('submit.prevent')

    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Проверьте форму и исправьте ошибки перед сохранением.')
    expect(wrapper.text()).toContain('Добавьте короткий заголовок вопроса.')
    expect(wrapper.text()).toContain('Опишите вопрос и приведите технический контекст.')
    expect(wrapper.text()).toContain('Добавьте хотя бы один тег к вопросу.')
  })

  it('sends trimmed text and selected tags in the update payload', async () => {
    updateQuestionMutationState.mutateAsync.mockResolvedValue(updatedQuestion)
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('  How do I edit a Vue question safely?  ')
    await wrapper.get('#question-edit-body').setValue('  Updated body from the editor.  ')
    await removeTag(wrapper, 'django')
    await wrapper.get('#question-edit-tags').setValue('mysql')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(updateQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      payload: {
        question_title: 'How do I edit a Vue question safely?',
        question_body: 'Updated body from the editor.',
        tags: ['vue', 'mysql'],
      },
    })
  })

  it('renders server tag errors without clearing selected tags', async () => {
    updateQuestionMutationState.mutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          tags: ['Нельзя использовать этот тег для вопроса.'],
        },
      },
    })
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('How do I edit a Vue question safely?')
    await wrapper.get('#question-edit-body').setValue('Updated body from the editor.')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Нельзя использовать этот тег для вопроса.')
    expect(wrapper.text()).toContain('#vue')
    expect(wrapper.text()).toContain('#django')
    expect(updateQuestionMutationState.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('emits the backend-returned updated question after a successful save', async () => {
    updateQuestionMutationState.mutateAsync.mockResolvedValue(updatedQuestion)
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('How do I edit a Vue question safely?')
    await wrapper.get('#question-edit-body').setValue('Updated body from the editor.')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.emitted('saved')?.[0]).toEqual([updatedQuestion])
    expect(wrapper.text()).toContain('Изменения сохранены.')
  })

  it('keeps manual tag submission available when autocomplete fails', async () => {
    updateQuestionMutationState.mutateAsync.mockResolvedValue(updatedQuestion)
    tagAutocompleteQueryState.isError.value = true
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-tags').setValue('mysql')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось загрузить подсказки. Можно добавить тег вручную.')
    expect(updateQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      payload: expect.objectContaining({ tags: ['vue', 'django', 'mysql'] }),
    })
  })

  it('shows pending and safe failure states without dropping form input', async () => {
    updateQuestionMutationState.isPending.value = true
    const wrapper = mountQuestionEditForm()

    expect(wrapper.get('button[type="submit"]').text()).toContain('Сохраняем изменения…')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    updateQuestionMutationState.isPending.value = false
    updateQuestionMutationState.mutateAsync.mockRejectedValue(new Error('timeout with Authorization: Bearer secret'))

    await wrapper.get('#question-edit-title').setValue('Edited title that survives failure')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось сохранить изменения. Попробуйте ещё раз.')
    expect(wrapper.text()).not.toContain('Bearer secret')
    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe('Edited title that survives failure')
  })
})