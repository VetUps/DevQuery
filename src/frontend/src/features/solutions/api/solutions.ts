// Кратко: выполняет запросы к backend и нормализует ответ.
import { http } from '@/shared/api/http'
import type { PaginatedResponse, VoteContext } from '@/features/questions/api/questions'
import type { ReputationSummary } from '@/features/users/api/reputation'

export interface SolutionListItem extends VoteContext {
  solution_id: string
  user: string
  user_name: string
  user_avatar_url?: string | null
  user_avatar_updated_at?: string | null
  user_reputation_score?: number | null
  reputation?: ReputationSummary | null
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
  user_name: string
  user_avatar_url?: string | null
  user_avatar_updated_at?: string | null
  question: string
  solution_body: string
  solution_is_best: boolean
  solution_created_at: string
  solution_updated_at: string
}

export interface BestSolutionPayload {
  solution_is_best: boolean
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

export async function markSolutionBest(solutionId: string, payload: BestSolutionPayload) {
  const response = await http.patch<SolutionListItem>(`/solution/${solutionId}/best/`, payload)

  return response.data
}
