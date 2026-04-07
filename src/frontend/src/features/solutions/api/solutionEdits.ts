import { http } from '@/shared/api/http'

export interface CreateSolutionEditPayload {
  solution: string
  solution_edit_body_after: string
}

export interface CreateSolutionEditResponse {
  solution_edit_id: string
  solution: string
  user: string
  solution_edit_body_before: string
  solution_edit_body_after: string
  solution_edit_is_approved: boolean | null
  solution_edit_edited_at: string
}

export async function createSolutionEdit(payload: CreateSolutionEditPayload) {
  const response = await http.post<CreateSolutionEditResponse>('/solution_edits/', payload)

  return response.data
}
