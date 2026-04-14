import { http } from '@/shared/api/http'

export interface PublicUserProfile {
  user_id: string
  user_name: string
  user_role: string
  user_reputation_score: number
  user_avatar_url: string | null
  user_bio: string | null
  user_created_at: string
}

export async function fetchPublicProfile(userId: string) {
  const response = await http.get<PublicUserProfile>(`/user/${userId}/public-profile/`)

  return response.data
}
