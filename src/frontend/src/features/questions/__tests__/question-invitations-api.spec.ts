import { computed, ref } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/query-client'
import { http } from '@/shared/api/http'
import {
  createExpertInvitations,
  fetchEligibleExperts,
  MalformedExpertInvitationResponseError,
  normalizeExpertInvitationError,
  parseEligibleExpertsEnvelope,
  parseExpertInvitationCreateResponse,
  type EligibleExpertsEnvelope,
  type ExpertInvitationCreateResponse,
} from '@/features/questions/api/questionExpertInvitations'
import { useCreateExpertInvitationsMutation } from '@/features/questions/mutations/useCreateExpertInvitationsMutation'
import {
  buildEligibleExpertsBaseQueryKey,
  buildEligibleExpertsQueryKey,
  useEligibleExpertsQuery,
} from '@/features/questions/queries/useEligibleExpertsQuery'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@tanstack/vue-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/vue-query')>('@tanstack/vue-query')

  return {
    ...actual,
    useMutation: vi.fn((options) => options),
    useQuery: vi.fn((options) => options),
  }
})

const mockedHttp = vi.mocked(http)
const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

const QUESTION_ID = '11111111-1111-4111-8111-111111111111'
const EXPERT_ID = '22222222-2222-4222-8222-222222222222'
const MASTER_ID = '33333333-3333-4333-8333-333333333333'
const NOTIFICATION_ID = '44444444-4444-4444-8444-444444444444'

function buildEligibleEnvelope(overrides: Partial<EligibleExpertsEnvelope> = {}): EligibleExpertsEnvelope {
  return {
    count: 2,
    next: 'https://api.example.test/question/11111111-1111-4111-8111-111111111111/eligible-experts/?page=2',
    previous: null,
    results: [
      {
        user_id: EXPERT_ID,
        user_name: 'Expert Alice',
        user_reputation_score: 450,
        reputation_level: 'expert',
        reputation_level_label: 'Эксперт',
        is_manual_override: false,
      },
      {
        user_id: MASTER_ID,
        user_name: 'Master Bob',
        user_reputation_score: 1200,
        reputation_level: 'master',
        reputation_level_label: 'Мастер',
        is_manual_override: true,
      },
    ],
    question_id: QUESTION_ID,
    max_invites: 5,
    invited_count: 1,
    remaining_slots: 4,
    can_invite: true,
    reason_code: 'invites_available',
    ...overrides,
  }
}

function buildCreateResponse(overrides: Partial<ExpertInvitationCreateResponse> = {}): ExpertInvitationCreateResponse {
  return {
    question_id: QUESTION_ID,
    max_invites: 5,
    invited_count: 2,
    remaining_slots: 3,
    created_count: 1,
    invitations: [
      {
        recipient_id: EXPERT_ID,
        notification_id: NOTIFICATION_ID,
        dedupe_key: `${QUESTION_ID}:${EXPERT_ID}`,
        expires_at: '2026-05-08T12:00:00Z',
        payload: {
          question_id: QUESTION_ID,
          recipient_id: EXPERT_ID,
        },
      },
    ],
    ...overrides,
  }
}

