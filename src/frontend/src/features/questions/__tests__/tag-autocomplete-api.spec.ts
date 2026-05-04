import { computed, nextTick, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchTagAutocomplete,
  type CreateQuestionPayload,
  type TagSuggestion,
} from '@/features/questions/api/questions'
import { useTagAutocompleteQuery } from '@/features/questions/queries/useTagAutocompleteQuery'
import { http } from '@/shared/api/http'

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()

  return {
    ...actual,
    useQuery: vi.fn((options) => options),
  }
})

describe('tag autocomplete API boundary', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear()
    vi.restoreAllMocks()
  })

  it('normalizes search text before requesting tag suggestions', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [{ name: 'django', questions_count: 12 }],
    })

    const suggestions = await fetchTagAutocomplete('  Django  ')

    expect(getSpy).toHaveBeenCalledWith('/tag/', {
      params: { search: 'django' },
    })
    expect(suggestions).toEqual([{ name: 'django', questions_count: 12 }])
  })

  it('does not fetch the full tag table for blank or whitespace search', async () => {
    const getSpy = vi.spyOn(http, 'get')

    await expect(fetchTagAutocomplete('   ')).resolves.toEqual([])

    expect(getSpy).not.toHaveBeenCalled()
  })

  it('keeps the autocomplete response typed as public tag names with question counts', () => {
    const suggestions: TagSuggestion[] = [{ name: 'vue', questions_count: 7 }]

    expect(suggestions[0]).toEqual({ name: 'vue', questions_count: 7 })
  })

  it('builds a normalized query key and disables blank autocomplete queries', () => {
    const search = ref('  Vue  ')
    const queryOptions = useTagAutocompleteQuery(search)

    expect(queryOptions.queryKey.value).toEqual(['questions', 'tag-autocomplete', 'vue'])
    expect(queryOptions.enabled.value).toBe(true)

    search.value = '   '

    expect(queryOptions.queryKey.value).toEqual(['questions', 'tag-autocomplete', ''])
    expect(queryOptions.enabled.value).toBe(false)
  })

  it('uses one bounded autocomplete request per normalized query term', async () => {
    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({ data: [] })
    const search = computed(() => '  VUE  ')
    const queryOptions = useTagAutocompleteQuery(search)

    await queryOptions.queryFn()
    await nextTick()

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('/tag/', {
      params: { search: 'vue' },
    })
  })

  it('allows question create payloads to carry selected tag names', () => {
    const payload = {
      question_title: 'How do Vue query keys stay stable?',
      question_body: 'I need normalized tag autocomplete terms in the ask form.',
      tags: ['vue', 'tanstack-query'],
    } satisfies CreateQuestionPayload

    expect(payload.tags).toEqual(['vue', 'tanstack-query'])
  })
})
