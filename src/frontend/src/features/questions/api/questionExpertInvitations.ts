import { http } from '@/shared/api/http'

export interface EligibleExpertCandidate {
  user_id: string
  user_name: string
  user_reputation_score: number
  reputation_level: string
  reputation_level_label: string
  is_manual_override: boolean
  topic_score: number
  topic_match_count: number
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

export interface InvitedExpertInvitation {
  recipient_id: string
  recipient_name: string
  recipient_reputation_score: number
  reputation_level: string
  reputation_level_label: string
  notification_id: string
  is_read: boolean
  read_at: string | null
  invitation_status: string
  protected_window_active: boolean
  protected_until: string | null
}

export interface InvitedExpertInvitationsEnvelope {
  count: number
  next: string | null
  previous: string | null
  results: InvitedExpertInvitation[]
  question_id: string
  invited_count: number
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

function assertNullableIsoDateString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null
  }

  return assertIsoDateString(value, fieldName)
}

function assertNoSensitiveInvitationFields(value: Record<string, unknown>, fieldName: string): void {
  if ('payload' in value || 'dedupe_key' in value || 'recipient_email' in value || 'user_email' in value) {
    fail(fieldName)
  }
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
    topic_score: Number(candidate.topic_score ?? 0),
    topic_match_count: Number(candidate.topic_match_count ?? 0),
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

export function parseInvitedExpertInvitation(value: unknown): InvitedExpertInvitation {
  const invitation = assertRecord(value, 'results')
  assertNoSensitiveInvitationFields(invitation, 'results.sensitive_fields')

  return {
    recipient_id: assertUuid(invitation.recipient_id, 'results.recipient_id'),
    recipient_name: assertString(invitation.recipient_name, 'results.recipient_name'),
    recipient_reputation_score: assertInteger(invitation.recipient_reputation_score, 'results.recipient_reputation_score'),
    reputation_level: assertString(invitation.reputation_level, 'results.reputation_level'),
    reputation_level_label: assertString(invitation.reputation_level_label, 'results.reputation_level_label'),
    notification_id: assertUuid(invitation.notification_id, 'results.notification_id'),
    is_read: assertBoolean(invitation.is_read, 'results.is_read'),
    read_at: assertNullableIsoDateString(invitation.read_at, 'results.read_at'),
    invitation_status: assertString(invitation.invitation_status, 'results.invitation_status'),
    protected_window_active: assertBoolean(invitation.protected_window_active, 'results.protected_window_active'),
    protected_until: assertNullableIsoDateString(invitation.protected_until, 'results.protected_until'),
  }
}

export function parseInvitedExpertInvitationsEnvelope(value: unknown): InvitedExpertInvitationsEnvelope {
  const envelope = assertRecord(value, 'invited-experts envelope')

  if (!Array.isArray(envelope.results)) {
    fail('results')
  }

  return {
    count: assertNonNegativeInteger(envelope.count, 'count'),
    next: assertNullableString(envelope.next, 'next'),
    previous: assertNullableString(envelope.previous, 'previous'),
    results: envelope.results.map(parseInvitedExpertInvitation),
    question_id: assertUuid(envelope.question_id, 'question_id'),
    invited_count: assertNonNegativeInteger(envelope.invited_count, 'invited_count'),
  }
}

export function normalizeExpertInvitationError(error: unknown): string {
  if (error instanceof MalformedExpertInvitationResponseError) {
    return error.message
  }

  return 'Не удалось обновить приглашения экспертов. Попробуйте ещё раз.'
}

export async function fetchEligibleExperts(
  questionId: string,
  options: { search?: string; ordering?: string; page?: number } = {},
) {
  const params: Record<string, string | number> = {}
  if (options.search?.trim()) params.search = options.search.trim()
  if (options.ordering) params.ordering = options.ordering
  if (options.page && options.page > 1) params.page = options.page

  const response = await http.get<unknown>(
    `/question/${questionId}/eligible-experts/`,
    Object.keys(params).length > 0 ? { params } : undefined,
  )

  return parseEligibleExpertsEnvelope(response.data)
}

export async function fetchInvitedExpertInvitations(questionId: string) {
  const response = await http.get<unknown>(`/question/${questionId}/expert-invitations/`)

  return parseInvitedExpertInvitationsEnvelope(response.data)
}

export async function createExpertInvitations(questionId: string, recipientIds: string[]) {
  const payload: CreateExpertInvitationsPayload = { recipient_ids: recipientIds }
  const response = await http.post<unknown>(`/question/${questionId}/expert-invitations/`, payload)

  return parseExpertInvitationCreateResponse(response.data)
}
