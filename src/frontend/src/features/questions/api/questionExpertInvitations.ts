import { http } from '@/shared/api/http'

export interface EligibleExpertCandidate {
  user_id: string
  user_name: string
  user_reputation_score: number
  reputation_level: string
  reputation_level_label: string
  is_manual_override: boolean
}

export interface EligibleExpertsEnvelope {
  count: number
  next: string | null
  previous: string | null
  results: EligibleExpertCandidate[]
  question_id: string
  max_invites: number
  invited_count: number
  remaining_slots: number
  can_invite: boolean
  reason_code: string
}

export interface CreateExpertInvitationsPayload {
  recipient_ids: string[]
}

export interface ExpertInvitationItem {
  recipient_id: string
  notification_id: string
  dedupe_key: string
  expires_at: string
  payload: Record<string, unknown>
}

export interface ExpertInvitationCreateResponse {
  question_id: string
  max_invites: number
  invited_count: number
  remaining_slots: number
  created_count: number
  invitations: ExpertInvitationItem[]
}

export class MalformedExpertInvitationResponseError extends Error {
  constructor(message = 'Malformed expert invitation API response') {
    super(message)
    this.name = 'MalformedExpertInvitationResponseError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fail(fieldName: string): never {
  throw new MalformedExpertInvitationResponseError(`Malformed expert invitation response: ${fieldName}`)
}

function assertUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(fieldName)
  }

  return value
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    fail(fieldName)
  }

  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null
  }

  return assertString(value, fieldName)
}

function assertNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(fieldName)
  }

  return value
}

function assertInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(fieldName)
  }

  return value
}

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    fail(fieldName)
  }

  return value
}

function assertRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(fieldName)
  }

  return value
}

function assertIsoDateString(value: unknown, fieldName: string): string {
  const dateValue = assertString(value, fieldName)

  if (Number.isNaN(Date.parse(dateValue))) {
    fail(fieldName)
  }

  return dateValue
}

export function parseEligibleExpertCandidate(value: unknown): EligibleExpertCandidate {
  const candidate = assertRecord(value, 'candidate')

  return {
    user_id: assertUuid(candidate.user_id, 'results.user_id'),
    user_name: assertString(candidate.user_name, 'results.user_name'),
    user_reputation_score: assertInteger(candidate.user_reputation_score, 'results.user_reputation_score'),
    reputation_level: assertString(candidate.reputation_level, 'results.reputation_level'),
    reputation_level_label: assertString(candidate.reputation_level_label, 'results.reputation_level_label'),
    is_manual_override: assertBoolean(candidate.is_manual_override, 'results.is_manual_override'),
  }
}

export function parseEligibleExpertsEnvelope(value: unknown): EligibleExpertsEnvelope {
  const envelope = assertRecord(value, 'eligible-experts envelope')

  if (!Array.isArray(envelope.results)) {
    fail('results')
  }

  return {
    count: assertNonNegativeInteger(envelope.count, 'count'),
    next: assertNullableString(envelope.next, 'next'),
    previous: assertNullableString(envelope.previous, 'previous'),
    results: envelope.results.map(parseEligibleExpertCandidate),
    question_id: assertUuid(envelope.question_id, 'question_id'),
    max_invites: assertNonNegativeInteger(envelope.max_invites, 'max_invites'),
    invited_count: assertNonNegativeInteger(envelope.invited_count, 'invited_count'),
    remaining_slots: assertNonNegativeInteger(envelope.remaining_slots, 'remaining_slots'),
    can_invite: assertBoolean(envelope.can_invite, 'can_invite'),
    reason_code: assertString(envelope.reason_code, 'reason_code'),
  }
}

export function parseExpertInvitationItem(value: unknown): ExpertInvitationItem {
  const invitation = assertRecord(value, 'invitation')

  return {
    recipient_id: assertUuid(invitation.recipient_id, 'invitations.recipient_id'),
    notification_id: assertUuid(invitation.notification_id, 'invitations.notification_id'),
    dedupe_key: assertString(invitation.dedupe_key, 'invitations.dedupe_key'),
    expires_at: assertIsoDateString(invitation.expires_at, 'invitations.expires_at'),
    payload: assertRecord(invitation.payload, 'invitations.payload'),
  }
}

export function parseExpertInvitationCreateResponse(value: unknown): ExpertInvitationCreateResponse {
  const response = assertRecord(value, 'expert-invitations response')

  if (!Array.isArray(response.invitations)) {
    fail('invitations')
  }

  return {
    question_id: assertUuid(response.question_id, 'question_id'),
    max_invites: assertNonNegativeInteger(response.max_invites, 'max_invites'),
    invited_count: assertNonNegativeInteger(response.invited_count, 'invited_count'),
    remaining_slots: assertNonNegativeInteger(response.remaining_slots, 'remaining_slots'),
    created_count: assertNonNegativeInteger(response.created_count, 'created_count'),
    invitations: response.invitations.map(parseExpertInvitationItem),
  }
}

export function normalizeExpertInvitationError(error: unknown): string {
  if (error instanceof MalformedExpertInvitationResponseError) {
    return error.message
  }

  return 'Не удалось обновить приглашения экспертов. Попробуйте ещё раз.'
}

export async function fetchEligibleExperts(questionId: string, options: { search?: string } = {}) {
  const search = options.search?.trim()
  const requestOptions = search ? { params: { search } } : undefined
  const response = await http.get<unknown>(`/question/${questionId}/eligible-experts/`, requestOptions)

  return parseEligibleExpertsEnvelope(response.data)
}

export async function createExpertInvitations(questionId: string, recipientIds: string[]) {
  const payload: CreateExpertInvitationsPayload = { recipient_ids: recipientIds }
  const response = await http.post<unknown>(`/question/${questionId}/expert-invitations/`, payload)

  return parseExpertInvitationCreateResponse(response.data)
}
