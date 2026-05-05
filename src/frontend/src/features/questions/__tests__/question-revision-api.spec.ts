import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useQuery } from '@tanstack/vue-query'

import { http } from '@/shared/api/http'
import {
  fetchQuestionRevisions,
  MalformedQuestionRevisionResponseError,
  normalizeQuestionRevisionError,
  type QuestionRevisionListResponse,
  type QuestionRevisionRecord,
} from '@/features/questions/api/questionRevisions'
import {
  buildQuestionRevisionsQueryKey,
  normalizeQuestionRevisionQueryId,
  useQuestionRevisionsQuery,
} from '@/features/questions/queries/useQuestionRevisionsQuery'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
  },
}))

vi.mock('@tanstack/vue-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/vue-query')>('@tanstack/vue-query')

  return {
    ...actual,
    useQuery: vi.fn((options) => options),
  }
})

const mockedHttp = vi.mocked(http)
const mockedUseQuery = vi.mocked(useQuery)

function buildQuestionRevisionRecord(overrides: Partial<QuestionRevisionRecord> = {}): QuestionRevisionRecord {
  return {
    question_revision_id: 'revision-1',
    question: 'question-1',
    actor: 'author-1',
    actor_name: 'Author',
    source: 'direct_edit',
    question_edit: null,
    title_before: 'Original title',
    title_after: 'Updated title',
    body_before: 'Original body',
    body_after: 'Updated body',
    tags_before: ['django', 'mysql'],
    tags_after: ['django', 'vue'],
    created_at: '2026-05-05T12:00:00Z',
    ...overrides,
  }
}

function buildQuestionRevisionListResponse(
  overrides: Partial<QuestionRevisionListResponse> = {},
): QuestionRevisionListResponse {
  return {
    count: 1,
    next: null,
    previous: null,
    results: [buildQuestionRevisionRecord()],
    ...overrides,
  }
}

function buildRootQuestionRevisionRecord(overrides: Record<string, unknown> = {}) {
  return {
    revision_id: 'revision-1',
    question: 'question-1',
    actor: 'author-1',
    actor_name: 'Author',
    source: 'direct_edit',
    proposal: null,
    title_before: 'Original title',
    title_after: 'Updated title',
    body_before: 'Original body',
    body_after: 'Updated body',
    tags_before: ['django', 'mysql'],
    tags_after: ['django', 'vue'],
    tags: [
      { name: 'django', questions_count: 3 },
      { name: 'vue', questions_count: 2 },
    ],
    created_at: '2026-05-05T12:00:00Z',
    ...overrides,
  }
}

