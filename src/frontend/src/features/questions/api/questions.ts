import { http } from '@/shared/api/http'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface QuestionListItem {
  question_id: string
  user: string
  question_title: string
  question_status: 'open' | 'closed' | 'solved' | string
  question_created_at: string
  question_updated_at: string
}

export type QuestionOrdering = '-question_created_at' | 'question_created_at'

export interface QuestionListParams {
  page: number
  search?: string
  ordering?: QuestionOrdering
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

export interface CreateQuestionPayload {
  question_title: string
  question_body: string
}

export interface CreateQuestionResponse {
  question_id: string
  user: string
  question_title: string
  question_body: string
  question_status: 'open' | 'closed' | 'solved' | string
  question_created_at: string
  question_updated_at: string
}

export async function fetchQuestionList(params: QuestionListParams) {
  const response = await http.get<PaginatedResponse<QuestionListItem>>('/question/', {
    params: {
      page: params.page,
      search: params.search || undefined,
      ordering: params.ordering,
    },
  })

  return response.data
}

export async function fetchQuestionDetail(questionId: string) {
  const response = await http.get<QuestionDetail>(`/question/${questionId}/`)

  return response.data
}

export async function createQuestion(payload: CreateQuestionPayload) {
  const response = await http.post<CreateQuestionResponse>('/question/', payload)

  return response.data
}