describe('question expert invitations API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('fetches eligible experts from the protected-question action route with trimmed optional search', async () => {
    const envelope = buildEligibleEnvelope()
    mockedHttp.get.mockResolvedValue({ data: envelope })

    await expect(fetchEligibleExperts(QUESTION_ID, { search: '  alice  ' })).resolves.toEqual(envelope)

    expect(mockedHttp.get).toHaveBeenCalledWith(`/question/${QUESTION_ID}/eligible-experts/`, {
      params: { search: 'alice' },
    })
  })

  it('omits blank search params so selector remounts do not fetch broad per-candidate requests', async () => {
    mockedHttp.get.mockResolvedValue({ data: buildEligibleEnvelope({ results: [], count: 0 }) })

    await fetchEligibleExperts(QUESTION_ID, { search: '   ' })

    expect(mockedHttp.get).toHaveBeenCalledWith(`/question/${QUESTION_ID}/eligible-experts/`, undefined)
  })

  it('posts recipient ids unchanged and lets the backend author/protected/duplicate policy decide', async () => {
    const response = buildCreateResponse()
    mockedHttp.post.mockResolvedValue({ data: response })

    await expect(createExpertInvitations(QUESTION_ID, [EXPERT_ID, EXPERT_ID])).resolves.toEqual(response)

    expect(mockedHttp.post).toHaveBeenCalledWith(`/question/${QUESTION_ID}/expert-invitations/`, {
      recipient_ids: [EXPERT_ID, EXPERT_ID],
    })
  })

  it('parses successful eligible-expert envelopes and empty slot states', () => {
    expect(parseEligibleExpertsEnvelope(buildEligibleEnvelope()).results).toHaveLength(2)

    expect(
      parseEligibleExpertsEnvelope(
        buildEligibleEnvelope({
          count: 0,
          next: null,
          previous: null,
          results: [],
          invited_count: 5,
          remaining_slots: 0,
          can_invite: false,
          reason_code: 'slots_exhausted',
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        count: 0,
        results: [],
        remaining_slots: 0,
        can_invite: false,
        reason_code: 'slots_exhausted',
      }),
    )
  })

  it('parses create responses with server-confirmed invitation rows only', () => {
    expect(parseExpertInvitationCreateResponse(buildCreateResponse())).toEqual(buildCreateResponse())
    expect(parseExpertInvitationCreateResponse(buildCreateResponse({ created_count: 0, invitations: [] })).invitations).toEqual([])
  })

  it('throws named malformed-response errors for missing results, invalid slots, ids, dates, and payloads', () => {
    const malformedValues = [
      { ...buildEligibleEnvelope(), results: undefined },
      { ...buildEligibleEnvelope(), remaining_slots: '4' },
      { ...buildEligibleEnvelope(), question_id: 'not-a-uuid' },
      { ...buildEligibleEnvelope(), results: [{ ...buildEligibleEnvelope().results[0], user_name: '' }] },
      buildCreateResponse({ invitations: [{ ...buildCreateResponse().invitations[0], expires_at: 'not-a-date' }] }),
      buildCreateResponse({ invitations: [{ ...buildCreateResponse().invitations[0], payload: [] as unknown as Record<string, unknown> }] }),
    ]

    for (const value of malformedValues) {
      const parser = 'created_count' in value ? parseExpertInvitationCreateResponse : parseEligibleExpertsEnvelope

      expect(() => parser(value)).toThrow(MalformedExpertInvitationResponseError)
    }
  })

  it('propagates GET and POST transport failures without converting them into raw rendered objects', async () => {
    const getError = { isAxiosError: true, response: { status: 500, data: { traceback: 'secret stack' } } }
    const postError = new Error('timeout of 10000ms exceeded')
    mockedHttp.get.mockRejectedValueOnce(getError)
    mockedHttp.post.mockRejectedValueOnce(postError)

    await expect(fetchEligibleExperts(QUESTION_ID)).rejects.toBe(getError)
    await expect(createExpertInvitations(QUESTION_ID, [EXPERT_ID])).rejects.toBe(postError)
    expect(normalizeExpertInvitationError(getError)).toBe('Не удалось обновить приглашения экспертов. Попробуйте ещё раз.')
    expect(normalizeExpertInvitationError(postError)).toBe('Не удалось обновить приглашения экспертов. Попробуйте ещё раз.')
  })

  it('keeps malformed parser messages actionable and secret-safe', () => {
    const error = new MalformedExpertInvitationResponseError('Malformed expert invitation response: results.user_id')

    expect(normalizeExpertInvitationError(error)).toBe('Malformed expert invitation response: results.user_id')
    expect(normalizeExpertInvitationError({ traceback: 'secret stack', detail: '<html>boom</html>' })).not.toContain('secret')
  })

  it('exports deterministic query keys and disables queries until the caller enables a real question id', async () => {
    const questionId = ref(` ${QUESTION_ID} `)
    const search = ref('  Expert  ')
    const queryOptions = useEligibleExpertsQuery(questionId, search, false)

    expect(buildEligibleExpertsBaseQueryKey(QUESTION_ID)).toEqual(['questions', 'eligible-experts', QUESTION_ID])
    expect(buildEligibleExpertsQueryKey(QUESTION_ID, '  Expert  ')).toEqual([
      'questions',
      'eligible-experts',
      QUESTION_ID,
      'Expert',
    ])
    expect(mockedUseQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryOptions.queryKey }))
    expect(queryOptions.queryKey.value).toEqual(['questions', 'eligible-experts', QUESTION_ID, 'Expert'])
    expect(queryOptions.enabled.value).toBe(false)

    const enabledOptions = useEligibleExpertsQuery(questionId, computed(() => ' Bob '), true)
    mockedHttp.get.mockResolvedValue({ data: buildEligibleEnvelope() })

    expect(enabledOptions.enabled.value).toBe(true)
    await enabledOptions.queryFn()

    expect(mockedHttp.get).toHaveBeenLastCalledWith(`/question/${QUESTION_ID}/eligible-experts/`, {
      params: { search: 'Bob' },
    })
  })

  it('invalidates relevant eligible-experts cache keys only after mutation success', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    useCreateExpertInvitationsMutation()
    const mutationOptions = mockedUseMutation.mock.calls.at(-1)?.[0] as any

    expect(mutationOptions.mutationFn).toBeTypeOf('function')
    expect(invalidateSpy).not.toHaveBeenCalled()

    await mutationOptions.onSuccess(buildCreateResponse(), { questionId: QUESTION_ID, recipientIds: [EXPERT_ID] })

    expect(invalidateSpy).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: buildEligibleExpertsBaseQueryKey(QUESTION_ID) })

    invalidateSpy.mockRestore()
  })
})
