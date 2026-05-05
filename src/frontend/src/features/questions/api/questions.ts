import { http } from '@/shared/api/http'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface QuestionTag {
  name: string
  questions_count: number
}

export interface QuestionListItem {
  question_id: string
  user: string
  question_title: string
  question_status: 'open' | 'closed' | 'solved' | string
  question_created_at: string
  question_updated_at: string
  tags: QuestionTag[]
}

export type QuestionOrdering = '-question_created_at' | 'question_created_at'

export interface QuestionListParams {
  page: number
  search?: string
  ordering?: QuestionOrdering
  tags?: string[]
}

export interface VoteContext {
  upvotes: number
  downvotes: number
  score: number
  user_vote: 'up' | 'down' | null | string
}

export interface QuestionDetail extends QuestionListItem, VoteContext {
  question_body: string
}

export interface TagSuggestion {
  name: string
  questions_count: number
}

export interface CreateQuestionPayload {
  question_title: string
  question_body: string
  tags?: string[]
}

export interface UpdateQuestionPayload {
  question_title: string
  question_body: string
  tags: string[]
}

export interface CreateQuestionResponse {
  question_id: string
  user: string
  question_title: string
  question_body: string
  question_status: 'open' | 'closed' | 'solved' | string
  question_created_at: string
  question_updated_at: string
  tags: QuestionTag[]
}

export function normalizeQuestionTags(tags: readonly unknown[] = []) {
  const normalizedTags = tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)

  return [...new Set(normalizedTags)]
}

export async function fetchQuestionList(params: QuestionListParams) {
  const normalizedTags = normalizeQuestionTags(params.tags)
  const response = await http.get<PaginatedResponse<QuestionListItem>>('/question/', {
    params: {
      page: params.page,
      search: params.search || undefined,
      ordering: params.ordering,
      tag: normalizedTags.length > 0 ? normalizedTags : undefined,
    },
    paramsSerializer: {
      indexes: null,
    },
  })

  return response.data
}

export async function fetchQuestionDetail(questionId: string) {
  const response = await http.get<QuestionDetail>(`/question/${questionId}/`)

  return response.data
}

export function normalizeTagSearch(search: string) {
  return search.trim().toLowerCase()
}

export async function fetchTagAutocomplete(search: string) {
  const normalizedSearch = normalizeTagSearch(search)

  if (!normalizedSearch) {
    return []
  }

  const response = await http.get<TagSuggestion[]>('/tag/', {
    params: { search: normalizedSearch },
  })

  return response.data
}

export async function createQuestion(payload: CreateQuestionPayload) {
  const response = await http.post<CreateQuestionResponse>('/question/', payload)

  return response.data
}

function isQuestionTag(value: unknown): value is QuestionTag {
  if (!value || typeof value !== 'object') {
    return false
  }

  const tag = value as Record<string, unknown>

  return typeof tag.name === 'string' && typeof tag.questions_count === 'number'
}

function isQuestionDetail(value: unknown): value is QuestionDetail {
  if (!value || typeof value !== 'object') {
    return false
  }

  const question = value as Record<string, unknown>

  return (
    typeof question.question_id === 'string' &&
    typeof question.user === 'string' &&
    typeof question.question_title === 'string' &&
    typeof question.question_body === 'string' &&
    typeof question.question_status === 'string' &&
    typeof question.question_created_at === 'string' &&
    typeof question.question_updated_at === 'string' &&
    typeof question.upvotes === 'number' &&
    typeof question.downvotes === 'number' &&
    typeof question.score === 'number' &&
    Array.isArray(question.tags) &&
    question.tags.every(isQuestionTag)
  )
}

export async function updateQuestion(questionId: string, payload: UpdateQuestionPayload) {
  const response = await http.patch<unknown>(`/question/${questionId}/`, payload)

  if (!isQuestionDetail(response.data)) {
    throw new Error('Malformed question update response')
  }

  return response.data
}
