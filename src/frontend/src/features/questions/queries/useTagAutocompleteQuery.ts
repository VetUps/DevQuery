import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchTagAutocomplete, normalizeTagSearch } from '@/features/questions/api/questions'

export function useTagAutocompleteQuery(search: MaybeRefOrGetter<string>) {
  const normalizedSearch = computed(() => normalizeTagSearch(toValue(search)))

  return useQuery({
    queryKey: computed(() => ['questions', 'tag-autocomplete', normalizedSearch.value]),
    enabled: computed(() => normalizedSearch.value.length > 0),
    queryFn: () => fetchTagAutocomplete(normalizedSearch.value),
  })
}
