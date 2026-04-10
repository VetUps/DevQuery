import { http } from '@/shared/api/http'

export interface CreateSolutionEditPayload {
  solution: string
  solution_edit_body_after: string
}

export type SolutionEditApprovalState = boolean | null

export interface CreateSolutionEditResponse {
  solution_edit_id: string
  solution: string
  user: string
  solution_edit_body_before: string
  solution_edit_body_after: string
  solution_edit_is_approved: SolutionEditApprovalState
  solution_edit_edited_at: string
}

export interface SolutionEditRecord {
  solution_edit_id: string
  solution: string
  solution_id: string
  solution_question_id: string
  solution_question_title: string
  solution_owner_id: string | null
  solution_owner_name: string
  user: string | null
  edit_author_id: string | null
  edit_author_name: string
  solution_excerpt: string
  solution_edit_body_before: string
  solution_edit_body_after: string
  solution_edit_is_approved: SolutionEditApprovalState
  solution_edit_edited_at: string
}

export interface ModerateSolutionEditResponse {
  approved: boolean
}

export async function createSolutionEdit(payload: CreateSolutionEditPayload) {
  const response = await http.post<CreateSolutionEditResponse>('/solution_edits/', payload)

  return response.data
}

export async function fetchReviewQueue() {
  const response = await http.get<SolutionEditRecord[]>('/solution_edits/review_queue/')

  return response.data
}

export async function fetchMyEditHistory() {
  const response = await http.get<SolutionEditRecord[]>('/solution_edits/my_history/')

  return response.data
}

export async function fetchPublicSolutionEditHistory(solutionId: string) {
  const response = await http.get<SolutionEditRecord[]>(`/solution_edits/history/${solutionId}/`)

  return response.data
}

export async function approveSolutionEdit(solutionEditId: string) {
  const response = await http.patch<ModerateSolutionEditResponse>(`/solution_edits/approve/${solutionEditId}/`)

  return response.data
}

export async function disapproveSolutionEdit(solutionEditId: string) {
  const response = await http.patch<ModerateSolutionEditResponse>(`/solution_edits/disapprove/${solutionEditId}/`)

  return response.data
}
