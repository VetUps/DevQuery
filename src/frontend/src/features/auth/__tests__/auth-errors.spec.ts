import { describe, expect, it } from 'vitest'

import { normalizeAuthErrorMessage } from '@/features/auth/libs/auth-errors'

function createAxiosLikeError(data: unknown) {
  return {
    isAxiosError: true,
    response: {
      data,
    },
  }
}

describe('auth error normalization', () => {
  it('shows a clear duplicate username registration message', () => {
    const message = normalizeAuthErrorMessage(
      createAxiosLikeError({
        user_name: ['Пользователь с таким логином уже существует'],
      }),
      'register',
    )

    expect(message).toBe('Пользователь с таким логином уже есть.')
  })

  it('shows a clear duplicate email registration message', () => {
    const message = normalizeAuthErrorMessage(
      createAxiosLikeError({
        user_email: ['Пользователь с такой почтой уже существует'],
      }),
      'register',
    )

    expect(message).toBe('Пользователь с такой почтой уже есть.')
  })

  it('normalizes DRF unique username messages', () => {
    const message = normalizeAuthErrorMessage(
      createAxiosLikeError({
        user_name: ['custom user with this user name already exists.'],
      }),
      'register',
    )

    expect(message).toBe('Пользователь с таким логином уже есть.')
  })

  it('normalizes DRF unique email messages', () => {
    const message = normalizeAuthErrorMessage(
      createAxiosLikeError({
        user_email: ['custom user with this user email already exists.'],
      }),
      'register',
    )

    expect(message).toBe('Пользователь с такой почтой уже есть.')
  })
})
