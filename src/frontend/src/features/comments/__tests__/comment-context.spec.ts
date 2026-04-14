import { describe, expect, it } from 'vitest'

import { selectCompactCommentContext } from '@/features/comments/queries/useCommentContextQuery'

function buildComment(commentId: string, createdAt: string, replies: Array<{ comment_id: string; created_at: string }> = []) {
  return {
    comment_id: commentId,
    user: `user-${commentId}`,
    user_name: `User ${commentId}`,
    user_avatar_url: null,
    target_type: 'question' as const,
    target_id: 'question-1',
    parent_id: null,
    body: `Comment ${commentId}`,
    created_at: createdAt,
    replies: replies.map((reply) => ({
      ...reply,
      user: `user-${reply.comment_id}`,
      user_name: `User ${reply.comment_id}`,
      user_avatar_url: null,
      target_type: 'question' as const,
      target_id: 'question-1',
      parent_id: commentId,
      body: `Reply ${reply.comment_id}`,
    })),
  }
}

describe('selectCompactCommentContext', () => {
  it('keeps branches with the freshest reply activity inside the compact detail slice', () => {
    const comments = [
      buildComment('comment-1', '2026-04-01T10:00:00Z', [
        {
          comment_id: 'comment-1-reply',
          created_at: '2026-04-05T10:00:00Z',
        },
      ]),
      buildComment('comment-2', '2026-04-02T10:00:00Z'),
      buildComment('comment-3', '2026-04-03T10:00:00Z'),
      buildComment('comment-4', '2026-04-04T10:00:00Z'),
    ]

    const compactComments = selectCompactCommentContext(comments)
    const compactIds = compactComments.map((comment) => comment.comment_id)

    expect(compactIds).toHaveLength(3)
    expect(compactIds).toContain('comment-1')
    expect(compactIds).not.toContain('comment-2')
  })
})
