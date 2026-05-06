import { describe, expect, it } from 'vitest'

import {
  getProtectedQuestionAnswerWindowLabel,
  getProtectedQuestionAnswerWindowSummary,
  getProtectedQuestionWindowHours,
  getProtectedQuestionWindowLabel,
} from '@/features/questions/api/questions'
import {
  buildReputationProgress,
  formatReputationDelta,
  formatReputationReason,
  parseReputationSummary,
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

  it('builds progress metadata from backend-shaped threshold fixtures when score bands change', () => {
    const shiftedThresholds = parseReputationSummary({
      score: 165,
      level: 'expert',
      level_label: 'Эксперт',
      level_minimum_score: 150,
      next_level: 'master',
      next_level_label: 'Мастер',
      next_level_minimum_score: 450,
      points_to_next_level: 285,
    })

    expect(buildReputationProgress(shiftedThresholds)).toEqual({
      percent: 5,
      earnedSinceLevel: 15,
      levelSpan: 300,
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

  it('derives protected-question labels from backend-shaped timestamps instead of a hardcoded 12-hour window', () => {
    const twentyFourHourQuestion = {
      question_created_at: '2026-04-01T12:00:00Z',
      protected_until: '2026-04-02T12:00:00Z',
      viewer_answer_required_level_label: 'Участник',
    }

    expect(getProtectedQuestionWindowHours(twentyFourHourQuestion)).toBe(24)
    expect(getProtectedQuestionWindowLabel(24)).toBe('24 часов')
    expect(getProtectedQuestionAnswerWindowLabel(twentyFourHourQuestion)).toBe('Участник+ отвечают первые 24 часов')
    expect(getProtectedQuestionAnswerWindowSummary(twentyFourHourQuestion)).toBe(
      'В течение первых 24 часов после публикации отвечать могут только участники и мастера.',
    )
  })

  it('falls back to the default 12-hour copy when legacy payloads omit the protection window timestamps', () => {
    const legacyQuestion = {
      question_created_at: '2026-04-01T12:00:00Z',
      protected_until: null,
      viewer_answer_required_level_label: 'Эксперт',
    }

    expect(getProtectedQuestionWindowHours(legacyQuestion)).toBe(12)
    expect(getProtectedQuestionAnswerWindowLabel(legacyQuestion)).toBe('Эксперт+ отвечают первые 12 часов')
  })
})
