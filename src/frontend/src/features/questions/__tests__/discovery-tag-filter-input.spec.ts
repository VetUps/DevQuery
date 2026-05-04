import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DiscoveryTagFilterInput from '@/features/questions/components/DiscoveryTagFilterInput.vue'

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
})
