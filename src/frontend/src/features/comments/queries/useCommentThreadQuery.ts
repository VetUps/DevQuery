import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import {
  fetchCommentThread,
  type CommentTargetType,
  type CommentThreadItem,
} from '@/features/comments/api/comments'

export function buildCommentThreadQueryKey(
  targetType: CommentTargetType,
  targetId: string,
  parentId: string | null = null,
) {
  return [
    'comments',
    'thread',
    {
      targetType,
      targetId,
      parentId,
    },
  ] as const
}

export function useCommentThreadQuery(
  targetType: MaybeRefOrGetter<CommentTargetType>,
  targetId: MaybeRefOrGetter<string>,
  parentId?: MaybeRefOrGetter<string | null | undefined>,
) {
  const normalizedTargetType = computed(() => toValue(targetType))
  const normalizedTargetId = computed(() => toValue(targetId).trim())
  const normalizedParentId = computed(() => {
    const nextParentId = toValue(parentId)

    return nextParentId ? nextParentId.trim() : null
  })

  return useQuery({
    queryKey: computed(() => buildCommentThreadQueryKey(
      normalizedTargetType.value,
      normalizedTargetId.value,
      normalizedParentId.value,
    )),
    enabled: computed(() => Boolean(normalizedTargetId.value)),
    queryFn: async (): Promise<CommentThreadItem[]> => {
      const response = await fetchCommentThread(
        normalizedTargetType.value,
        normalizedTargetId.value,
        normalizedParentId.value,
      )

      return response.results
    },
  })
}
