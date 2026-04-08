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

function toTimestamp(value: string) {
  const timestamp = Date.parse(value)

  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getLatestCommentActivity(comment: CommentThreadItem) {
  const replyTimestamps = (comment.replies ?? []).map((reply) => toTimestamp(reply.created_at))

  return Math.max(toTimestamp(comment.created_at), ...replyTimestamps)
}

export function selectCompactCommentContext(comments: CommentThreadItem[], visibleCount = 3) {
  return [...comments]
    .sort((left, right) => {
      const activityDelta = getLatestCommentActivity(left) - getLatestCommentActivity(right)

      if (activityDelta !== 0) {
        return activityDelta
      }

      return toTimestamp(left.created_at) - toTimestamp(right.created_at)
    })
    .slice(-visibleCount)
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
      const compactComments = selectCompactCommentContext(response.results)

      return {
        count: response.count,
        hasMore: response.count > 3,
        comments: compactComments,
      }
    },
  })
}
