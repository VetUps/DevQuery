import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation, useQuery } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { http } from '@/shared/api/http'
import {
  approveQuestionEdit,
  createQuestionEdit,
  disapproveQuestionEdit,
  fetchQuestionReviewQueue,
  MalformedQuestionEditResponseError,
  type CreateQuestionEditPayload,
  type QuestionEditRecord,
} from '@/features/questions/api/questionEdits'
import {
  extractQuestionEditFieldErrors,
  normalizeQuestionEditError,
  normalizeQuestionEditModerationError,
} from '@/features/questions/libs/question-edit-errors'
import { useCreateQuestionEditMutation } from '@/features/questions/mutations/useCreateQuestionEditMutation'
import { useModerateQuestionEditMutation } from '@/features/questions/mutations/useModerateQuestionEditMutation'
import {
  buildQuestionReviewQueueQueryKey,
  useQuestionReviewQueueQuery,
} from '@/features/questions/queries/useQuestionReviewQueueQuery'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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
const mockedUseMutation = vi.mocked(useMutation)
const mockedUseQuery = vi.mocked(useQuery)

function buildQuestionEditRecord(overrides: Partial<QuestionEditRecord> = {}): QuestionEditRecord {
  return {
    question_edit_id: 'edit-1',
    question: 'question-1',
    question_title: 'Original title',
    question_author_id: 'author-1',
    question_author_name: 'Author',
    user: 'proposer-1',
    edit_author_id: 'proposer-1',
    edit_author_name: 'Proposer',
    question_edit_title_before: 'Original title',
    question_edit_title_after: 'Updated title',
    question_edit_body_before: 'Original body',
    question_edit_body_after: 'Updated body',
    question_edit_tags_before: ['django', 'mysql'],
    question_edit_tags_after: ['django', 'vue'],
    question_edit_is_approved: null,
    question_edit_edited_at: '2026-05-05T12:00:00Z',
    ...overrides,
  }
}

function buildCreatePayload(overrides: Partial<CreateQuestionEditPayload> = {}): CreateQuestionEditPayload {
  return {
    question: 'question-1',
    question_edit_title_after: 'Updated title',
    question_edit_body_after: 'Updated body',
    tags: ['django', 'vue'],
    ...overrides,
  }
}

describe('question edit proposal API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('posts question edit proposals to the backend contract route with explicit replacement tags', async () => {
    const record = buildQuestionEditRecord()
    mockedHttp.post.mockResolvedValue({ data: record })

    const result = await createQuestionEdit(buildCreatePayload())

    expect(mockedHttp.post).toHaveBeenCalledWith('/question_edits/', {
      question: 'question-1',
      question_edit_title_after: 'Updated title',
      question_edit_body_after: 'Updated body',
      tags: ['django', 'vue'],
    })
    expect(result).toEqual(record)
  })

  it('fetches the author review queue and accepts an empty queue', async () => {
    mockedHttp.get.mockResolvedValue({ data: [] })

    const result = await fetchQuestionReviewQueue()

    expect(mockedHttp.get).toHaveBeenCalledWith('/question_edits/review_queue/')
    expect(result).toEqual([])
  })

  it('patches approve and reject routes and validates boolean moderation responses', async () => {
    mockedHttp.patch.mockResolvedValueOnce({ data: { approved: true } })
    mockedHttp.patch.mockResolvedValueOnce({ data: { approved: false } })

    await expect(approveQuestionEdit('edit-1')).resolves.toEqual({ approved: true })
    await expect(disapproveQuestionEdit('edit-1')).resolves.toEqual({ approved: false })

    expect(mockedHttp.patch).toHaveBeenNthCalledWith(1, '/question_edits/approve/edit-1/')
    expect(mockedHttp.patch).toHaveBeenNthCalledWith(2, '/question_edits/disapprove/edit-1/')
  })

  it('throws typed malformed-response errors for missing IDs, invalid approval state, and non-string tags', async () => {
    mockedHttp.post.mockResolvedValueOnce({ data: { ...buildQuestionEditRecord(), question_edit_id: undefined } })
    mockedHttp.get.mockResolvedValueOnce({ data: [{ ...buildQuestionEditRecord(), question_edit_is_approved: 'yes' }] })
    mockedHttp.get.mockResolvedValueOnce({ data: [{ ...buildQuestionEditRecord(), question_edit_tags_after: ['django', 42] }] })
    mockedHttp.patch.mockResolvedValueOnce({ data: { approved: 'true' } })

    await expect(createQuestionEdit(buildCreatePayload())).rejects.toBeInstanceOf(MalformedQuestionEditResponseError)
    await expect(fetchQuestionReviewQueue()).rejects.toBeInstanceOf(MalformedQuestionEditResponseError)
    await expect(fetchQuestionReviewQueue()).rejects.toBeInstanceOf(MalformedQuestionEditResponseError)
    await expect(approveQuestionEdit('edit-1')).rejects.toBeInstanceOf(MalformedQuestionEditResponseError)
  })

  it('normalizes create field errors and generic backend failures without exposing raw internals', () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          question_edit_title_after: ['Введите заголовок.'],
          question_edit_body_after: ['Введите описание.'],
          tags: ['Теги должны быть списком строк.'],
          traceback: 'internal stack trace',
        },
      },
    }

    expect(extractQuestionEditFieldErrors(error)).toEqual({
      question_edit_title_after: 'Введите заголовок.',
      question_edit_body_after: 'Введите описание.',
      tags: 'Теги должны быть списком строк.',
    })
    expect(normalizeQuestionEditError(error)).toBe('Не удалось отправить правку вопроса. Попробуйте ещё раз.')
    expect(normalizeQuestionEditError({ isAxiosError: true, response: { status: 500, data: '<html>boom</html>' } })).toBe(
      'Не удалось отправить правку вопроса. Попробуйте ещё раз.',
    )
  })

  it('normalizes moderation permission failures through public messages only', () => {
    expect(
      normalizeQuestionEditModerationError({
        isAxiosError: true,
        response: {
          status: 403,
          data: { detail: 'Вы не автор оригинального вопроса', traceback: 'secret stack' },
        },
      }),
    ).toBe('Вы не автор оригинального вопроса')

    expect(normalizeQuestionEditModerationError(new Error('network failed'))).toBe(
      'Не удалось обновить статус правки вопроса. Попробуйте ещё раз.',
    )
  })

  it('exports deterministic review queue query keys and query options', () => {
    useQuestionReviewQueueQuery(false)

    expect(buildQuestionReviewQueueQueryKey()).toEqual(['question-edits', 'review-queue'])
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: buildQuestionReviewQueueQueryKey(),
        queryFn: fetchQuestionReviewQueue,
      }),
    )
  })

  it('invalidates targeted question and review queue caches after create and moderation success', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    useCreateQuestionEditMutation()
    const createOptions = mockedUseMutation.mock.calls.at(-1)?.[0] as any
    await createOptions.onSuccess(buildQuestionEditRecord(), buildCreatePayload())

    useModerateQuestionEditMutation()
    const moderateOptions = mockedUseMutation.mock.calls.at(-1)?.[0] as any
    await moderateOptions.onSuccess({ approved: true }, { questionEditId: 'edit-1', questionId: 'question-1', approve: true })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['questions', 'detail', 'question-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['questions', 'list'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: buildQuestionReviewQueueQueryKey() })

    invalidateSpy.mockRestore()
  })
})
