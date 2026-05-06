import { describe, expect, it } from 'vitest'

import {
  buildReputationProgress,
  formatReputationDelta,
  formatReputationReason,
  type ReputationSummary,
} from '@/features/users/api/reputation'

const baseSummary: ReputationSummary = {
  score: 128,
  level: 'expert',
  level_label: 'Эксперт',
  level_minimum_score: 100,
  is_manual_override: false,
  manual_level: null,
  next_level: 'master',
  next_level_label: 'Мастер',
  next_level_minimum_score: 300,
  points_to_next_level: 172,
}

describe('profile reputation helpers', () => {
  it('builds progress metadata between the current and next threshold', () => {
    expect(buildReputationProgress(baseSummary)).toEqual({
      percent: 14,
      earnedSinceLevel: 28,
      levelSpan: 200,
    })
  })

  it('clamps max-level users to a completed progress state', () => {
    expect(buildReputationProgress({
      ...baseSummary,
      score: 320,
      level: 'master',
      level_label: 'Мастер',
      next_level: null,
      next_level_label: null,
      next_level_minimum_score: null,
      points_to_next_level: 0,
    })).toEqual({
      percent: 100,
      earnedSinceLevel: 220,
      levelSpan: 0,
    })
  })

  it('maps known ledger reasons to friendly Russian labels and keeps unknown reasons safe', () => {
    expect(formatReputationReason('approved_edit')).toBe('Одобренная правка')
    expect(formatReputationReason('future_backend_reason')).toBe('Изменение репутации')
  })

  it('formats positive and negative reputation deltas for the ledger UI', () => {
    expect(formatReputationDelta(15)).toBe('+15')
    expect(formatReputationDelta(-2)).toBe('-2')
    expect(formatReputationDelta(0)).toBe('0')
  })
})
