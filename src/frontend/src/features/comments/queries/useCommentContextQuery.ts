import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import {
  fetchCommentContext,
  type CommentTargetType,
  type CommentThreadItem,
} from '@/features/comments/api/comments'

export interface CommentContextSlice {
  count: number
  hasMore: boolean
  comments: CommentThreadItem[]
}

export function buildCommentContextQueryKey(targetType: CommentTargetType, targetId: string) {
  return [
    'comments',
    'context',
    {
      targetType,
      targetId,
    },
  ] as const
}

export function useCommentContextQuery(
  targetType: MaybeRefOrGetter<CommentTargetType>,
  targetId: MaybeRefOrGetter<string>,
) {
  const normalizedTargetType = computed(() => toValue(targetType))
  const normalizedTargetId = computed(() => toValue(targetId).trim())

  return useQuery({
    queryKey: computed(() => buildCommentContextQueryKey(
      normalizedTargetType.value,
      normalizedTargetId.value,
    )),
    enabled: computed(() => Boolean(normalizedTargetId.value)),
    queryFn: async (): Promise<CommentContextSlice> => {
      const response = await fetchCommentContext(normalizedTargetType.value, normalizedTargetId.value)
      const compactComments = response.results.slice(-3)

      return {
        count: response.count,
        hasMore: response.count > 3,
        comments: compactComments,
      }
    },
  })
}
