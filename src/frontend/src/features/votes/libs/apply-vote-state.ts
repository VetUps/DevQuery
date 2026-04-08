import type { VoteType } from '@/features/votes/api/votes'

export interface VoteState {
  score: number
  upvotes: number
  downvotes: number
  user_vote: VoteType | null | string
}

export function resolveNextVote(
  currentVote: VoteType | null | string,
  requestedVote: VoteType,
): VoteType | null {
  return currentVote === requestedVote ? null : requestedVote
}

export function applyVoteState(currentState: VoteState, requestedVote: VoteType): VoteState {
  const currentVote = currentState.user_vote === 'up' || currentState.user_vote === 'down'
    ? currentState.user_vote
    : null
  const nextVote = resolveNextVote(currentVote, requestedVote)

  let nextUpvotes = currentState.upvotes
  let nextDownvotes = currentState.downvotes

  if (currentVote === 'up') {
    nextUpvotes -= 1
  }

  if (currentVote === 'down') {
    nextDownvotes -= 1
  }

  if (nextVote === 'up') {
    nextUpvotes += 1
  }

  if (nextVote === 'down') {
    nextDownvotes += 1
  }

  return {
    ...currentState,
    upvotes: nextUpvotes,
    downvotes: nextDownvotes,
    score: nextUpvotes - nextDownvotes,
    user_vote: nextVote,
  }
}
