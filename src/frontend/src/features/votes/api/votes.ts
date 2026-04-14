import { http } from '@/shared/api/http'

export type VoteTargetType = 'question' | 'solution'
export type VoteType = 'up' | 'down'

export interface VoteResponse {
  vote_id: string
  user: string
  target_type: VoteTargetType
  target_id: string
  vote_type: VoteType
  created_at: string
  updated_at: string
}

interface CastVotePayload {
  target_type: VoteTargetType
  target_id: string
  vote_type: VoteType
}

export async function castVote(payload: CastVotePayload) {
  const response = await http.post<VoteResponse>('/vote/cast/', payload)

  return response.data
}

export async function removeVote(target_type: VoteTargetType, target_id: string) {
  await http.delete('/vote/remove/', {
    params: {
      target_type,
      target_id,
    },
  })
}
