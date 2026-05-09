import { useMutation } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/app/query-client'
import {
  MalformedDraftAssistantResponseError,
  QUESTION_DRAFT_ASSISTANT_REQUEST_TIMEOUT_MS,
  parseQuestionDraftAssistantResponse,
  requestQuestionDraftAssist,
  type DraftAssistantResponse,
} from '@/features/questions/api/questionDraftAssistant'
import { useQuestionDraftAssistantMutation } from '@/features/questions/mutations/useQuestionDraftAssistantMutation'
import { http } from '@/shared/api/http'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()

  return {
    ...actual,
    useMutation: vi.fn((options) => options),
  }
})

const mockedHttp = vi.mocked(http)
const mockedUseMutation = vi.mocked(useMutation)

function buildAssistantResponse(overrides: Partial<DraftAssistantResponse> = {}): DraftAssistantResponse {
  return {
    status: 'ok',
    mode: 'create',
    summary: 'Draft is clear but could use a narrower title.',
    findings: [
      {
        code: 'title_too_broad',
        message: 'Make the title more specific.',
        severity: 'warning',
        field: 'question_title',
      },
    ],
    suggested_title: 'How do Vue Query mutations expose pending state?',
    suggested_body: null,
    suggested_tags: ['vue', 'tanstack-query'],
    warnings: [],
    ...overrides,
  }
}

