// Кратко: выполняет запросы к backend и нормализует ответ.
import { http } from '@/shared/api/http'

export interface QuestionRevisionRecord {
  question_revision_id: string
  question: string
  actor: string | null
  actor_name: string
  source: string
  question_edit: string | null
  title_before: string
  title_after: string
  body_before: string
  body_after: string
  tags_before: string[]
  tags_after: string[]
  created_at: string
}

export interface QuestionRevisionListResponse {
  count: number
  next: string | null
  previous: string | null
  results: QuestionRevisionRecord[]
}

export class MalformedQuestionRevisionResponseError extends Error {
  constructor(message = 'Malformed question revision API response') {
    super(message)
    this.name = 'MalformedQuestionRevisionResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new MalformedQuestionRevisionResponseError(`Malformed question revision response: ${fieldName}`)
  }

  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, fieldName)
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new MalformedQuestionRevisionResponseError(`Malformed question revision response: ${fieldName}`)
  }

  return value
}

function parseQuestionRevisionRecord(value: unknown): QuestionRevisionRecord {
  if (!isRecord(value)) {
    throw new MalformedQuestionRevisionResponseError('Malformed question revision response: expected object')
  }

  return {
    question_revision_id: assertString(value.question_revision_id ?? value.revision_id, 'question_revision_id'),
    question: assertString(value.question, 'question'),
    actor: assertNullableString(value.actor, 'actor'),
    actor_name: assertString(value.actor_name, 'actor_name'),
    source: assertString(value.source, 'source'),
    question_edit: assertNullableString(value.question_edit ?? value.proposal, 'question_edit'),
    title_before: assertString(value.title_before, 'title_before'),
    title_after: assertString(value.title_after, 'title_after'),
    body_before: assertString(value.body_before, 'body_before'),
    body_after: assertString(value.body_after, 'body_after'),
    tags_before: assertStringArray(value.tags_before, 'tags_before'),
    tags_after: assertStringArray(value.tags_after, 'tags_after'),
    created_at: assertString(value.created_at, 'created_at'),
  }
}

function parseNullablePageUrl(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, fieldName)
}

function parseQuestionRevisionListResponse(value: unknown): QuestionRevisionListResponse {
  if (Array.isArray(value)) {
    return {
      count: value.length,
      next: null,
      previous: null,
      results: value.map(parseQuestionRevisionRecord),
    }
  }

  if (!isRecord(value)) {
    throw new MalformedQuestionRevisionResponseError('Malformed question revision list response: expected object')
  }

  if (typeof value.count !== 'number' || !Number.isFinite(value.count)) {
    throw new MalformedQuestionRevisionResponseError('Malformed question revision list response: count')
  }

  if (!Array.isArray(value.results)) {
    throw new MalformedQuestionRevisionResponseError('Malformed question revision list response: results')
  }

  return {
    count: value.count,
    next: parseNullablePageUrl(value.next, 'next'),
    previous: parseNullablePageUrl(value.previous, 'previous'),
    results: value.results.map(parseQuestionRevisionRecord),
  }
}

export async function fetchQuestionRevisions(questionId: string) {
  const response = await http.get<unknown>(`/question/history/${questionId}/revisions/`)

  return parseQuestionRevisionListResponse(response.data)
}

export function normalizeQuestionRevisionError(error: unknown) {
  if (
    isRecord(error) &&
    error.isAxiosError === true &&
    isRecord(error.response) &&
    error.response.status === 404
  ) {
    return 'Вопрос не найден или история правок недоступна.'
  }

  if (error instanceof MalformedQuestionRevisionResponseError) {
    return 'История правок временно недоступна из-за неожиданного ответа сервера.'
  }

  return 'Не удалось загрузить историю правок вопроса. Попробуйте ещё раз.'
}
