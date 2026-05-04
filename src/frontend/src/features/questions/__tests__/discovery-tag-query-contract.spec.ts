import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchQuestionList,
  normalizeQuestionTags,
  type QuestionListParams,
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

describe('discovery tag query contract', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear()
    vi.restoreAllMocks()
  })

  it('normalizes tag arrays once by trimming, lowercasing, dropping blanks, and deduping in order', () => {
    expect(normalizeQuestionTags([' Vue ', '', 'vue', '  DJANGO  ', 'django', '   ', 'DRF'])).toEqual([
      'vue',
      'django',
      'drf',
    ])
  })

  it('treats malformed tag array values as absent tags before they reach query keys or requests', () => {
    const malformedTags = [' Vue ', null, undefined, 42, { name: 'django' }, 'vue', ' DRF '] as unknown as string[]

    expect(normalizeQuestionTags(malformedTags)).toEqual(['vue', 'drf'])
  })

  it('serializes zero, one, and many tags with the repeated tag URL contract', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await fetchQuestionList({ page: 1, search: ' serializer ', ordering: 'question_created_at', tags: [] })
    await fetchQuestionList({ page: 1, tags: [' Vue '] })
    await fetchQuestionList({ page: 2, search: 'api', ordering: '-question_created_at', tags: [' Vue ', 'DJANGO'] })

    const configs = getSpy.mock.calls.map(([, config]) => config ?? {})

    expect(http.getUri({ url: '/question/', ...configs[0] })).toContain('/question/?page=1&search=+serializer+&ordering=question_created_at')
    expect(http.getUri({ url: '/question/', ...configs[0] })).not.toContain('tag=')
    expect(http.getUri({ url: '/question/', ...configs[1] })).toContain('/question/?page=1&tag=vue')
    expect(http.getUri({ url: '/question/', ...configs[2] })).toContain(
      '/question/?page=2&search=api&ordering=-question_created_at&tag=vue&tag=django',
    )
  })

  it('keeps page, search, ordering, and normalized tags stable in the Vue Query key', () => {
    const params = ref({
      page: 0,
      search: '  Cache Keys  ',
      ordering: 'invalid-order' as QuestionListParams['ordering'],
      tags: [' Vue ', '', 'vue', '  DRF', 'drf ', '   '],
    })

    const queryOptions = useQuestionListQuery(params)

    expect(queryOptions.queryKey.value).toEqual([
      'questions',
      'list',
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
      {
        page: 3,
        search: '',
        ordering: 'question_created_at',
        tags: ['django'],
      },
    ])
  })

  it('uses one list request per normalized query state without dropping compatible filters', async () => {
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
    expect(http.getUri({ url: '/question/', ...(getSpy.mock.calls[0][1] ?? {}) })).toContain(
      '/question/?page=4&search=composables&ordering=question_created_at&tag=vue&tag=django',
    )
  })

  it('preserves list request failures for existing loading and retry UI paths', async () => {
    const error = new Error('network lost')
    vi.spyOn(http, 'get').mockRejectedValue(error)

    await expect(fetchQuestionList({ page: 1, tags: ['vue'] })).rejects.toThrow('network lost')
  })
})