describe('question draft assistant API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('posts explicit draft payloads to the draft-assist route and parses the success DTO', async () => {
    const response = buildAssistantResponse()
    mockedHttp.post.mockResolvedValue({ data: response })

    const result = await requestQuestionDraftAssist({
      question_title: 'How do mutations work?',
      question_body: 'I need to expose loading and error states.',
      tags: ['vue'],
      mode: 'create',
    })

    expect(mockedHttp.post).toHaveBeenCalledWith('/question/draft-assist/', {
      question_title: 'How do mutations work?',
      question_body: 'I need to expose loading and error states.',
      tags: ['vue'],
      mode: 'create',
    }, {
      timeout: QUESTION_DRAFT_ASSISTANT_REQUEST_TIMEOUT_MS,
    })
    expect(result).toEqual(response)
  })

  it('treats assistant_unavailable as a parsed domain result rather than an exception', async () => {
    const unavailable = buildAssistantResponse({
      status: 'assistant_unavailable',
      mode: 'edit',
      summary: '',
      findings: [],
      suggested_title: null,
      suggested_body: null,
      suggested_tags: [],
      warnings: [{ code: 'provider_timeout', message: 'Помощник не успел ответить. Попробуйте позже.' }],
    })
    mockedHttp.post.mockResolvedValue({ data: unavailable })

    await expect(
      requestQuestionDraftAssist({
        question_title: 'Existing question',
        question_body: 'Existing body',
        tags: [],
        mode: 'edit',
      }),
    ).resolves.toEqual(unavailable)
  })

  it('rejects malformed response shapes before callers consume invalid DTO data', async () => {
    mockedHttp.post.mockResolvedValueOnce({ data: { ...buildAssistantResponse(), status: 'degraded' } })
    mockedHttp.post.mockResolvedValueOnce({ data: { ...buildAssistantResponse(), mode: 'revise' } })
    mockedHttp.post.mockResolvedValueOnce({ data: { ...buildAssistantResponse(), findings: 'none' } })
    mockedHttp.post.mockResolvedValueOnce({
      data: { ...buildAssistantResponse(), findings: [{ code: 'x', message: 'x', severity: 'critical', field: null }] },
    })
    mockedHttp.post.mockResolvedValueOnce({ data: { ...buildAssistantResponse(), warnings: [{ code: 'x', message: 42 }] } })
    mockedHttp.post.mockResolvedValueOnce({ data: { ...buildAssistantResponse(), suggested_tags: ['vue', 42] } })

    const payload = {
      question_title: 'How do DTO guards work?',
      question_body: 'I need strict parser errors.',
      tags: [],
      mode: 'create' as const,
    }

    await expect(requestQuestionDraftAssist(payload)).rejects.toBeInstanceOf(MalformedDraftAssistantResponseError)
    await expect(requestQuestionDraftAssist(payload)).rejects.toBeInstanceOf(MalformedDraftAssistantResponseError)
    await expect(requestQuestionDraftAssist(payload)).rejects.toBeInstanceOf(MalformedDraftAssistantResponseError)
    await expect(requestQuestionDraftAssist(payload)).rejects.toBeInstanceOf(MalformedDraftAssistantResponseError)
    await expect(requestQuestionDraftAssist(payload)).rejects.toBeInstanceOf(MalformedDraftAssistantResponseError)
    await expect(requestQuestionDraftAssist(payload)).rejects.toBeInstanceOf(MalformedDraftAssistantResponseError)
  })

  it('omits unsafe additive provider fields from parsed results', () => {
    const parsed = parseQuestionDraftAssistantResponse({
      ...buildAssistantResponse(),
      raw_provider_envelope: { token: 'secret' },
      authorization: 'Bearer secret',
      findings: [
        {
          code: 'body_missing_context',
          message: 'Add a reproduction step.',
          severity: 'info',
          field: null,
          prompt_fragment: 'hidden prompt',
        },
      ],
      warnings: [{ code: 'too_many_suggested_tags', message: 'Лишние теги пропущены.', internal: true }],
    })

    expect(parsed).toEqual({
      status: 'ok',
      mode: 'create',
      summary: 'Draft is clear but could use a narrower title.',
      findings: [
        {
          code: 'body_missing_context',
          message: 'Add a reproduction step.',
          severity: 'info',
          field: null,
        },
      ],
      suggested_title: 'How do Vue Query mutations expose pending state?',
      suggested_body: null,
      suggested_tags: ['vue', 'tanstack-query'],
      warnings: [{ code: 'too_many_suggested_tags', message: 'Лишние теги пропущены.' }],
    })
  })

  it('accepts empty findings, warnings, and suggested tags as valid boundary conditions', () => {
    expect(
      parseQuestionDraftAssistantResponse(
        buildAssistantResponse({
          findings: [],
          suggested_tags: [],
          warnings: [],
        }),
      ),
    ).toEqual(
      buildAssistantResponse({
        findings: [],
        suggested_tags: [],
        warnings: [],
      }),
    )
  })

  it('propagates transport failures and never calls question create or update endpoints', async () => {
    const transportError = new Error('network failed')
    mockedHttp.post.mockRejectedValue(transportError)

    await expect(
      requestQuestionDraftAssist({
        question_title: 'How do transport errors surface?',
        question_body: 'The mutation should reject without changing form state.',
        tags: [],
        mode: 'create',
      }),
    ).rejects.toBe(transportError)

    expect(mockedHttp.post).toHaveBeenCalledTimes(1)
    expect(mockedHttp.post).not.toHaveBeenCalledWith('/question/', expect.anything())
    expect(mockedHttp.patch).not.toHaveBeenCalled()
  })

  it('exposes a read-only Vue Query mutation without invalidating question caches', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    useQuestionDraftAssistantMutation()
    const options = mockedUseMutation.mock.calls.at(-1)?.[0]

    expect(options).toEqual(
      expect.objectContaining({
        mutationFn: requestQuestionDraftAssist,
      }),
    )
    expect(options).not.toHaveProperty('onSuccess')

    mockedHttp.post.mockResolvedValue({ data: buildAssistantResponse() })

    await expect(options?.mutationFn({
      question_title: 'How do assistant mutations stay read-only?',
      question_body: 'They should not invalidate question list or detail caches.',
      tags: [],
      mode: 'create',
    })).resolves.toEqual(buildAssistantResponse())
    expect(invalidateSpy).not.toHaveBeenCalled()

    invalidateSpy.mockRestore()
  })
})
