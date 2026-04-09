import axios from 'axios'

export interface CommentFieldErrors {
  body: string
}

function normalizeCommentBodyError(message: string) {
  if (!message) {
    return ''
  }

  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('800') || normalizedMessage.includes('символ')) {
    return 'Комментарий не должен быть длиннее 800 символов.'
  }

  if (normalizedMessage.includes('добавьте текст комментария')) {
    return 'Добавьте текст комментария.'
  }

  return message
}

function getFirstErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return ''
}

export function extractCommentFieldErrors(error: unknown): CommentFieldErrors {
  const fieldErrors: CommentFieldErrors = {
    body: '',
  }

  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return fieldErrors
  }

  const data = error.response.data as Record<string, unknown>
  fieldErrors.body = normalizeCommentBodyError(getFirstErrorMessage(data.body))

  return fieldErrors
}

export function normalizeCommentSubmitError(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return 'Не удалось отправить комментарий. Попробуйте ещё раз.'
  }

  const data = error.response.data as Record<string, unknown>

  return (
    getFirstErrorMessage(data.detail) ||
    getFirstErrorMessage(data.non_field_errors) ||
    normalizeCommentBodyError(getFirstErrorMessage(data.body)) ||
    'Не удалось отправить комментарий. Попробуйте ещё раз.'
  )
}
