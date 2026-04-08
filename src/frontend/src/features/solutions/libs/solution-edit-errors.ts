import axios from 'axios'

export interface SolutionEditFieldErrors {
  solution_edit_body_after: string
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

export function extractSolutionEditFieldErrors(error: unknown): SolutionEditFieldErrors {
  const fieldErrors: SolutionEditFieldErrors = {
    solution_edit_body_after: '',
  }

  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return fieldErrors
  }

  const data = error.response.data as Record<string, unknown>
  fieldErrors.solution_edit_body_after = getFirstErrorMessage(data.solution_edit_body_after)

  return fieldErrors
}

export function normalizeSolutionEditError(error: unknown) {
  if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') {
    return 'Не удалось отправить правку. Попробуйте ещё раз.'
  }

  const data = error.response.data as Record<string, unknown>
  const duplicateMessage = getFirstErrorMessage(data.non_field_errors) || getFirstErrorMessage(data.detail)

  if (duplicateMessage.includes('Пользователь уже выложил правку')) {
    return 'У вас уже есть правка этого решения в ожидании проверки.'
  }

  return (
    duplicateMessage ||
    getFirstErrorMessage(data.solution_edit_body_after) ||
    'Не удалось отправить правку. Попробуйте ещё раз.'
  )
}
