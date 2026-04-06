import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchCommentContext, type CommentTargetType } from '@/features/comments/api/comments'

export interface CommentContextSlice {
  count: number
  hasMore: boolean
  comments: Awaited<ReturnType<typeof fetchCommentContext>>['results']
}

export function useCommentContextQuery(
  targetType: MaybeRefOrGetter<CommentTargetType>,
  targetId: MaybeRefOrGetter<string>,
) {
  const normalizedTargetType = computed(() => toValue(targetType))
  const normalizedTargetId = computed(() => toValue(targetId).trim())

  return useQuery({
    queryKey: computed(() => [
      'comments',
      'context',
      {
        targetType: normalizedTargetType.value,
        targetId: normalizedTargetId.value,
      },
    ]),
    enabled: computed(() => Boolean(normalizedTargetId.value)),
    queryFn: async (): Promise<CommentContextSlice> => {
      const response = await fetchCommentContext(normalizedTargetType.value, normalizedTargetId.value)

      return {
        count: response.count,
        hasMore: response.count > 3,
        comments: response.results.slice(0, 3),
      }
    },
  })
}
