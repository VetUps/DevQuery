import axios from 'axios'

export interface SolutionFieldErrors {
  solution_body: string
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

export function extractSolutionFieldErrors(error: unknown): SolutionFieldErrors {
  const fieldErrors: SolutionFieldErrors = {
    solution_body: '',
  }

  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return fieldErrors
  }

  const data = error.response.data as Record<string, unknown>
  fieldErrors.solution_body = getFirstErrorMessage(data.solution_body)

  return fieldErrors
}

export function normalizeSolutionSubmitError(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return 'Не удалось добавить решение. Попробуйте ещё раз.'
  }

  const data = error.response.data as Record<string, unknown>
  const duplicateMessage = getFirstErrorMessage(data.non_field_errors) || getFirstErrorMessage(data.detail)

  if (duplicateMessage.includes('Пользователь уже выложил решение на данный вопрос')) {
    return 'Вы уже ответили на этот вопрос. Откройте своё решение ниже.'
  }

  return duplicateMessage || 'Не удалось добавить решение. Попробуйте ещё раз.'
}
