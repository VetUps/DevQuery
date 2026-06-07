// Кратко: держит основную логику этого файла.
import type { UserProfile } from '@/features/auth/api/auth'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.length > 0
}

export function canAccessAdminWorkspace(profile: unknown): profile is UserProfile {
  if (!isRecord(profile)) {
    return false
  }

  return (
    isNonEmptyString(profile.user_id) &&
    isNonEmptyString(profile.user_name) &&
    isNonEmptyString(profile.user_email) &&
    profile.user_role === 'admin' &&
    typeof profile.user_reputation_score === 'number' &&
    Number.isFinite(profile.user_reputation_score) &&
    isNonEmptyString(profile.user_created_at) &&
    isRecord(profile.reputation) &&
    Array.isArray(profile.reputation_ledger)
  )
}
