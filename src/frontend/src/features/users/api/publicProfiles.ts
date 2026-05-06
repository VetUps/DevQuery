import { http } from '@/shared/api/http'
import { parseReputationSummary, type ReputationSummary } from '@/features/users/api/reputation'

export interface PublicUserProfile {
  user_id: string
  user_name: string
  user_role: string
  user_reputation_score: number
  user_avatar_url: string | null
  user_bio: string | null
  user_created_at: string
  reputation: ReputationSummary
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Malformed public profile response: ${fieldName}`)
  }

  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, fieldName)
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Malformed public profile response: ${fieldName}`)
  }

  return value
}

function parsePublicProfile(value: unknown): PublicUserProfile {
  if (!isRecord(value)) {
    throw new Error('Malformed public profile response: expected object')
  }

  return {
    user_id: assertString(value.user_id, 'user_id'),
    user_name: assertString(value.user_name, 'user_name'),
    user_role: assertString(value.user_role, 'user_role'),
    user_reputation_score: assertNumber(value.user_reputation_score, 'user_reputation_score'),
    user_avatar_url: assertNullableString(value.user_avatar_url, 'user_avatar_url'),
    user_bio: assertNullableString(value.user_bio, 'user_bio'),
    user_created_at: assertString(value.user_created_at, 'user_created_at'),
    reputation: parseReputationSummary(value.reputation),
  }
}

export async function fetchPublicProfile(userId: string) {
  const response = await http.get<unknown>(`/user/${userId}/public-profile/`)

  return parsePublicProfile(response.data)
}
