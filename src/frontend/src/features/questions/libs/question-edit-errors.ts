import axios from 'axios'

export interface QuestionEditFieldErrors {
  question_edit_title_after: string
  question_edit_body_after: string
  tags: string
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

function getResponseData(error: unknown): Record<string, unknown> | null {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return null
  }

  return error.response.data as Record<string, unknown>
}

export function extractQuestionEditFieldErrors(error: unknown): QuestionEditFieldErrors {
  const fieldErrors: QuestionEditFieldErrors = {
    question_edit_title_after: '',
    question_edit_body_after: '',
    tags: '',
  }
  const data = getResponseData(error)

  if (!data) {
    return fieldErrors
  }

  fieldErrors.question_edit_title_after = getFirstErrorMessage(data.question_edit_title_after)
  fieldErrors.question_edit_body_after = getFirstErrorMessage(data.question_edit_body_after)
  fieldErrors.tags = getFirstErrorMessage(data.tags)

  return fieldErrors
}

export function normalizeQuestionEditError(error: unknown) {
  const data = getResponseData(error)

  if (!data) {
    return 'Не удалось отправить правку вопроса. Попробуйте ещё раз.'
  }

  const nonFieldError = getFirstErrorMessage(data.non_field_errors) || getFirstErrorMessage(data.detail)

  if (nonFieldError.includes('Пользователь уже выложил правку')) {
    return 'У вас уже есть правка этого вопроса в ожидании проверки.'
  }

  return nonFieldError || 'Не удалось отправить правку вопроса. Попробуйте ещё раз.'
}

export function normalizeQuestionEditModerationError(error: unknown) {
  const data = getResponseData(error)

  if (!data) {
    return 'Не удалось обновить статус правки вопроса. Попробуйте ещё раз.'
  }

  return (
    getFirstErrorMessage(data.detail) ||
    getFirstErrorMessage(data.non_field_errors) ||
    'Не удалось обновить статус правки вопроса. Попробуйте ещё раз.'
  )
}
