import axios from 'axios'

export const LOGIN_FAILED_MESSAGE = 'Не удалось войти. Проверьте почту и пароль.'
export const REGISTER_FAILED_MESSAGE = 'Не удалось создать аккаунт. Проверьте введённые данные.'
export const SESSION_EXPIRED_MESSAGE = 'Сессия истекла. Войдите снова.'

function extractBackendMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null
  }

  const { data } = error.response ?? {}

  if (typeof data === 'string') {
    return data
  }

  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (typeof value === 'string') {
        return value
      }

      if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0]
      }
    }
  }

  return null
}

export function normalizeAuthErrorMessage(
  error: unknown,
  context: 'login' | 'register' | 'session' | 'generic' = 'generic',
): string {
  const backendMessage = extractBackendMessage(error)

  if (context === 'session') {
    return SESSION_EXPIRED_MESSAGE
  }

  if (backendMessage) {
    if (backendMessage.includes('такой почтой уже существует')) {
      return 'Не удалось создать аккаунт. Почта уже используется.'
    }

    if (backendMessage.includes('Пароль не совпадают')) {
      return 'Не удалось создать аккаунт. Пароли не совпадают.'
    }
  }

  if (context === 'login') {
    return LOGIN_FAILED_MESSAGE
  }

  if (context === 'register') {
    return REGISTER_FAILED_MESSAGE
  }

  return backendMessage ?? 'Произошла ошибка. Попробуйте ещё раз.'
}
