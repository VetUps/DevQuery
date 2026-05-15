export type ReputationLevel = 'newcomer' | 'participant' | 'expert' | 'master'
export type ReputationRankPart = 'star'

export interface ReputationRankDescriptor {
  level: ReputationLevel
  label: string
  parts: ReputationRankPart[]
  ariaDescription: string
}

export const REPUTATION_RANKS: Record<ReputationLevel, ReputationRankDescriptor> = {
  newcomer: {
    level: 'newcomer',
    label: 'Новичок',
    parts: ['star'],
    ariaDescription: 'одна небольшая звезда',
  },
  participant: {
    level: 'participant',
    label: 'Участник',
    parts: ['star', 'star'],
    ariaDescription: 'две звезды с декоративными завитками',
  },
  expert: {
    level: 'expert',
    label: 'Эксперт',
    parts: ['star', 'star', 'star'],
    ariaDescription: 'три звезды пирамидой: большая сверху и две меньшие снизу',
  },
  master: {
    level: 'master',
    label: 'Мастер',
    parts: ['star', 'star', 'star'],
    ariaDescription: 'три звезды',
  },
}

export function getReputationRankDescriptor(level: string | null | undefined) {
  return level === 'newcomer' || level === 'participant' || level === 'expert' || level === 'master'
    ? REPUTATION_RANKS[level]
    : null
}

export interface ReputationProgress {
  score: number
  level: ReputationLevel
  level_label: string
  level_minimum_score?: number
  is_manual_override?: boolean
  manual_level?: ReputationLevel | null | string
  next_level: ReputationLevel | null | string
  next_level_label?: string | null
  next_level_minimum_score?: number | null
  points_to_next_level: number
}

export type ReputationSummary = ReputationProgress

export interface ReputationLedgerEntry {
  id: string
  amount: number
  reason: string
  note: string | null
  actor_name: string | null
  created_at: string
}

export class MalformedReputationResponseError extends Error {
  constructor(message = 'Malformed reputation API response') {
    super(message)
    this.name = 'MalformedReputationResponseError'
  }
}

export const REPUTATION_REASON_LABELS: Record<string, string> = {
  best_solution: 'Лучшее решение',
  solution_upvoted: 'Голос за ваше решение',
  solution_downvoted: 'Голос против вашего решения',
  question_upvoted: 'Голос за ваш вопрос',
  approved_edit: 'Одобренная правка',
  achievement_earned: 'Системная награда',
  admin_adjustment: 'Ручная корректировка',
  manual_level_override: 'Ручное изменение уровня',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new MalformedReputationResponseError(`Malformed reputation response: ${fieldName}`)
  }

  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, fieldName)
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MalformedReputationResponseError(`Malformed reputation response: ${fieldName}`)
  }

  return value
}

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new MalformedReputationResponseError(`Malformed reputation response: ${fieldName}`)
  }

  return value
}

function assertOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  return assertBoolean(value, fieldName)
}

function isReputationLevel(value: unknown): value is ReputationLevel {
  return value === 'newcomer' || value === 'participant' || value === 'expert' || value === 'master'
}

function assertReputationLevel(value: unknown, fieldName: string): ReputationLevel {
  if (!isReputationLevel(value)) {
    throw new MalformedReputationResponseError(`Malformed reputation response: ${fieldName}`)
  }

  return value
}

function parseNextLevel(value: unknown): ReputationSummary['next_level'] {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, 'next_level')
}

function parseManualLevel(value: unknown): ReputationSummary['manual_level'] {
  if (value === null || value === undefined) {
    return null
  }

  return assertString(value, 'manual_level')
}

export function formatReputationReason(reason: string) {
  return REPUTATION_REASON_LABELS[reason] ?? 'Изменение репутации'
}

export function formatReputationDelta(amount: number) {
  return amount > 0 ? `+${amount}` : `${amount}`
}

export function buildReputationProgress(progress: ReputationProgress) {
  const currentFloor = progress.level_minimum_score ?? 0
  const nextFloor = progress.next_level_minimum_score ?? null

  if (nextFloor === null) {
    return {
      percent: 100,
      earnedSinceLevel: Math.max(progress.score - currentFloor, 0),
      levelSpan: 0,
    }
  }

  const levelSpan = Math.max(nextFloor - currentFloor, 1)
  const earnedSinceLevel = Math.min(Math.max(progress.score - currentFloor, 0), levelSpan)

  return {
    percent: Math.round(Math.min(Math.max((earnedSinceLevel / levelSpan) * 100, 0), 100)),
    earnedSinceLevel,
    levelSpan,
  }
}

export function parseReputationSummary(value: unknown): ReputationSummary {
  if (!isRecord(value)) {
    throw new MalformedReputationResponseError('Malformed reputation response: expected reputation object')
  }

  const summary: ReputationSummary = {
    score: assertNumber(value.score, 'score'),
    level: assertReputationLevel(value.level, 'level'),
    level_label: assertString(value.level_label, 'level_label'),
    next_level: parseNextLevel(value.next_level),
    points_to_next_level: assertNumber(value.points_to_next_level, 'points_to_next_level'),
  }

  if (value.level_minimum_score !== undefined) {
    summary.level_minimum_score = assertNumber(value.level_minimum_score, 'level_minimum_score')
  }

  if (value.next_level_label !== undefined) {
    summary.next_level_label = assertNullableString(value.next_level_label, 'next_level_label')
  }

  if (value.next_level_minimum_score !== undefined) {
    summary.next_level_minimum_score = value.next_level_minimum_score === null
      ? null
      : assertNumber(value.next_level_minimum_score, 'next_level_minimum_score')
  }

  if (value.manual_level !== undefined) {
    summary.manual_level = parseManualLevel(value.manual_level)
  }

  if (value.is_manual_override !== undefined) {
    summary.is_manual_override = assertOptionalBoolean(value.is_manual_override, 'is_manual_override')
  }

  return summary
}

export function parseReputationLedgerEntry(value: unknown): ReputationLedgerEntry {
  if (!isRecord(value)) {
    throw new MalformedReputationResponseError('Malformed reputation ledger response: expected object')
  }

  return {
    id: assertString(value.id, 'id'),
    amount: assertNumber(value.amount, 'amount'),
    reason: assertString(value.reason, 'reason'),
    note: assertNullableString(value.note, 'note'),
    actor_name: assertNullableString(value.actor_name, 'actor_name'),
    created_at: assertString(value.created_at, 'created_at'),
  }
}

export function parseReputationLedger(value: unknown): ReputationLedgerEntry[] {
  if (!Array.isArray(value)) {
    throw new MalformedReputationResponseError('Malformed reputation ledger response: expected array')
  }

  return value.map(parseReputationLedgerEntry)
}
