import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QuestionDetail } from '@/features/questions/api/questions'
import QuestionEditProposalModal from '@/features/questions/components/QuestionEditProposalModal.vue'

const createQuestionEditMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const tagAutocompleteQueryState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
}

vi.mock('@/features/questions/mutations/useCreateQuestionEditMutation', () => ({
  useCreateQuestionEditMutation: vi.fn(() => createQuestionEditMutationState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteQueryState),
}))

const baseQuestion: QuestionDetail = {
  question_id: 'question-1',
  user: 'author-1',
  question_title: 'How do I propose a question edit?',
  question_body: 'The original question body describes the problem.',
  question_status: 'open',
  question_created_at: '2026-05-01T10:00:00Z',
  question_updated_at: '2026-05-01T11:00:00Z',
  tags: [
    { name: 'vue', questions_count: 4 },
    { name: 'django', questions_count: 7 },
  ],
  upvotes: 2,
  downvotes: 0,
  score: 2,
  user_vote: null,
}

function mountProposalModal(question: QuestionDetail = baseQuestion) {
  return mount(QuestionEditProposalModal, {
    attachTo: document.body,
    props: {
      open: true,
      question,
    },
    global: {
      stubs: {
        teleport: true,
      },
    },
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

describe('question edit proposal modal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    createQuestionEditMutationState.isPending.value = false
    createQuestionEditMutationState.mutateAsync.mockReset()
    tagAutocompleteQueryState.data.value = []
    tagAutocompleteQueryState.isPending.value = false
    tagAutocompleteQueryState.isError.value = false
  })

  it('hydrates fields from the visible question and exposes accessible dialog controls', () => {
    const wrapper = mountProposalModal()

    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.text()).toContain('Предложить правку вопроса')
    expect((wrapper.get('#question-edit-proposal-title').element as HTMLInputElement).value).toBe(baseQuestion.question_title)
    expect((wrapper.get('#question-edit-proposal-body').element as HTMLTextAreaElement).value).toBe(baseQuestion.question_body)
    expect(wrapper.text()).toContain('#vue')
    expect(wrapper.text()).toContain('#django')
    expect(wrapper.find('[role="tablist"]').attributes('aria-label')).toBe('Режим предложения правки вопроса')
  })

  it('rejects unchanged normalized title, body, and tags before calling the API', async () => {
    const wrapper = mountProposalModal()

    await wrapper.get('#question-edit-proposal-title').setValue(`  ${baseQuestion.question_title}  `)
    await wrapper.get('#question-edit-proposal-body').setValue(`\n${baseQuestion.question_body}\n`)
    await wrapper.get('form').trigger('submit.prevent')

    expect(createQuestionEditMutationState.mutateAsync).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Измените заголовок, текст или теги перед отправкой предложения.')
  })

  it('submits trimmed title/body and normalized replacement tags without mutating visible question detail', async () => {
    createQuestionEditMutationState.mutateAsync.mockResolvedValue({ question_edit_id: 'edit-1' })
    const wrapper = mountProposalModal()

    await wrapper.get('#question-edit-proposal-title').setValue('  How do I propose a safer question edit?  ')
    await wrapper.get('#question-edit-proposal-body').setValue('  Updated body with clearer context.  ')
    await removeTag(wrapper, 'django')
    await wrapper.get('#question-edit-proposal-tags').setValue('mysql')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith({
      question: 'question-1',
      question_edit_title_after: 'How do I propose a safer question edit?',
      question_edit_body_after: 'Updated body with clearer context.',
      tags: ['vue', 'mysql'],
    })
    expect(wrapper.emitted('submitted')?.[0]?.[0]).toEqual({ question_edit_id: 'edit-1' })
    expect(baseQuestion.question_title).toBe('How do I propose a question edit?')
  })

  it('allows proposals that change only tags and accepts exactly five tags', async () => {
    createQuestionEditMutationState.mutateAsync.mockResolvedValue({ question_edit_id: 'edit-tags-only' })
    const wrapper = mountProposalModal({
      ...baseQuestion,
      tags: [{ name: 'vue', questions_count: 4 }],
    })

    for (const tag of ['django', 'mysql', 'docker', 'typescript']) {
      await wrapper.get('#question-edit-proposal-tags').setValue(tag)
      await getAddTagButton(wrapper).trigger('click')
    }

    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['vue', 'django', 'mysql', 'docker', 'typescript'],
    }))
  })

  it('keeps manual tag entry available when autocomplete fails', async () => {
    createQuestionEditMutationState.mutateAsync.mockResolvedValue({ question_edit_id: 'edit-1' })
    tagAutocompleteQueryState.isError.value = true
    const wrapper = mountProposalModal()

    await wrapper.get('#question-edit-proposal-tags').setValue('mysql')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось загрузить подсказки. Можно добавить тег вручную.')
    expect(createQuestionEditMutationState.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['vue', 'django', 'mysql'],
    }))
  })

  it('retains the draft and renders normalized field errors when submission fails', async () => {
    createQuestionEditMutationState.mutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          question_edit_title_after: ['Введите заголовок.'],
          tags: ['Теги должны быть списком строк.'],
          traceback: 'Authorization: Bearer secret',
        },
      },
    })
    const wrapper = mountProposalModal()

    await wrapper.get('#question-edit-proposal-title').setValue('Draft survives failed submit')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Введите заголовок.')
    expect(wrapper.text()).toContain('Теги должны быть списком строк.')
    expect(wrapper.text()).not.toContain('Bearer secret')
    expect((wrapper.get('#question-edit-proposal-title').element as HTMLInputElement).value).toBe('Draft survives failed submit')
  })

  it('shows pending state and disables duplicate submit', () => {
    createQuestionEditMutationState.isPending.value = true
    const wrapper = mountProposalModal()

    expect(wrapper.get('button[type="submit"]').text()).toContain('Отправляем предложение…')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
