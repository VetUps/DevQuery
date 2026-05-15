import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from '@/shared/api/http'
import {
  fetchAdminReputationPolicyConfig,
  fetchAdminUserActivityTimeline,
  fetchAdminUserDetail,
  fetchAdminUsers,
  MalformedAdminApiResponseError,
  parseAdminReputationPolicyConfig,
  parseAdminUserActivityTimeline,
  parseAdminUserDetail,
  parseAdminUserList,
  updateAdminReputationPolicyConfig,
  updateAdminUserManualOverride,
  type AdminReputationPolicyConfig,
  type AdminUserActivityItem,
  type AdminUserActivityTimeline,
  type AdminUserDetail,
  type AdminUserListRow,
} from '@/features/admin/api/admin'
import type { ReputationLedgerEntry, ReputationSummary } from '@/features/users/api/reputation'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

const mockedHttp = vi.mocked(http)

function buildReputationSummary(overrides: Partial<ReputationSummary> = {}): ReputationSummary {
  return {
    score: 250,
    level: 'expert',
    level_label: 'Эксперт',
    level_minimum_score: 200,
    next_level: 'master',
    next_level_label: 'Мастер',
    next_level_minimum_score: 500,
    points_to_next_level: 250,
    ...overrides,
  }
}

function buildReputationLedgerEntry(overrides: Partial<ReputationLedgerEntry> = {}): ReputationLedgerEntry {
  return {
    id: 'transaction-1',
    amount: 25,
    reason: 'admin_adjustment',
    note: 'Manual correction.',
    actor_name: 'admin',
    created_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

function buildAdminUserListRow(overrides: Partial<AdminUserListRow> & Record<string, unknown> = {}): AdminUserListRow & Record<string, unknown> {
  return {
    user_id: '11111111-1111-1111-1111-111111111111',
    user_name: 'alice',
    user_email: 'alice@example.com',
    user_role: 'user',
    user_reputation_score: 250,
    user_created_at: '2026-05-01T10:00:00Z',
    ...overrides,
  }
}

function buildAdminUserDetail(overrides: Partial<AdminUserDetail> & Record<string, unknown> = {}): AdminUserDetail & Record<string, unknown> {
  return {
    ...buildAdminUserListRow(),
    reputation: buildReputationSummary(),
    reputation_ledger: [buildReputationLedgerEntry()],
    ...overrides,
  }
}

function buildAdminReputationPolicyConfig(
  overrides: Partial<AdminReputationPolicyConfig> & Record<string, unknown> = {},
): AdminReputationPolicyConfig & Record<string, unknown> {
  return {
    protected_newcomer_window_hours: 24,
    max_protected_newcomer_window_hours: 168,
    updated_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

function buildAdminUserActivityItem(
  overrides: Partial<AdminUserActivityItem> & Record<string, unknown> = {},
): AdminUserActivityItem & Record<string, unknown> {
  return {
    id: 'activity-1',
    type: 'question',
    occurred_at: '2026-05-06T12:00:00Z',
    title: 'Question created',
    summary: 'Created a question.',
    target_label: 'How to test Vue?',
    route: {
      kind: 'question',
      question_id: 'question-1',
    },
    ...overrides,
  }
}

function buildAdminUserActivityTimeline(
  overrides: Partial<AdminUserActivityTimeline> & Record<string, unknown> = {},
): AdminUserActivityTimeline & Record<string, unknown> {
  return {
    items: [buildAdminUserActivityItem()],
    count: 1,
    page: 1,
    limit: 25,
    available_types: [
      'comment',
      'question',
      'question_edit_event',
      'question_edit_proposal',
      'question_revision',
      'reputation',
      'solution',
      'solution_edit',
      'vote',
    ],
    ...overrides,
  }
}

describe('admin API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches admin users through the bounded admin route with trimmed search query params', async () => {
    mockedHttp.get.mockResolvedValueOnce({
      data: [
        buildAdminUserListRow({
          internal_override_state: true,
        }),
      ],
    })

    const result = await fetchAdminUsers({ search: '  alice  ', limit: 25 })

    expect(mockedHttp.get).toHaveBeenCalledWith('/admin-api/users/', {
      params: {
        search: 'alice',
        limit: 25,
      },
    })
    expect(result).toEqual([buildAdminUserListRow()])
    expect(result[0]).not.toHaveProperty('internal_override_state')
  })

  it('accepts empty admin search results without manufacturing fallback rows', async () => {
    mockedHttp.get.mockResolvedValueOnce({ data: [] })

    await expect(fetchAdminUsers({ search: 'missing' })).resolves.toEqual([])
  })

  it('fetches and sanitizes selected admin user detail with reputation summary and ledger fields', async () => {
    const payload = buildAdminUserDetail({
      user_role: 'admin',
      reputation_ledger: [buildReputationLedgerEntry({ note: null, actor_name: null })],
      private_permissions: ['can_delete_users'],
    })
    mockedHttp.get.mockResolvedValueOnce({ data: payload })

    const result = await fetchAdminUserDetail('11111111-1111-1111-1111-111111111111')

    expect(mockedHttp.get).toHaveBeenCalledWith('/admin-api/users/11111111-1111-1111-1111-111111111111/')
    expect(result).toEqual({
      user_id: '11111111-1111-1111-1111-111111111111',
      user_name: 'alice',
      user_email: 'alice@example.com',
      user_role: 'admin',
      user_reputation_score: 250,
      user_created_at: '2026-05-01T10:00:00Z',
      reputation: buildReputationSummary(),
      reputation_ledger: [buildReputationLedgerEntry({ note: null, actor_name: null })],
    })
    expect(result).not.toHaveProperty('private_permissions')
  })

  it('parses selected users with an empty reputation ledger', () => {
    expect(parseAdminUserDetail(buildAdminUserDetail({ reputation_ledger: [] }))).toEqual({
      ...buildAdminUserListRow(),
      reputation: buildReputationSummary(),
      reputation_ledger: [],
    })
  })

  it('parses compact selected-user activity timelines and ignores unsafe additive fields', () => {
    const payload = buildAdminUserActivityTimeline({
      items: [
        buildAdminUserActivityItem({
          raw_body: 'full private content must not reach UI',
          route: {
            kind: 'question',
            question_id: 'question-1',
            object_id: 123,
          },
        }),
      ],
      sql_debug: ['not-for-ui'],
    })

    const result = parseAdminUserActivityTimeline(payload)

    expect(result).toEqual(buildAdminUserActivityTimeline({
      items: [buildAdminUserActivityItem()],
    }))
    expect(result).not.toHaveProperty('sql_debug')
    expect(result.items[0]).not.toHaveProperty('raw_body')
    expect(result.items[0].route).not.toHaveProperty('object_id')
  })

  it('rejects malformed selected-user activity timeline payloads before UI state consumes them', () => {
    const malformedPayloads = [
      [],
      buildAdminUserActivityTimeline({ items: { results: [] } }),
      buildAdminUserActivityTimeline({ count: '1' }),
      buildAdminUserActivityTimeline({ limit: -1 }),
      buildAdminUserActivityTimeline({ available_types: ['question', 'login'] }),
      buildAdminUserActivityTimeline({ items: [buildAdminUserActivityItem({ id: '' })] }),
      buildAdminUserActivityTimeline({ items: [buildAdminUserActivityItem({ type: 'login' })] }),
      buildAdminUserActivityTimeline({ items: [buildAdminUserActivityItem({ occurred_at: 'not-a-date' })] }),
      buildAdminUserActivityTimeline({ items: [buildAdminUserActivityItem({ route: [] })] }),
    ]

    malformedPayloads.forEach((payload) => {
      expect(() => parseAdminUserActivityTimeline(payload)).toThrow(MalformedAdminApiResponseError)
    })
  })

  it('fetches selected-user activity with encoded user ID and repeated type query params', async () => {
    mockedHttp.get.mockResolvedValueOnce({ data: buildAdminUserActivityTimeline() })

    const result = await fetchAdminUserActivityTimeline({
      userId: 'user/with space',
      types: ['question', 'solution'],
      limit: 12,
    })

    expect(mockedHttp.get).toHaveBeenCalledWith(
      '/admin-api/users/user%2Fwith%20space/activity/',
      expect.objectContaining({
        params: expect.any(URLSearchParams),
      }),
    )
    const call = mockedHttp.get.mock.calls.at(-1)
    const queryParams = call?.[1]?.params as URLSearchParams
    expect(queryParams.get('limit')).toBe('12')
    expect(queryParams.getAll('type')).toEqual(['question', 'solution'])
    expect(result.items).toEqual([buildAdminUserActivityItem()])
  })

  it('propagates selected-user activity permission transport errors without masking them', async () => {
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { detail: 'You do not have permission to perform this action.' },
      },
    }
    mockedHttp.get.mockRejectedValueOnce(forbiddenError)

    await expect(fetchAdminUserActivityTimeline({
      userId: 'user-1',
      types: ['question'],
    })).rejects.toBe(forbiddenError)
  })

  it('rejects unexpected list envelopes and malformed admin user list rows', () => {
    expect(() => parseAdminUserList({ results: [buildAdminUserListRow()] })).toThrow(MalformedAdminApiResponseError)
    expect(() => parseAdminUserList([{ ...buildAdminUserListRow(), user_reputation_score: '250' }])).toThrow(
      MalformedAdminApiResponseError,
    )
  })

  it('rejects missing reputation objects and malformed ledger arrays before UI state consumes them', () => {
    expect(() => parseAdminUserDetail(buildAdminUserDetail({ reputation: undefined }))).toThrow(
      MalformedAdminApiResponseError,
    )
    expect(() => parseAdminUserDetail(buildAdminUserDetail({ reputation_ledger: { results: [] } }))).toThrow(
      MalformedAdminApiResponseError,
    )
    expect(() =>
      parseAdminUserDetail(
        buildAdminUserDetail({
          reputation_ledger: [{ ...buildReputationLedgerEntry(), amount: '25' }],
        }),
      ),
    ).toThrow(MalformedAdminApiResponseError)
  })

  it('patches a manual reputation override with encoded user ID and parses the refreshed detail', async () => {
    const refreshed = buildAdminUserDetail({
      user_id: 'user/with space',
      reputation: buildReputationSummary({
        score: 250,
        level: 'master',
        level_label: 'Мастер',
        is_manual_override: true,
        manual_level: 'master',
        next_level: null,
        next_level_label: null,
        next_level_minimum_score: null,
        points_to_next_level: 0,
      }),
      reputation_ledger: [buildReputationLedgerEntry({ amount: 0, reason: 'manual_level_override', note: 'Audit note.' })],
    })
    mockedHttp.patch.mockResolvedValueOnce({ data: refreshed })

    const result = await updateAdminUserManualOverride({
      userId: 'user/with space',
      manual_reputation_level: 'master',
      note: 'Audit note.',
    })

    expect(mockedHttp.patch).toHaveBeenCalledWith('/admin-api/users/user%2Fwith%20space/reputation-override/', {
      manual_reputation_level: 'master',
      note: 'Audit note.',
    })
    expect(result.reputation.score).toBe(250)
    expect(result.reputation.manual_level).toBe('master')
    expect(result.reputation_ledger[0]).toEqual(buildReputationLedgerEntry({
      amount: 0,
      reason: 'manual_level_override',
      note: 'Audit note.',
    }))
  })

  it('sends null when clearing a manual reputation override', async () => {
    mockedHttp.patch.mockResolvedValueOnce({ data: buildAdminUserDetail() })

    await updateAdminUserManualOverride({
      userId: 'user-1',
      manual_reputation_level: null,
      note: 'Clear override.',
    })

    expect(mockedHttp.patch).toHaveBeenCalledWith('/admin-api/users/user-1/reputation-override/', {
      manual_reputation_level: null,
      note: 'Clear override.',
    })
  })

  it('rejects malformed refreshed manual override detail before callers mutate UI state', async () => {
    mockedHttp.patch.mockResolvedValueOnce({ data: buildAdminUserDetail({ reputation_ledger: { results: [] } }) })

    await expect(updateAdminUserManualOverride({
      userId: 'user-1',
      manual_reputation_level: 'expert',
      note: 'Audit note.',
    })).rejects.toBeInstanceOf(MalformedAdminApiResponseError)
  })

  it('propagates manual override validation and permission transport errors', async () => {
    const validationError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { note: ['This field may not be blank.'] },
      },
    }
    mockedHttp.patch.mockRejectedValueOnce(validationError)

    await expect(updateAdminUserManualOverride({
      userId: 'user-1',
      manual_reputation_level: 'expert',
      note: '',
    })).rejects.toBe(validationError)
  })

  it('propagates admin permission transport errors without converting them into empty data', async () => {
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { detail: 'You do not have permission to perform this action.' },
      },
    }
    mockedHttp.get.mockRejectedValueOnce(forbiddenError)

    await expect(fetchAdminUsers()).rejects.toBe(forbiddenError)
  })

  it('fetches the admin reputation policy config through the singleton admin route', async () => {
    const payload = buildAdminReputationPolicyConfig({ internal_key: 'not-for-ui' })
    mockedHttp.get.mockResolvedValueOnce({ data: payload })

    const result = await fetchAdminReputationPolicyConfig()

    expect(mockedHttp.get).toHaveBeenCalledWith('/admin-api/reputation-policy/')
    expect(result).toEqual(buildAdminReputationPolicyConfig())
    expect(result).not.toHaveProperty('internal_key')
  })

  it('parses policy boundary values including one hour, advertised max, and null updated timestamp', () => {
    expect(parseAdminReputationPolicyConfig(buildAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 1,
      updated_at: null,
    }))).toEqual(buildAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 1,
      updated_at: null,
    }))

    expect(parseAdminReputationPolicyConfig(buildAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 168,
    }))).toEqual(buildAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 168,
    }))
  })

  it('rejects malformed reputation policy payloads before callers mutate UI state', () => {
    const malformedPayloads = [
      {},
      buildAdminReputationPolicyConfig({ protected_newcomer_window_hours: undefined }),
      buildAdminReputationPolicyConfig({ protected_newcomer_window_hours: '' }),
      buildAdminReputationPolicyConfig({ protected_newcomer_window_hours: '24' }),
      buildAdminReputationPolicyConfig({ protected_newcomer_window_hours: 1.5 }),
      buildAdminReputationPolicyConfig({ max_protected_newcomer_window_hours: undefined }),
      buildAdminReputationPolicyConfig({ max_protected_newcomer_window_hours: 0 }),
      buildAdminReputationPolicyConfig({ max_protected_newcomer_window_hours: '168' }),
      buildAdminReputationPolicyConfig({ updated_at: 1700000000 }),
    ]

    malformedPayloads.forEach((payload) => {
      expect(() => parseAdminReputationPolicyConfig(payload)).toThrow(MalformedAdminApiResponseError)
    })
  })

  it('patches only the protected newcomer window hours and parses the persisted policy config', async () => {
    mockedHttp.patch.mockResolvedValueOnce({ data: buildAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 72,
    }) })

    const result = await updateAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 72,
    })

    expect(mockedHttp.patch).toHaveBeenCalledWith('/admin-api/reputation-policy/', {
      protected_newcomer_window_hours: 72,
    })
    expect(result).toEqual(buildAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 72,
    }))
  })

  it('rejects malformed persisted reputation policy payloads after save', async () => {
    mockedHttp.patch.mockResolvedValueOnce({ data: buildAdminReputationPolicyConfig({ updated_at: { iso: 'nope' } }) })

    await expect(updateAdminReputationPolicyConfig({
      protected_newcomer_window_hours: 24,
    })).rejects.toBeInstanceOf(MalformedAdminApiResponseError)
  })

  it('propagates policy fetch and update transport errors for safe UI handling', async () => {
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { detail: 'You do not have permission to perform this action.' },
      },
    }
    const validationError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { protected_newcomer_window_hours: ['Защитное окно должно быть положительным количеством часов.'] },
      },
    }

    mockedHttp.get.mockRejectedValueOnce(forbiddenError)
    mockedHttp.patch.mockRejectedValueOnce(validationError)

    await expect(fetchAdminReputationPolicyConfig()).rejects.toBe(forbiddenError)
    await expect(updateAdminReputationPolicyConfig({ protected_newcomer_window_hours: 0 })).rejects.toBe(validationError)
  })
})
