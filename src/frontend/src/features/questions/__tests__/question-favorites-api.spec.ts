import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addQuestionFavorite,
  fetchFavoriteQuestionList,
  fetchQuestionDetail,
  fetchQuestionList,
  normalizeQuestionFavoriteMutationResponse,
  removeQuestionFavorite,
  type QuestionListParams,
} from '@/features/questions/api/questions'
import { useFavoriteQuestionListQuery } from '@/features/questions/queries/useFavoriteQuestionListQuery'
import { http } from '@/shared/api/http'

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()

  return {
    ...actual,
    useQuery: vi.fn((options) => options),
  }
})

describe('question favorites API boundary', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear()
    vi.restoreAllMocks()
  })

  it('calls the owner-only favorite list endpoint with trimmed search, ordering, page, and repeated normalized tags', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await fetchFavoriteQuestionList({
      page: 2,
      search: '  cache keys  ',
      ordering: 'question_created_at',
      tags: [' Vue ', '', 'vue', 'DJANGO'],
    })

    expect(getSpy).toHaveBeenCalledWith('/question/favorites/', {
      params: {
        page: 2,
        search: 'cache keys',
        ordering: 'question_created_at',
        tag: ['vue', 'django'],
      },
      paramsSerializer: {
        indexes: null,
      },
    })
    expect(http.getUri({ url: '/question/favorites/', ...(getSpy.mock.calls[0][1] ?? {}) })).toContain(
      '/question/favorites/?page=2&search=cache+keys&ordering=question_created_at&tag=vue&tag=django',
    )
  })

  it('omits blank search and tag params for favorite list requests after normalization', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await fetchFavoriteQuestionList({ page: 1, search: '   ', tags: ['', '   '] })

    expect(getSpy).toHaveBeenCalledWith('/question/favorites/', {
      params: {
        page: 1,
        search: undefined,
        ordering: undefined,
        tag: undefined,
      },
      paramsSerializer: {
        indexes: null,
      },
    })
  })

  it('normalizes favorite list payload results and safe-falls back for malformed result arrays', async () => {
    const getSpy = vi.spyOn(http, 'get')
      .mockResolvedValueOnce({
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              question_id: 'favorite-question',
              user: 'user-1',
              question_title: 'Normalized favorite fields',
              question_status: 'open',
              question_created_at: '2026-04-01T12:00:00Z',
              question_updated_at: '2026-04-01T12:30:00Z',
              favorites_count: 5,
              is_favorited: true,
              tags: [{ name: 'vue', questions_count: 2 }],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          count: 1,
          next: null,
          previous: null,
          results: { malformed: true },
        },
      })

    await expect(fetchFavoriteQuestionList({ page: 1 })).resolves.toMatchObject({
      count: 1,
      results: [
        {
          question_id: 'favorite-question',
          favorites_count: 5,
          is_favorited: true,
          tags: [{ name: 'vue', questions_count: 2 }],
        },
      ],
    })
    await expect(fetchFavoriteQuestionList({ page: 1 })).resolves.toMatchObject({
      count: 1,
      results: [],
    })
    expect(getSpy).toHaveBeenCalledTimes(2)
  })

  it('normalizes malformed favorite fields in favorite list payloads to safe defaults', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            question_id: 'question-missing-favorites',
            user: 'user-1',
            question_title: 'Missing favorite fields',
            question_status: 'open',
            question_created_at: '2026-04-01T12:00:00Z',
            question_updated_at: '2026-04-01T12:30:00Z',
            tags: [],
          },
          {
            question_id: 'question-malformed-favorites',
            user: 'user-2',
            question_title: 'Malformed favorite fields',
            question_status: 'open',
            question_created_at: '2026-04-02T12:00:00Z',
            question_updated_at: '2026-04-02T12:30:00Z',
            favorites_count: '3',
            is_favorited: 'true',
            tags: [],
          },
        ],
      },
    })

    const page = await fetchFavoriteQuestionList({ page: 1 })

    expect(page.results[0]).toMatchObject({
      question_id: 'question-missing-favorites',
      favorites_count: 0,
      is_favorited: false,
    })
    expect(page.results[1]).toMatchObject({
      question_id: 'question-malformed-favorites',
      favorites_count: 0,
      is_favorited: false,
    })
  })

  it('keeps favorite query keys compatible with questions list invalidation while discriminating normalized favorites params', () => {
    const params = ref({
      page: 0,
      search: '  Cache Keys  ',
      ordering: 'invalid-order' as QuestionListParams['ordering'],
      tags: [' Vue ', '', 'vue', '  DRF', 'drf ', '   '],
    })

    const queryOptions = useFavoriteQuestionListQuery(params)

    expect(queryOptions.queryKey.value).toEqual([
      'questions',
      'list',
      'favorites',
      {
        page: 1,
        search: 'Cache Keys',
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
      'favorites',
      {
        page: 3,
        search: '',
        ordering: 'question_created_at',
        tags: ['django'],
      },
    ])
  })

  it('uses one favorite list request per normalized query state without dropping compatible filters', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })
    const params = computed(() => ({
      page: 4,
      search: '  composables  ',
      ordering: 'question_created_at' as const,
      tags: [' Vue ', 'vue', 'Django'],
    }))
    const queryOptions = useFavoriteQuestionListQuery(params)

    await queryOptions.queryFn()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/question/favorites/', {
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

  it('preserves favorite list request failures for TanStack Query retry and error UI paths', async () => {
    const error = new Error('network lost')
    vi.spyOn(http, 'get').mockRejectedValue(error)

    await expect(fetchFavoriteQuestionList({ page: 1, tags: ['vue'] })).rejects.toThrow('network lost')
  })

  it('normalizes missing or malformed favorite fields in public list payloads to safe defaults', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            question_id: 'question-missing-favorites',
            user: 'user-1',
            question_title: 'Missing favorite fields',
            question_status: 'open',
            question_created_at: '2026-04-01T12:00:00Z',
            question_updated_at: '2026-04-01T12:30:00Z',
            tags: [],
          },
          {
            question_id: 'question-malformed-favorites',
            user: 'user-2',
            question_title: 'Malformed favorite fields',
            question_status: 'open',
            question_created_at: '2026-04-02T12:00:00Z',
            question_updated_at: '2026-04-02T12:30:00Z',
            favorites_count: '3',
            is_favorited: 'true',
            tags: [],
          },
        ],
      },
    })

    const page = await fetchQuestionList({ page: 1 })

    expect(page.results[0]).toMatchObject({
      question_id: 'question-missing-favorites',
      favorites_count: 0,
      is_favorited: false,
    })
    expect(page.results[1]).toMatchObject({
      question_id: 'question-malformed-favorites',
      favorites_count: 0,
      is_favorited: false,
    })
  })

  it('normalizes missing favorite fields in detail payloads through the inherited list item shape', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        question_id: 'question-detail',
        user: 'user-1',
        question_title: 'Detail favorite defaults',
        question_body: 'Body',
        question_status: 'open',
        question_created_at: '2026-04-01T12:00:00Z',
        question_updated_at: '2026-04-01T12:30:00Z',
        upvotes: 0,
        downvotes: 0,
        score: 0,
        user_vote: null,
        tags: [],
      },
    })

    await expect(fetchQuestionDetail('question-detail')).resolves.toMatchObject({
      question_id: 'question-detail',
      favorites_count: 0,
      is_favorited: false,
    })
  })

  it('calls the favorite add and remove endpoints and returns normalized server truth', async () => {
    const postSpy = vi.spyOn(http, 'post').mockResolvedValue({
      data: {
        question_id: 'question-1',
        favorites_count: 4,
        is_favorited: true,
      },
    })
    const deleteSpy = vi.spyOn(http, 'delete').mockResolvedValue({
      data: {
        question_id: 'question-1',
        favorites_count: 3,
        is_favorited: false,
      },
    })

    await expect(addQuestionFavorite('question-1')).resolves.toEqual({
      question_id: 'question-1',
      favorites_count: 4,
      is_favorited: true,
    })
    await expect(removeQuestionFavorite('question-1')).resolves.toEqual({
      question_id: 'question-1',
      favorites_count: 3,
      is_favorited: false,
    })

    expect(postSpy).toHaveBeenCalledWith('/question/question-1/favorite/')
    expect(deleteSpy).toHaveBeenCalledWith('/question/question-1/favorite/')
  })

  it('rejects malformed favorite mutation responses before cache state can trust them', () => {
    expect(() => normalizeQuestionFavoriteMutationResponse({
      question_id: 'question-1',
      favorites_count: '4',
      is_favorited: true,
    })).toThrow('Malformed question favorite response')

    expect(() => normalizeQuestionFavoriteMutationResponse({
      question_id: 'question-1',
      favorites_count: 4,
      is_favorited: 'true',
    })).toThrow('Malformed question favorite response')
  })
})
