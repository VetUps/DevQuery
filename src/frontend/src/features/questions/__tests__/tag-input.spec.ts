import { ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QuestionTagInput from '@/features/questions/components/QuestionTagInput.vue'
import type { TagSuggestion } from '@/features/questions/api/questions'

const autocompleteState = {
  data: ref<TagSuggestion[] | undefined>(undefined),
  isPending: ref(false),
  isError: ref(false),
}

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => autocompleteState),
}))

function mountTagInput(options: { modelValue?: string[]; maxTags?: number; error?: string } = {}) {
  return mount(QuestionTagInput, {
    props: {
      id: 'question-tags',
      label: 'Теги',
      modelValue: options.modelValue ?? [],
      maxTags: options.maxTags,
      error: options.error,
    },
  })
}

function addButton(wrapper: VueWrapper) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes('Добавить'))

  if (!button) {
    throw new Error('Add button was not found')
  }

  return button
}

async function addDraft(wrapper: VueWrapper, value: string) {
  await wrapper.get('input').setValue(value)
  await addButton(wrapper).trigger('click')
}

function lastModelUpdate(wrapper: VueWrapper) {
  const updates = wrapper.emitted('update:modelValue') ?? []

  return updates.at(-1)?.[0] as string[] | undefined
}

describe('QuestionTagInput', () => {
  beforeEach(() => {
    autocompleteState.data.value = undefined
    autocompleteState.isPending.value = false
    autocompleteState.isError.value = false
  })

  it('normalizes a manually entered tag and emits it through v-model', async () => {
    const wrapper = mountTagInput()

    await addDraft(wrapper, '  Vue  ')

    expect(lastModelUpdate(wrapper)).toEqual(['vue'])
  })

  it('adds an autocomplete suggestion with its visible question count', async () => {
    autocompleteState.data.value = [{ name: 'django', questions_count: 12 }]
    const wrapper = mountTagInput()

    await wrapper.get('input').setValue('dja')

    expect(wrapper.text()).toContain('#django')
    expect(wrapper.text()).toContain('12 вопросов')

    await wrapper.get('[role="option"]').trigger('click')

    expect(lastModelUpdate(wrapper)).toEqual(['django'])
  })

  it('prevents duplicate tags without emitting a second copy', async () => {
    const wrapper = mountTagInput({ modelValue: ['vue'] })

    await addDraft(wrapper, 'VUE')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.text()).toContain('Этот тег уже добавлен.')
  })

  it('removes a selected chip by emitting the remaining tags', async () => {
    const wrapper = mountTagInput({ modelValue: ['vue', 'django'] })

    await wrapper.get('[aria-label="Удалить тег vue"]').trigger('click')

    expect(lastModelUpdate(wrapper)).toEqual(['django'])
  })

  it('locks entry at the max tag limit and keeps the limit copy visible', async () => {
    const wrapper = mountTagInput({ modelValue: ['vue', 'django', 'mysql', 'python', 'drf'] })

    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Достигнут лимит: 5 тегов.')

    await addButton(wrapper).trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('rejects blank, non-latin, oversized, and sixth tag attempts without emitting invalid additions', async () => {
    const wrapper = mountTagInput({ modelValue: ['vue', 'django', 'mysql', 'python'] })

    await addDraft(wrapper, '   ')
    expect(wrapper.text()).toContain('Введите название тега перед добавлением.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await addDraft(wrapper, 'вью')
    expect(wrapper.text()).toContain('Тег может содержать только латинские буквы, цифры и дефисы.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await addDraft(wrapper, 'a'.repeat(51))
    expect(wrapper.text()).toContain('Тег не может быть длиннее 50 символов.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await addDraft(wrapper, 'drf')
    expect(lastModelUpdate(wrapper)).toEqual(['vue', 'django', 'mysql', 'python', 'drf'])

    await wrapper.setProps({ modelValue: ['vue', 'django', 'mysql', 'python', 'drf'] })
    await addDraft(wrapper, 'fastapi')
    expect(lastModelUpdate(wrapper)).toEqual(['vue', 'django', 'mysql', 'python', 'drf'])
    expect(wrapper.text()).toContain('Достигнут лимит: 5 тегов.')
  })

  it('keeps manual entry available when autocomplete fails', async () => {
    autocompleteState.isError.value = true
    const wrapper = mountTagInput()

    await wrapper.get('input').setValue('tanstack-query')

    expect(wrapper.text()).toContain('Не удалось загрузить подсказки. Можно добавить тег вручную.')

    await addButton(wrapper).trigger('click')

    expect(lastModelUpdate(wrapper)).toEqual(['tanstack-query'])
  })
})
