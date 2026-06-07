import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import RegisterForm from '@/features/auth/components/RegisterForm.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/features/auth/api/auth', () => ({
  registerUser: vi.fn(),
}))

describe('RegisterForm', () => {
  it('lets users reveal and hide both password fields during registration', async () => {
    const wrapper = mount(RegisterForm)

    const passwordInput = () => wrapper.get<HTMLInputElement>('#register-password')
    const passwordConfirmInput = () => wrapper.get<HTMLInputElement>('#register-password-confirm')
    const toggle = () => wrapper.get('[data-testid="register-password-visibility-toggle"]')

    expect(passwordInput().attributes('type')).toBe('password')
    expect(passwordConfirmInput().attributes('type')).toBe('password')
    expect(toggle().attributes('aria-pressed')).toBe('false')
    expect(toggle().attributes('aria-label')).toBe('Показать пароль')
    expect(toggle().find('svg').exists()).toBe(true)
    expect(toggle().text()).toBe('')

    await toggle().trigger('click')

    expect(passwordInput().attributes('type')).toBe('text')
    expect(passwordConfirmInput().attributes('type')).toBe('text')
    expect(toggle().attributes('aria-pressed')).toBe('true')
    expect(toggle().attributes('aria-label')).toBe('Скрыть пароль')
    expect(toggle().find('svg').exists()).toBe(true)
    expect(toggle().text()).toBe('')

    await toggle().trigger('click')

    expect(passwordInput().attributes('type')).toBe('password')
    expect(passwordConfirmInput().attributes('type')).toBe('password')
  })
})
