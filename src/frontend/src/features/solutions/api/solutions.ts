import { http } from '@/shared/api/http'
import type { PaginatedResponse, VoteContext } from '@/features/questions/api/questions'

export interface SolutionListItem extends VoteContext {
  solution_id: string
  user: string
  question_id?: string
  solution_body: string
  solution_is_best: boolean
  solution_created_at: string
  solution_updated_at: string
}

export interface CreateSolutionPayload {
  question: string
  solution_body: string
}

export interface CreateSolutionResponse {
  solution_id: string
  user: string
  question: string
  solution_body: string
  solution_is_best: boolean
  solution_created_at: string
  solution_updated_at: string
}

export async function fetchSolutions(questionId: string) {
  const response = await http.get<PaginatedResponse<SolutionListItem>>('/solution/', {
    params: {
      question_id: questionId,
    },
  })

  return response.data
}

export async function createSolution(payload: CreateSolutionPayload) {
  const response = await http.post<CreateSolutionResponse>('/solution/', payload)

  return response.data
}
