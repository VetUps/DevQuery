import axios from 'axios'

export interface CommentFieldErrors {
  body: string
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
  fieldErrors.body = getFirstErrorMessage(data.body)

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
    getFirstErrorMessage(data.body) ||
    'Не удалось отправить комментарий. Попробуйте ещё раз.'
  )
}
