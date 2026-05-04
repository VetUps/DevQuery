import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchQuestionList,
  type CreateQuestionResponse,
  type QuestionDetail,
  type QuestionListItem,
  type QuestionTag,
} from '@/features/questions/api/questions'
import { useQuestionListQuery } from '@/features/questions/queries/useQuestionListQuery'
import { http } from '@/shared/api/http'

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()

  return {
    ...actual,
    useQuery: vi.fn((options) => options),
  }
})

describe('tag-aware question discovery API boundary', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear()
    vi.restoreAllMocks()
  })

  it('omits repeated tag params when no normalized tags are provided', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await fetchQuestionList({ page: 2, search: ' vue ', ordering: 'question_created_at', tags: [] })

    expect(getSpy).toHaveBeenCalledWith('/question/', {
      params: {
        page: 2,
        search: ' vue ',
        ordering: 'question_created_at',
        tag: undefined,
      },
      paramsSerializer: {
        indexes: null,
      },
    })
  })

  it('passes multiple normalized tags as an array for repeated query serialization', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await fetchQuestionList({ page: 1, tags: ['django', 'vue'] })

    expect(getSpy).toHaveBeenCalledWith('/question/', {
      params: {
        page: 1,
        search: undefined,
        ordering: undefined,
        tag: ['django', 'vue'],
      },
      paramsSerializer: {
        indexes: null,
      },
    })
  })

  it('normalizes blank, duplicate, whitespace, and case-varied route tags into a stable query key', () => {
    const params = ref({
      page: 0,
      search: '  cache keys  ',
      ordering: undefined,
      tags: [' Vue ', '', 'vue', '  DRF', 'drf ', '   '],
    })

    const queryOptions = useQuestionListQuery(params)

    expect(queryOptions.queryKey.value).toEqual([
      'questions',
      'list',
      {
        page: 1,
        search: 'cache keys',
        ordering: '-question_created_at',
        tags: ['vue', 'drf'],
      },
    ])

    params.value = {
      page: 3,
      search: '',
      ordering: 'question_created_at',
      tags: [' Django ', 'django'],
    }

    expect(queryOptions.queryKey.value).toEqual([
      'questions',
      'list',
      {
        page: 3,
        search: '',
        ordering: 'question_created_at',
        tags: ['django'],
      },
    ])
  })

  it('uses one list request per normalized query state without dropping search, ordering, or page', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })
    const params = computed(() => ({
      page: 4,
      search: '  composables  ',
      ordering: 'question_created_at' as const,
      tags: [' Vue ', 'vue', 'Django'],
    }))
    const queryOptions = useQuestionListQuery(params)

    await queryOptions.queryFn()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/question/', {
      params: {
        page: 4,
        search: 'composables',
        ordering: 'question_created_at',
        tag: ['vue', 'django'],
      },
      paramsSerializer: {
        indexes: null,
      },
    })
  })

  it('preserves list fetch failures for the existing Vue Query retry UI', async () => {
    const error = new Error('network lost')
    vi.spyOn(http, 'get').mockRejectedValue(error)

    await expect(fetchQuestionList({ page: 1, tags: ['vue'] })).rejects.toThrow('network lost')
  })

  it('models public question tag chips without exposing raw tag ids', () => {
    const tags: QuestionTag[] = [{ name: 'vue', questions_count: 9 }]
    const listItem: QuestionListItem = {
      question_id: 'q-1',
      user: 'ada',
      question_title: 'How should discovery tags render?',
      question_status: 'open',
      question_created_at: '2026-01-01T00:00:00Z',
      question_updated_at: '2026-01-01T00:00:00Z',
      tags,
    }
    const detail: QuestionDetail = {
      ...listItem,
      question_body: 'Tags should use names and counts only.',
      upvotes: 0,
      downvotes: 0,
      score: 0,
      user_vote: null,
    }
    const created: CreateQuestionResponse = {
      ...listItem,
      question_body: 'Created questions return public tag chips.',
    }

    expect(listItem.tags[0]).toEqual({ name: 'vue', questions_count: 9 })
    expect(detail.tags[0]).not.toHaveProperty('id')
    expect(created.tags[0]).not.toHaveProperty('tag_id')
  })
})
