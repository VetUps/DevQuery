<<<<<<< Updated upstream
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
=======
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DraftAssistantResponse } from '@/features/questions/api/questionDraftAssistant'
import { updateQuestion, type QuestionDetail } from '@/features/questions/api/questions'
import QuestionEditForm from '@/features/questions/components/QuestionEditForm.vue'
import { http } from '@/shared/api/http'

const updateQuestionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const draftAssistantMutationState = {
  isPending: ref(false),
  error: ref<unknown>(null),
  data: ref(null),
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}

const tagAutocompleteQueryState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
}

vi.mock('@/features/questions/mutations/useUpdateQuestionMutation', () => ({
  useUpdateQuestionMutation: vi.fn(() => updateQuestionMutationState),
}))

vi.mock('@/features/questions/mutations/useQuestionDraftAssistantMutation', () => ({
  useQuestionDraftAssistantMutation: vi.fn(() => draftAssistantMutationState),
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

function getButtonByText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)

  if (!button) {
    throw new Error(`Expected button with text "${text}" to be rendered`)
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

    draftAssistantMutationState.isPending.value = false
    draftAssistantMutationState.error.value = null
    draftAssistantMutationState.data.value = null
    draftAssistantMutationState.mutateAsync.mockReset()
    draftAssistantMutationState.reset.mockReset()
    draftAssistantMutationState.reset.mockImplementation(() => {
      draftAssistantMutationState.error.value = null
      draftAssistantMutationState.data.value = null
    })

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

  it('requests draft assistant feedback with the current local edit draft without saving', async () => {
    draftAssistantMutationState.mutateAsync.mockResolvedValue({
      status: 'ok',
      mode: 'edit',
      summary: 'Черновик редактирования выглядит понятным.',
      findings: [],
      suggested_title: null,
      suggested_body: null,
      suggested_tags: [],
      warnings: [],
    })
    const wrapper = mountQuestionEditForm()

    expect(wrapper.text()).toContain('Проверить черновик вопроса')

    await wrapper.get('#question-edit-title').setValue('Как безопасно обновить Vue вопрос?')
    await wrapper.get('#question-edit-body').setValue('Нужна обратная связь перед сохранением правок.')
    await removeTag(wrapper, 'django')
    await wrapper.get('#question-edit-tags').setValue('vue-query')
    await getAddTagButton(wrapper).trigger('click')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(draftAssistantMutationState.mutateAsync).toHaveBeenCalledWith({
      question_title: 'Как безопасно обновить Vue вопрос?',
      question_body: 'Нужна обратная связь перед сохранением правок.',
      tags: ['vue', 'vue-query'],
      mode: 'edit',
    })
    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('keeps manual editing and save controls separate while assistant feedback is pending', async () => {
    draftAssistantMutationState.isPending.value = true
    const wrapper = mountQuestionEditForm()

    expect(wrapper.text()).toContain('Помощник анализирует черновик. Поля вопроса пока не изменяются.')

    const assistantButton = getButtonByText(wrapper, 'Проверяем…')
    expect(assistantButton.attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('#question-edit-title').setValue('Можно продолжать редактирование')

    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe('Можно продолжать редактирование')
    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('renders assistant failures as generic non-blocking copy without saving or dropping input', async () => {
    const rawAssistantError = 'provider stack trace Authorization: Bearer secret internal timeout payload'
    draftAssistantMutationState.mutateAsync.mockImplementation(async () => {
      draftAssistantMutationState.error.value = new Error(rawAssistantError)
      throw draftAssistantMutationState.error.value
    })
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('Черновик до ошибки помощника')
    await wrapper.get('#question-edit-body').setValue('Этот текст должен остаться доступен для ручного сохранения.')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось получить рекомендации. Попробуйте ещё раз позже; черновик не был изменён.')
    expect(wrapper.text()).not.toContain(rawAssistantError)
    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe('Черновик до ошибки помощника')
    expect((wrapper.get('#question-edit-body').element as HTMLTextAreaElement).value).toBe(
      'Этот текст должен остаться доступен для ручного сохранения.',
    )
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('saves the author-edited payload after a non-blocking assistant failure', async () => {
    draftAssistantMutationState.mutateAsync.mockImplementation(async () => {
      draftAssistantMutationState.error.value = new Error('raw provider failure with Authorization: Bearer secret-token')
      throw draftAssistantMutationState.error.value
    })
    updateQuestionMutationState.mutateAsync.mockResolvedValue(updatedQuestion)
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('  Авторский заголовок после ошибки помощника  ')
    await wrapper.get('#question-edit-body').setValue('  Авторский текст после ошибки помощника.  ')
    await removeTag(wrapper, 'django')
    await wrapper.get('#question-edit-tags').setValue('pinia')
    await getAddTagButton(wrapper).trigger('click')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось получить рекомендации. Попробуйте ещё раз позже; черновик не был изменён.')
    expect(wrapper.text()).not.toContain('secret-token')

    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(updateQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'question-1',
      payload: {
        question_title: 'Авторский заголовок после ошибки помощника',
        question_body: 'Авторский текст после ошибки помощника.',
        tags: ['vue', 'pinia'],
      },
    })
  })

  it('clears stale assistant result and error state when the edited question changes', async () => {
    draftAssistantMutationState.mutateAsync.mockResolvedValue({
      status: 'ok',
      mode: 'edit',
      summary: 'Старые рекомендации относятся к первому вопросу.',
      findings: [],
      suggested_title: 'Старый предложенный заголовок',
      suggested_body: 'Старый предложенный текст.',
      suggested_tags: ['old-tag'],
      warnings: [],
    })
    const nextQuestion: QuestionDetail = {
      ...baseQuestion,
      question_id: 'question-2',
      question_title: 'How do I rehydrate another edit form?',
      question_body: 'The second question body should replace the local draft.',
      tags: [{ name: 'pinia', questions_count: 2 }],
    }
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('Local draft before assistant feedback')
    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Старые рекомендации относятся к первому вопросу.')
    expect(wrapper.text()).toContain('Применить заголовок')

    draftAssistantMutationState.error.value = new Error('provider stack trace with sk-secret')
    await wrapper.setProps({ question: nextQuestion })
    await flushPromises()

    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe(nextQuestion.question_title)
    expect((wrapper.get('#question-edit-body').element as HTMLTextAreaElement).value).toBe(nextQuestion.question_body)
    expect(wrapper.text()).toContain('#pinia')
    expect(wrapper.text()).not.toContain('#vue')
    expect(wrapper.text()).not.toContain('Старые рекомендации относятся к первому вопросу.')
    expect(wrapper.text()).not.toContain('Применить заголовок')
    expect(wrapper.text()).not.toContain('Не удалось получить рекомендации')
    expect(draftAssistantMutationState.reset).toHaveBeenCalled()
  })

  it('ignores an in-flight assistant result when the edited question changes before it resolves', async () => {
    let resolveAssistant!: (result: DraftAssistantResponse) => void
    draftAssistantMutationState.mutateAsync.mockImplementation(
      () =>
        new Promise<DraftAssistantResponse>((resolve) => {
          resolveAssistant = resolve
        }),
    )
    const nextQuestion: QuestionDetail = {
      ...baseQuestion,
      question_id: 'question-2',
      question_title: 'How do I rehydrate another edit form?',
      question_body: 'The second question body should replace the local draft.',
      tags: [{ name: 'pinia', questions_count: 2 }],
    }
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('Changed local draft for the stale question')
    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await wrapper.setProps({ question: nextQuestion })
    resolveAssistant({
      status: 'ok',
      mode: 'edit',
      summary: 'Старый ответ помощника не должен появиться во второй форме.',
      findings: [],
      suggested_title: 'Старый предложенный заголовок',
      suggested_body: 'Старый предложенный текст.',
      suggested_tags: ['old-tag'],
      warnings: [],
    })
    await flushPromises()

    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe(nextQuestion.question_title)
    expect(wrapper.text()).toContain('#pinia')
    expect(wrapper.text()).not.toContain('Старый ответ помощника не должен появиться во второй форме.')
    expect(wrapper.text()).not.toContain('Старый предложенный заголовок')
    expect(wrapper.text()).not.toContain('Применить заголовок')
    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('ignores an in-flight assistant error when the edited question changes before it rejects', async () => {
    let rejectAssistant!: (error: Error) => void
    draftAssistantMutationState.mutateAsync.mockImplementation(
      () =>
        new Promise<DraftAssistantResponse>((_resolve, reject) => {
          rejectAssistant = reject
        }),
    )
    const nextQuestion: QuestionDetail = {
      ...baseQuestion,
      question_id: 'question-2',
      question_title: 'How do I rehydrate another edit form?',
      question_body: 'The second question body should replace the local draft.',
      tags: [{ name: 'pinia', questions_count: 2 }],
    }
    const wrapper = mountQuestionEditForm()
    const rawProviderError = new Error('provider stack trace Authorization: Bearer stale-secret')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await wrapper.setProps({ question: nextQuestion })
    draftAssistantMutationState.error.value = rawProviderError
    rejectAssistant(rawProviderError)
    await flushPromises()

    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe(nextQuestion.question_title)
    expect(wrapper.text()).toContain('#pinia')
    expect(wrapper.text()).not.toContain('Не удалось получить рекомендации')
    expect(wrapper.text()).not.toContain('stale-secret')
    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('applies assistant suggestions only after explicit local apply actions without saving', async () => {
    draftAssistantMutationState.mutateAsync.mockResolvedValue({
      status: 'ok',
      mode: 'edit',
      summary: 'Можно уточнить правки перед сохранением.',
      findings: [],
      suggested_title: 'Как отредактировать Vue Query вопрос без потери состояния?',
      suggested_body: 'Опишите исходную ошибку, предпринятые шаги и ожидаемый результат.',
      suggested_tags: ['vue', 'vue-query'],
      warnings: [],
    })
    const wrapper = mountQuestionEditForm()

    await wrapper.get('#question-edit-title').setValue('Исходный заголовок правки')
    await wrapper.get('#question-edit-body').setValue('Исходный текст правки.')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe('Исходный заголовок правки')
    expect((wrapper.get('#question-edit-body').element as HTMLTextAreaElement).value).toBe('Исходный текст правки.')
    expect(wrapper.text()).toContain('#vue')
    expect(wrapper.text()).toContain('#django')

    await getButtonByText(wrapper, 'Применить заголовок').trigger('click')
    expect((wrapper.get('#question-edit-title').element as HTMLInputElement).value).toBe(
      'Как отредактировать Vue Query вопрос без потери состояния?',
    )
    expect((wrapper.get('#question-edit-body').element as HTMLTextAreaElement).value).toBe('Исходный текст правки.')

    await getButtonByText(wrapper, 'Применить текст').trigger('click')
    expect((wrapper.get('#question-edit-body').element as HTMLTextAreaElement).value).toBe(
      'Опишите исходную ошибку, предпринятые шаги и ожидаемый результат.',
    )

    await getButtonByText(wrapper, 'Применить теги').trigger('click')
    expect(wrapper.text()).toContain('#vue-query')
    expect(wrapper.text()).not.toContain('#django')
    expect(updateQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
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
>>>>>>> Stashed changes
