import axios from 'axios'

export interface QuestionFieldErrors {
  question_title: string
  question_body: string
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

export function extractQuestionFieldErrors(error: unknown): QuestionFieldErrors {
  const fieldErrors: QuestionFieldErrors = {
    question_title: '',
    question_body: '',
  }

  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return fieldErrors
  }

  const data = error.response.data as Record<string, unknown>

  fieldErrors.question_title = getFirstErrorMessage(data.question_title)
  fieldErrors.question_body = getFirstErrorMessage(data.question_body)

  return fieldErrors
}

export function normalizeQuestionSubmitError(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return 'Не удалось опубликовать вопрос. Попробуйте ещё раз.'
  }

  const data = error.response.data as Record<string, unknown>
  const nonFieldError = getFirstErrorMessage(data.non_field_errors) || getFirstErrorMessage(data.detail)

  return nonFieldError || 'Не удалось опубликовать вопрос. Попробуйте ещё раз.'
}
