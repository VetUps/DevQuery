// Кратко: выполняет запросы к backend и нормализует ответ.
import { http } from '@/shared/api/http'
import type { PaginatedResponse } from '@/features/questions/api/questions'
import type { ReputationSummary } from '@/features/users/api/reputation'

export type CommentTargetType = 'question' | 'solution'

export interface CommentListItem {
  comment_id: string
  user: string
  user_name: string
  user_avatar_url: string | null
  user_avatar_updated_at?: string | null
  user_reputation_score?: number | null
  reputation?: ReputationSummary | null
  target_type: CommentTargetType
  target_id: string
  parent_id: string | null
  body: string
  created_at: string
}

export interface CommentThreadItem extends CommentListItem {
  replies: CommentListItem[]
}

export interface CreateCommentPayload {
  target_type: CommentTargetType
  target_id: string
  parent_id?: string | null
  body: string
}

export type CreateCommentResponse = CommentListItem

export async function fetchCommentContext(target_type: CommentTargetType, target_id: string) {
  const response = await http.get<PaginatedResponse<CommentThreadItem>>('/comment/', {
    params: {
      target_type,
      target_id,
    },
  })

  return response.data
}

export async function fetchCommentThread(
  target_type: CommentTargetType,
  target_id: string,
  parent_id?: string | null,
) {
  const response = await http.get<PaginatedResponse<CommentThreadItem>>('/comment/', {
    params: {
      target_type,
      target_id,
      ...(parent_id ? { parent_id } : {}),
    },
  })

  return response.data
}

export async function createComment(payload: CreateCommentPayload) {
  const response = await http.post<CreateCommentResponse>('/comment/', payload)

  return response.data
}
