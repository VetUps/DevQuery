import { diffWords } from 'diff'

export interface SolutionEditDiffChunk {
  value: string
  kind: 'context' | 'added' | 'removed'
}

export interface SolutionEditDiff {
  before: SolutionEditDiffChunk[]
  after: SolutionEditDiffChunk[]
}

export function buildSolutionEditDiff(before: string, after: string): SolutionEditDiff {
  const beforeChunks: SolutionEditDiffChunk[] = []
  const afterChunks: SolutionEditDiffChunk[] = []

  for (const part of diffWords(before, after)) {
    if (part.added) {
      afterChunks.push({
        value: part.value,
        kind: 'added',
      })
      continue
    }

    if (part.removed) {
      beforeChunks.push({
        value: part.value,
        kind: 'removed',
      })
      continue
    }

    beforeChunks.push({
      value: part.value,
      kind: 'context',
    })
    afterChunks.push({
      value: part.value,
      kind: 'context',
    })
  }

  return {
    before: beforeChunks,
    after: afterChunks,
  }
}