describe('question revision API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches question revision history from the root backend revisions route', async () => {
    const response = buildQuestionRevisionListResponse()
    mockedHttp.get.mockResolvedValue({ data: response })

    const result = await fetchQuestionRevisions('question-1')

    expect(mockedHttp.get).toHaveBeenCalledWith('/question/revisions/question-1/')
    expect(result).toEqual(response)
  })

  it('accepts an empty paginated revision history response', async () => {
    const response = buildQuestionRevisionListResponse({ count: 0, results: [] })
    mockedHttp.get.mockResolvedValue({ data: response })

    await expect(fetchQuestionRevisions('question-1')).resolves.toEqual(response)
  })

  it('normalizes the root backend list payload and field aliases', async () => {
    mockedHttp.get.mockResolvedValue({
      data: [buildRootQuestionRevisionRecord({ source: 'approved_proposal', proposal: 'question-edit-1' })],
    })

    await expect(fetchQuestionRevisions('question-1')).resolves.toEqual({
      count: 1,
      next: null,
      previous: null,
      results: [
        buildQuestionRevisionRecord({
          source: 'approved_proposal',
          question_edit: 'question-edit-1',
        }),
      ],
    })
  })

  it('throws typed malformed-response errors for malformed list and record payloads', async () => {
    mockedHttp.get.mockResolvedValueOnce({ data: { results: [] } })
    mockedHttp.get.mockResolvedValueOnce({ data: { ...buildQuestionRevisionListResponse(), count: '1' } })
    mockedHttp.get.mockResolvedValueOnce({
      data: buildQuestionRevisionListResponse({
        results: [buildQuestionRevisionRecord({ question_revision_id: '' })],
      }),
    })
    mockedHttp.get.mockResolvedValueOnce({
      data: buildQuestionRevisionListResponse({
        results: [buildQuestionRevisionRecord({ tags_after: ['django', 42] as unknown as string[] })],
      }),
    })

    await expect(fetchQuestionRevisions('question-1')).rejects.toBeInstanceOf(MalformedQuestionRevisionResponseError)
    await expect(fetchQuestionRevisions('question-1')).rejects.toBeInstanceOf(MalformedQuestionRevisionResponseError)
    await expect(fetchQuestionRevisions('question-1')).rejects.toBeInstanceOf(MalformedQuestionRevisionResponseError)
    await expect(fetchQuestionRevisions('question-1')).rejects.toBeInstanceOf(MalformedQuestionRevisionResponseError)
  })

  it('preserves backend-shaped proposal_approval sources for UI label compatibility checks', async () => {
    const response = buildQuestionRevisionListResponse({
      results: [
        buildQuestionRevisionRecord({
          source: 'proposal_approval',
          question_edit: 'question-edit-1',
        }),
      ],
    })
    mockedHttp.get.mockResolvedValue({ data: response })

    const result = await fetchQuestionRevisions('question-1')

    expect(result.results[0]).toMatchObject({
      source: 'proposal_approval',
      question_edit: 'question-edit-1',
    })
  })

  it('preserves unknown future revision sources for safe UI fallback rendering', async () => {
    const response = buildQuestionRevisionListResponse({
      results: [buildQuestionRevisionRecord({ source: 'bulk_import' })],
    })
    mockedHttp.get.mockResolvedValue({ data: response })

    const result = await fetchQuestionRevisions('question-1')

    expect(result.results[0].source).toBe('bulk_import')
  })

  it('returns public-field-only revision records and drops unexpected backend internals', async () => {
    mockedHttp.get.mockResolvedValue({
      data: buildQuestionRevisionListResponse({
        results: [
          {
            ...buildQuestionRevisionRecord(),
            user_email: 'author@example.com',
            password: 'secret',
          },
        ],
      }),
    })

    const result = await fetchQuestionRevisions('question-1')

    expect(result.results[0]).toEqual(buildQuestionRevisionRecord())
    expect(result.results[0]).not.toHaveProperty('user_email')
    expect(result.results[0]).not.toHaveProperty('password')
  })

  it('exports deterministic normalized query keys and query options', () => {
    useQuestionRevisionsQuery(' question-1 ')

    expect(normalizeQuestionRevisionQueryId(' question-1 ')).toBe('question-1')
    expect(buildQuestionRevisionsQueryKey(' question-1 ')).toEqual(['questions', 'detail', 'question-1', 'revisions'])
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryFn: expect.any(Function),
      }),
    )
  })

  it('normalizes missing, malformed, and generic failures into UI-safe messages', () => {
    expect(
      normalizeQuestionRevisionError({
        isAxiosError: true,
        response: {
          status: 404,
          data: { detail: 'DoesNotExist stack details' },
        },
      }),
    ).toBe('Вопрос не найден или история правок недоступна.')

    expect(normalizeQuestionRevisionError(new MalformedQuestionRevisionResponseError('raw parser detail'))).toBe(
      'История правок временно недоступна из-за неожиданного ответа сервера.',
    )
    expect(normalizeQuestionRevisionError(new Error('network failed'))).toBe(
      'Не удалось загрузить историю правок вопроса. Попробуйте ещё раз.',
    )
  })
})
