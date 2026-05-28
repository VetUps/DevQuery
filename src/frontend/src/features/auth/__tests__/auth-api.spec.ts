import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProfile, loginUser, registerUser, type UserProfile } from '@/features/auth/api/auth'

const mockAuthTransport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAuthTransport),
  },
}))

function buildReputationSummary() {
  return {
    score: 125,
    level: 'participant',
    level_label: 'Участник',
    next_level: 'expert',
    points_to_next_level: 75,
  }
}

function buildReputationLedgerEntry() {
  return {
    id: 'ledger-1',
    amount: 15,
    reason: 'question_upvoted',
    note: null,
    actor_name: null,
    created_at: '2026-05-06T12:00:00Z',
  }
}

function buildUserProfilePayload(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    user_name: 'alice',
    user_email: 'alice@example.com',
    user_role: 'user',
    user_reputation_score: 125,
    user_avatar_url: null,
    user_avatar_updated_at: null,
    user_bio: null,
    user_created_at: '2026-05-01T10:00:00Z',
    reputation: buildReputationSummary(),
    reputation_ledger: [buildReputationLedgerEntry()],
    ...overrides,
  }
}

describe('auth API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses ordinary and admin roles from profile payloads', async () => {
    mockAuthTransport.get.mockResolvedValueOnce({ data: buildUserProfilePayload() })
    mockAuthTransport.get.mockResolvedValueOnce({ data: buildUserProfilePayload({ user_role: 'admin' }) })

    await expect(fetchProfile('user-token')).resolves.toMatchObject({ user_role: 'user' })
    await expect(fetchProfile('admin-token')).resolves.toMatchObject({ user_role: 'admin' })
  })

  it('parses user_role from login and register responses without persisting role separately', async () => {
    mockAuthTransport.post.mockResolvedValueOnce({
      data: {
        access: 'access-token',
        refresh: 'refresh-token',
        user: buildUserProfilePayload({ user_role: 'admin' }),
      },
    })
    mockAuthTransport.post.mockResolvedValueOnce({ data: buildUserProfilePayload({ user_role: 'user' }) })

    await expect(loginUser({ user_email: 'admin@example.com', password: 'password' })).resolves.toMatchObject({
      access: 'access-token',
      refresh: 'refresh-token',
      user: { user_role: 'admin' },
    })
    await expect(
      registerUser({
        user_name: 'alice',
        user_email: 'alice@example.com',
        password: 'password',
        password_confirm: 'password',
      }),
    ).resolves.toMatchObject({ user_role: 'user' })
  })

  it('rejects missing, empty, non-string, and unsupported user_role payloads at the parser boundary', async () => {
    for (const userRole of [undefined, '', 42, 'moderator']) {
      mockAuthTransport.get.mockResolvedValueOnce({ data: buildUserProfilePayload({ user_role: userRole }) })

      await expect(fetchProfile('access-token')).rejects.toThrow('Malformed auth response: user_role')
    }
  })

  it('keeps UserProfile typed with the narrow role contract', () => {
    const profile: UserProfile = {
      user_id: 'user-1',
      user_name: 'alice',
      user_email: 'alice@example.com',
      user_role: 'admin',
      user_reputation_score: 125,
      user_avatar_url: null,
      user_avatar_updated_at: null,
      user_bio: null,
      user_created_at: '2026-05-01T10:00:00Z',
      reputation: buildReputationSummary(),
      reputation_ledger: [buildReputationLedgerEntry()],
    }

    expect(profile.user_role).toBe('admin')
  })
})
