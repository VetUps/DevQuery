import { http } from '@/shared/api/http'
import type { PaginatedResponse } from '@/features/questions/api/questions'

export type CommentTargetType = 'question' | 'solution'

export interface CommentListItem {
  comment_id: string
  user: string
  user_name: string
  user_avatar_url: string | null
  target_type: CommentTargetType
  target_id: string
  parent_id: string | null
  body: string
  created_at: string
}

export async function fetchCommentContext(target_type: CommentTargetType, target_id: string) {
  const response = await http.get<PaginatedResponse<CommentListItem>>('/comment/', {
    params: {
      target_type,
      target_id,
    },
  })

  return response.data
}
