import { describe, expect, it } from 'vitest'

import type { UserProfile } from '@/features/auth/api/auth'
import { canAccessAdminWorkspace } from '@/features/admin/libs/admin-access'

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'user-1',
    user_name: 'Sergey',
    user_email: 'sergey@example.com',
    user_role: 'user',
    user_reputation_score: 128,
    user_avatar_url: null,
    user_bio: null,
    user_created_at: '2026-04-01T09:15:00Z',
    reputation: {
      score: 128,
      level: 'expert',
      level_label: 'Эксперт',
      level_minimum_score: 100,
      is_manual_override: false,
      manual_level: null,
      next_level: 'master',
      next_level_label: 'Мастер',
      next_level_minimum_score: 300,
      points_to_next_level: 172,
    },
    reputation_ledger: [],
    ...overrides,
  }
}

describe('admin access helper', () => {
  it('allows parsed admin profiles into the admin workspace', () => {
    expect(canAccessAdminWorkspace(buildProfile({ user_role: 'admin' }))).toBe(true)
  })

  it('denies ordinary, missing, and malformed profile values', () => {
    expect(canAccessAdminWorkspace(buildProfile({ user_role: 'user' }))).toBe(false)
    expect(canAccessAdminWorkspace(null)).toBe(false)
    expect(canAccessAdminWorkspace({ user_role: 'admin' })).toBe(false)
    expect(canAccessAdminWorkspace({ user_id: 'user-1', user_role: 'admin' })).toBe(false)
    expect(canAccessAdminWorkspace({ ...buildProfile(), user_role: 'moderator' })).toBe(false)
  })
})
