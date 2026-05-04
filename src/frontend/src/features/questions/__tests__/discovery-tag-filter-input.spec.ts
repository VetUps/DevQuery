import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DiscoveryTagFilterInput from '@/features/questions/components/DiscoveryTagFilterInput.vue'

const autocompleteState = vi.hoisted(() => ({
  data: [] as unknown,
  isError: false,
  isFetching: false,
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => autocompleteState),
}))

function mountDiscoveryTagFilterInput(options: { modelValue?: string[] } = {}) {
  return mount(DiscoveryTagFilterInput, {
    props: {
      id: 'discovery-tags',
      label: 'Фильтр по тегам',
      modelValue: options.modelValue ?? [],
    },
  })
}

function addButton(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="discovery-tag-add"]')
}

function draftInput(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="discovery-tag-draft"]')
}

async function addDraft(wrapper: VueWrapper, value: string) {
  await draftInput(wrapper).setValue(value)
  await addButton(wrapper).trigger('click')
}

function lastModelUpdate(wrapper: VueWrapper) {
  const updates = wrapper.emitted('update:modelValue') ?? []

  return updates.at(-1)?.[0] as string[] | undefined
}

describe('DiscoveryTagFilterInput', () => {
  beforeEach(() => {
    autocompleteState.data = []
    autocompleteState.isError = false
    autocompleteState.isFetching = false
  })

  it('normalizes a manually entered tag and emits it through v-model', async () => {
    const wrapper = mountDiscoveryTagFilterInput()

    await addDraft(wrapper, '  Vue  ')

    expect(lastModelUpdate(wrapper)).toEqual(['vue'])
    expect((draftInput(wrapper).element as HTMLInputElement).value).toBe('')
  })

  it('renders selected tags as removable chips', async () => {
    const wrapper = mountDiscoveryTagFilterInput({ modelValue: ['vue', 'django'] })

    expect(wrapper.get('[data-testid="discovery-tag-chip-vue"]').text()).toContain('#vue')
    expect(wrapper.get('[data-testid="discovery-tag-chip-django"]').text()).toContain('#django')

    await wrapper.get('[data-testid="discovery-tag-remove-vue"]').trigger('click')
    expect(lastModelUpdate(wrapper)).toEqual(['django'])

    await wrapper.setProps({ modelValue: ['django'] })
    await wrapper.get('[data-testid="discovery-tag-remove-django"]').trigger('click')
    expect(lastModelUpdate(wrapper)).toEqual([])
  })

  it('clears all selected tags from a multi-tag model', async () => {
    const wrapper = mountDiscoveryTagFilterInput({ modelValue: ['vue', 'django', 'mysql'] })

    await wrapper.get('[data-testid="discovery-tag-clear-all"]').trigger('click')

    expect(lastModelUpdate(wrapper)).toEqual([])
  })

  it('rejects blank attempts with local feedback and no model update', async () => {
    const wrapper = mountDiscoveryTagFilterInput()

    await addDraft(wrapper, '   ')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('[data-testid="discovery-tag-feedback"]').text()).toContain('Введите тег')
    expect(wrapper.find('[data-testid="discovery-tag-autocomplete"]').exists()).toBe(false)
  })

  it('rejects duplicate mixed-case attempts with local feedback and no invalid update', async () => {
    const wrapper = mountDiscoveryTagFilterInput({ modelValue: ['vue'] })

    await addDraft(wrapper, ' VUE ')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('[data-testid="discovery-tag-feedback"]').text()).toContain('уже добавлен')
  })

  it('normalizes malformed parent values when adding without enforcing a create-form tag cap', async () => {
    const wrapper = mountDiscoveryTagFilterInput({
      modelValue: [' Vue ', '', 'DJANGO', 'vue', 'mysql', 'python', 'drf'],
    })

    await addDraft(wrapper, ' FastAPI ')

    expect(lastModelUpdate(wrapper)).toEqual(['vue', 'django', 'mysql', 'python', 'drf', 'fastapi'])
  })

  it('adds the draft when Enter or comma is pressed', async () => {
    const wrapper = mountDiscoveryTagFilterInput()

    await draftInput(wrapper).setValue('Nuxt')
    await draftInput(wrapper).trigger('keydown.enter')
    expect(lastModelUpdate(wrapper)).toEqual(['nuxt'])

    await wrapper.setProps({ modelValue: ['nuxt'] })
    await draftInput(wrapper).setValue('Pinia')
    await draftInput(wrapper).trigger('keydown', { key: ',' })
    expect(lastModelUpdate(wrapper)).toEqual(['nuxt', 'pinia'])
  })

  it('shows normalized autocomplete suggestions and hides blanks, duplicates, and selected tags', async () => {
    autocompleteState.data = [
      { name: ' Vue ' },
      { name: 'vue' },
      { name: 'DJANGO' },
      { name: '   ' },
      { name: null },
    ]
    const wrapper = mountDiscoveryTagFilterInput({ modelValue: ['django'] })

    await draftInput(wrapper).setValue(' vu ')

    expect(wrapper.get('[data-testid="discovery-tag-suggestion-vue"]').text()).toContain('#vue')
    expect(wrapper.find('[data-testid="discovery-tag-suggestion-django"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid^="discovery-tag-suggestion-"]')).toHaveLength(1)
  })

  it('selects an autocomplete suggestion, emits the normalized tag list, and clears the draft', async () => {
    autocompleteState.data = [{ name: 'Vue' }]
    const wrapper = mountDiscoveryTagFilterInput({ modelValue: ['django'] })

    await draftInput(wrapper).setValue('v')
    await wrapper.get('[data-testid="discovery-tag-suggestion-vue"]').trigger('click')

    expect(lastModelUpdate(wrapper)).toEqual(['django', 'vue'])
    expect((draftInput(wrapper).element as HTMLInputElement).value).toBe('')
  })

  it('shows a pending diagnostic without blocking manual add', async () => {
    autocompleteState.isFetching = true
    const wrapper = mountDiscoveryTagFilterInput()

    await draftInput(wrapper).setValue('slow')

    expect(wrapper.get('[data-testid="discovery-tag-autocomplete-status"]').text()).toContain('Ищем')

    await addButton(wrapper).trigger('click')
    expect(lastModelUpdate(wrapper)).toEqual(['slow'])
  })

  it('shows manual-entry fallback copy when suggestions are empty', async () => {
    autocompleteState.data = []
    const wrapper = mountDiscoveryTagFilterInput()

    await draftInput(wrapper).setValue('unknown')

    expect(wrapper.get('[data-testid="discovery-tag-autocomplete-status"]').text()).toContain('Подсказок нет')
    expect(wrapper.find('[data-testid="discovery-tag-suggestions"]').exists()).toBe(false)
  })

  it('shows a soft autocomplete warning while preserving manual add on query failure', async () => {
    autocompleteState.isError = true
    const wrapper = mountDiscoveryTagFilterInput()

    await draftInput(wrapper).setValue('offline')

    expect(wrapper.get('[data-testid="discovery-tag-autocomplete-status"]').text()).toContain(
      'Не удалось загрузить подсказки',
    )

    await addButton(wrapper).trigger('click')
    expect(lastModelUpdate(wrapper)).toEqual(['offline'])
  })

  it('treats malformed autocomplete payloads as empty suggestions and keeps manual fallback available', async () => {
    autocompleteState.data = { results: [{ name: 'vue' }] }
    const wrapper = mountDiscoveryTagFilterInput()

    await draftInput(wrapper).setValue('vue')

    expect(wrapper.get('[data-testid="discovery-tag-autocomplete-status"]').text()).toContain('Подсказок нет')

    await addButton(wrapper).trigger('click')
    expect(lastModelUpdate(wrapper)).toEqual(['vue'])
  })
})
