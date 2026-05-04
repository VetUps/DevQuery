import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QuestionOrdering } from '@/features/questions/api/questions'
import DiscoverySearchReserve from '@/features/questions/components/DiscoverySearchReserve.vue'

const autocompleteState = vi.hoisted(() => ({
  data: [] as unknown,
  isError: false,
  isFetching: false,
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => autocompleteState),
}))

function mountDiscoverySearchReserve(options: {
  search?: string
  ordering?: QuestionOrdering
  tags?: string[]
  totalQuestions?: number
} = {}) {
  return mount(DiscoverySearchReserve, {
    props: {
      search: options.search ?? '',
      ordering: options.ordering ?? '-question_created_at',
      tags: options.tags ?? [],
      totalQuestions: options.totalQuestions ?? 12,
    },
  })
}

function draftInput(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="discovery-tag-draft"]')
}

function addButton(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="discovery-tag-add"]')
}

async function addDraft(wrapper: VueWrapper, value: string) {
  await draftInput(wrapper).setValue(value)
  await addButton(wrapper).trigger('click')
}

function lastTagsUpdate(wrapper: VueWrapper) {
  const updates = wrapper.emitted('update:tags') ?? []

  return updates.at(-1)?.[0] as string[] | undefined
}

describe('DiscoverySearchReserve', () => {
  beforeEach(() => {
    autocompleteState.data = []
    autocompleteState.isError = false
    autocompleteState.isFetching = false
  })

  it('composes the discovery tag input with the current editable tags model', () => {
    const wrapper = mountDiscoverySearchReserve({
      search: 'serializer',
      ordering: 'question_created_at',
      tags: ['Vue', ' django ', '', 'vue'],
      totalQuestions: 7,
    })

    expect(wrapper.get('[data-testid="discovery-search-reserve"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="question-search-input"]').element).toHaveProperty('value', 'serializer')
    expect(wrapper.get('[data-testid="question-ordering-select"]').element).toHaveProperty('value', 'question_created_at')
    expect(wrapper.get('[data-testid="discovery-tag-filter-input"]').text()).toContain('Фильтр по тегам')
    expect(wrapper.get('[data-testid="discovery-tag-chip-vue"]').text()).toContain('#vue')
    expect(wrapper.get('[data-testid="discovery-tag-chip-django"]').text()).toContain('#django')
    expect(wrapper.findAll('[data-testid^="discovery-tag-chip-"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="active-tag-filters"]').exists()).toBe(false)
  })

  it('emits normalized tag model updates when a manual tag is added, removed, or cleared', async () => {
    const wrapper = mountDiscoverySearchReserve({ tags: ['vue'] })

    await addDraft(wrapper, ' Django ')
    expect(lastTagsUpdate(wrapper)).toEqual(['vue', 'django'])

    await wrapper.setProps({ tags: ['vue', 'django'] })
    await wrapper.get('[data-testid="discovery-tag-remove-vue"]').trigger('click')
    expect(lastTagsUpdate(wrapper)).toEqual(['django'])

    await wrapper.setProps({ tags: ['django'] })
    await wrapper.get('[data-testid="discovery-tag-clear-all"]').trigger('click')
    expect(lastTagsUpdate(wrapper)).toEqual([])
  })

  it('keeps manual tag emission available when autocomplete is empty or failing', async () => {
    const emptyWrapper = mountDiscoverySearchReserve({ tags: [] })

    await addDraft(emptyWrapper, 'unknown')
    expect(lastTagsUpdate(emptyWrapper)).toEqual(['unknown'])

    autocompleteState.isError = true
    const errorWrapper = mountDiscoverySearchReserve({ tags: [] })

    await draftInput(errorWrapper).setValue('offline')
    expect(errorWrapper.get('[data-testid="discovery-tag-autocomplete-status"]').text()).toContain(
      'Не удалось загрузить подсказки',
    )

    await addButton(errorWrapper).trigger('click')
    expect(lastTagsUpdate(errorWrapper)).toEqual(['offline'])
  })

  it('renders an empty tag model as an addable input without chips', () => {
    const wrapper = mountDiscoverySearchReserve({ tags: [] })

    expect(wrapper.find('[data-testid="discovery-tag-chips"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="discovery-tag-draft"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="discovery-tag-add"]').exists()).toBe(true)
  })
})
