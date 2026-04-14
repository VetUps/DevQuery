import { useMutation } from '@tanstack/vue-query'

import type { UserProfile } from '@/features/auth/api/auth'
import {
  createComment,
  type CommentListItem,
  type CommentThreadItem,
  type CreateCommentPayload,
} from '@/features/comments/api/comments'
import { buildCommentContextQueryKey, type CommentContextSlice } from '@/features/comments/queries/useCommentContextQuery'
import { buildCommentThreadQueryKey } from '@/features/comments/queries/useCommentThreadQuery'
import { queryClient } from '@/app/query-client'
import { normalizeCommentSubmitError } from '@/features/comments/libs/comment-form-errors'
import { useToastStore } from '@/shared/stores/toast'

interface CommentMutationContext {
  contextKey: ReturnType<typeof buildCommentContextQueryKey>
  contextSnapshot?: CommentContextSlice
  threadKey: ReturnType<typeof buildCommentThreadQueryKey>
  threadSnapshot?: CommentThreadItem[]
}

function buildOptimisticComment(
  payload: CreateCommentPayload,
  currentUser?: UserProfile,
): CommentListItem {
  return {
    comment_id: `optimistic-comment-${Date.now()}`,
    user: currentUser?.user_id ?? 'current-user',
    user_name: currentUser?.user_name ?? 'Вы',
    user_avatar_url: currentUser?.user_avatar_url ?? null,
    target_type: payload.target_type,
    target_id: payload.target_id,
    parent_id: payload.parent_id ?? null,
    body: payload.body,
    created_at: new Date().toISOString(),
  }
}

function appendCommentToThread(
  comments: CommentThreadItem[],
  createdComment: CommentListItem,
): CommentThreadItem[] {
  if (createdComment.parent_id) {
    return comments.map((comment) => (
      comment.comment_id === createdComment.parent_id
        ? {
            ...comment,
            replies: [...(comment.replies ?? []), createdComment],
          }
        : comment
    ))
  }

  return [
    ...comments,
    {
      ...createdComment,
      replies: [],
    },
  ]
}

function applyCommentToContextSlice(
  slice: CommentContextSlice | undefined,
  createdComment: CommentListItem,
): CommentContextSlice | undefined {
  if (!slice) {
    return slice
  }

  if (createdComment.parent_id) {
    return {
      ...slice,
      comments: appendCommentToThread(slice.comments, createdComment),
    }
  }

  const nextComments = appendCommentToThread(slice.comments, createdComment).slice(-3)

  return {
    count: slice.count + 1,
    hasMore: slice.count + 1 > 3,
    comments: nextComments,
  }
}

export function useCreateCommentMutation() {
  const { pushToast } = useToastStore()

  return useMutation({
    mutationFn: (payload: CreateCommentPayload) => createComment(payload),
    onMutate: async (payload): Promise<CommentMutationContext> => {
      const currentUser = queryClient.getQueryData<UserProfile>(['auth', 'profile'])
      const optimisticComment = buildOptimisticComment(payload, currentUser)
      const contextKey = buildCommentContextQueryKey(payload.target_type, payload.target_id)
      const threadKey = buildCommentThreadQueryKey(payload.target_type, payload.target_id, null)

      await Promise.all([
        queryClient.cancelQueries({ queryKey: contextKey }),
        queryClient.cancelQueries({ queryKey: threadKey }),
      ])

      const contextSnapshot = queryClient.getQueryData<CommentContextSlice>(contextKey)
      const threadSnapshot = queryClient.getQueryData<CommentThreadItem[]>(threadKey)

      queryClient.setQueryData<CommentContextSlice | undefined>(
        contextKey,
        (currentSlice) => applyCommentToContextSlice(currentSlice, optimisticComment),
      )

      queryClient.setQueryData<CommentThreadItem[] | undefined>(
        threadKey,
        (currentThread) => currentThread
          ? appendCommentToThread(currentThread, optimisticComment)
          : currentThread,
      )

      return {
        contextKey,
        contextSnapshot,
        threadKey,
        threadSnapshot,
      }
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.contextKey, context.contextSnapshot)
        queryClient.setQueryData(context.threadKey, context.threadSnapshot)
      }

      pushToast({
        message: normalizeCommentSubmitError(error),
        tone: 'danger',
      })
    },
    onSettled: async (_data, _error, variables, context) => {
      const contextKey = context?.contextKey ?? buildCommentContextQueryKey(variables.target_type, variables.target_id)
      const threadKey = context?.threadKey ?? buildCommentThreadQueryKey(variables.target_type, variables.target_id, null)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: contextKey }),
        queryClient.invalidateQueries({ queryKey: threadKey }),
      ])
    },
  })
}
