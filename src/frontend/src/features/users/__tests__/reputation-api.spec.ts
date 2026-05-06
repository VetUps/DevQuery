import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from '@/shared/api/http'
import {
  parseReputationLedger,
  parseReputationSummary,
  MalformedReputationResponseError,
  type ReputationLedgerEntry,
  type ReputationSummary,
} from '@/features/users/api/reputation'
import { fetchPublicProfile } from '@/features/users/api/publicProfiles'
import { fetchReputationLedger } from '@/features/users/api/reputationLedger'
import { fetchProfile } from '@/features/auth/api/auth'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
  },
}))

vi.mock('@/features/auth/api/auth', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/api/auth')>('@/features/auth/api/auth')

  return {
    ...actual,
    fetchProfile: vi.fn(),
  }
})

const mockedHttp = vi.mocked(http)
const mockedFetchProfile = vi.mocked(fetchProfile)

function buildReputationSummary(overrides: Partial<ReputationSummary> = {}): ReputationSummary {
  return {
    score: 125,
    level: 'master',
    level_label: 'Мастер',
    next_level: null,
    points_to_next_level: 0,
    ...overrides,
  }
}

function buildReputationLedgerEntry(overrides: Partial<ReputationLedgerEntry> = {}): ReputationLedgerEntry {
  return {
    id: 'transaction-1',
    amount: 15,
    reason: 'best_solution',
    note: 'Выбран лучший ответ.',
    actor_name: 'moderator',
    created_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

function buildPublicProfilePayload(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    user_name: 'alice',
    user_role: 'user',
    user_reputation_score: 125,
    user_avatar_url: null,
    user_bio: 'Backend and frontend developer',
    user_created_at: '2026-05-01T10:00:00Z',
    reputation: buildReputationSummary(),
    internal_override_state: true,
    ...overrides,
  }
}

describe('reputation API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses backend-shaped reputation summaries with optional override fields', () => {
    expect(
      parseReputationSummary(
        buildReputationSummary({
          manual_level: 'master',
          is_manual_override: true,
        }),
      ),
    ).toEqual({
      score: 125,
      level: 'master',
      level_label: 'Мастер',
      next_level: null,
      points_to_next_level: 0,
      manual_level: 'master',
      is_manual_override: true,
    })
  })

  it('parses bounded reputation ledger entries and allows null note or actor names', () => {
    expect(
      parseReputationLedger([
        buildReputationLedgerEntry(),
        buildReputationLedgerEntry({
          id: 'transaction-2',
          amount: 2,
          reason: 'approved_edit',
          note: null,
          actor_name: null,
        }),
      ]),
    ).toEqual([
      buildReputationLedgerEntry(),
      buildReputationLedgerEntry({
        id: 'transaction-2',
        amount: 2,
        reason: 'approved_edit',
        note: null,
        actor_name: null,
      }),
    ])
  })

  it('rejects malformed reputation summary and ledger payloads with typed errors', () => {
    expect(() => parseReputationSummary({ ...buildReputationSummary(), level: 'legend' })).toThrow(
      MalformedReputationResponseError,
    )
    expect(() => parseReputationSummary({ ...buildReputationSummary(), score: '125' })).toThrow(
      MalformedReputationResponseError,
    )
    expect(() => parseReputationLedger({ results: [] })).toThrow(MalformedReputationResponseError)
    expect(() => parseReputationLedger([{ ...buildReputationLedgerEntry(), amount: '15' }])).toThrow(
      MalformedReputationResponseError,
    )
  })

  it('fetches and sanitizes public profile reputation fields while dropping unexpected internals', async () => {
    mockedHttp.get.mockResolvedValue({
      data: buildPublicProfilePayload({
        reputation: buildReputationSummary({
          next_level: 'master',
          points_to_next_level: 10,
        }),
      }),
    })

    const result = await fetchPublicProfile('user-1')

    expect(mockedHttp.get).toHaveBeenCalledWith('/user/user-1/public-profile/')
    expect(result).toEqual({
      user_id: 'user-1',
      user_name: 'alice',
      user_role: 'user',
      user_reputation_score: 125,
      user_avatar_url: null,
      user_bio: 'Backend and frontend developer',
      user_created_at: '2026-05-01T10:00:00Z',
      reputation: buildReputationSummary({
        next_level: 'master',
        points_to_next_level: 10,
      }),
    })
    expect(result).not.toHaveProperty('internal_override_state')
  })

  it('rejects malformed public profile reputation payloads before they reach the UI', async () => {
    mockedHttp.get.mockResolvedValue({
      data: buildPublicProfilePayload({
        reputation: { ...buildReputationSummary(), points_to_next_level: '10' },
      }),
    })

    await expect(fetchPublicProfile('user-1')).rejects.toBeInstanceOf(MalformedReputationResponseError)
  })

  it('returns the authenticated reputation ledger through the dedicated frontend contract', async () => {
    mockedFetchProfile.mockResolvedValue({
      user_id: 'user-1',
      user_name: 'alice',
      user_email: 'alice@example.com',
      user_reputation_score: 125,
      user_avatar_url: null,
      user_bio: null,
      user_created_at: '2026-05-01T10:00:00Z',
      reputation: buildReputationSummary({
        manual_level: 'master',
        is_manual_override: true,
      }),
      reputation_ledger: [buildReputationLedgerEntry()],
    })

    await expect(fetchReputationLedger('access-token')).resolves.toEqual([buildReputationLedgerEntry()])
    expect(mockedFetchProfile).toHaveBeenCalledWith('access-token')
  })
})
