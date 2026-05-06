import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppButton from '@/shared/ui/AppButton.vue'

describe('AppButton', () => {
  it('uses the regular size by default', () => {
    const wrapper = mount(AppButton, {
      slots: {
        default: 'Default action',
      },
    })

    expect(wrapper.classes()).toContain('app-button--regular')
    expect(wrapper.classes()).not.toContain('app-button--compact')
  })

  it('renders the compact size class without losing slot text', () => {
    const wrapper = mount(AppButton, {
      props: {
        size: 'compact',
      },
      slots: {
        default: 'Compact action',
      },
    })

    expect(wrapper.classes()).toContain('app-button--compact')
    expect(wrapper.text()).toBe('Compact action')
  })

  it('keeps variant and disabled behavior when compact sizing is used', () => {
    const wrapper = mount(AppButton, {
      props: {
        size: 'compact',
        variant: 'secondary',
        disabled: true,
      },
      slots: {
        default: 'Disabled compact action',
      },
    })

    expect(wrapper.classes()).toContain('app-button--compact')
    expect(wrapper.classes()).toContain('app-button--secondary')
    expect(wrapper.attributes('disabled')).toBeDefined()
  })
})
