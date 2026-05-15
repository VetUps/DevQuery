import type { UserRole } from '@/features/auth/api/auth'
import {
  MalformedReputationResponseError,
  parseReputationLedger,
  parseReputationSummary,
  type ReputationLedgerEntry,
  type ReputationLevel,
  type ReputationSummary,
} from '@/features/users/api/reputation'
import { http } from '@/shared/api/http'

export interface FetchAdminUsersParams {
  search?: string | null
  limit?: number | null
}

export interface AdminUserListRow {
  user_id: string
  user_name: string
  user_email: string
  user_role: UserRole
  user_reputation_score: number
  user_created_at: string
}

export interface AdminUserDetail extends AdminUserListRow {
  reputation: ReputationSummary
  reputation_ledger: ReputationLedgerEntry[]
}

export type AdminReputationSummary = ReputationSummary
export type AdminReputationLedgerEntry = ReputationLedgerEntry

export interface UpdateAdminUserManualOverrideParams {
  userId: string
  manual_reputation_level: ReputationLevel | null
  note: string
}

export interface AdminReputationPolicyConfig {
  protected_newcomer_window_hours: number
  max_protected_newcomer_window_hours: number
  updated_at: string | null
}

export interface UpdateAdminReputationPolicyConfigParams {
  protected_newcomer_window_hours: number
}

export const ADMIN_USER_ACTIVITY_TYPES = [
  'comment',
  'question',
  'question_edit_event',
  'question_edit_proposal',
  'question_revision',
  'reputation',
  'solution',
  'solution_edit',
  'vote',
] as const

export type AdminUserActivityType = (typeof ADMIN_USER_ACTIVITY_TYPES)[number]

export interface AdminUserActivityRoute {
  [key: string]: string
}

export interface AdminUserActivityItem {
  id: string
  type: AdminUserActivityType
  occurred_at: string
  title: string
  summary: string
  target_label: string
  route: AdminUserActivityRoute
}

export interface AdminUserActivityTimeline {
  items: AdminUserActivityItem[]
  count: number
  page: number
  limit: number
  available_types: AdminUserActivityType[]
}

export interface FetchAdminUserActivityTimelineParams {
  userId: string
  types?: AdminUserActivityType[] | null
  limit?: number | null
  page?: number | null
}

export interface FetchAdminUserReputationLedgerParams {
  userId: string
  page?: number | null
}

export interface AdminUserReputationLedgerPage {
  count: number
  next: string | null
  previous: string | null
  results: ReputationLedgerEntry[]
}

export class MalformedAdminApiResponseError extends Error {
  constructor(message = 'Malformed admin API response') {
    super(message)
    this.name = 'MalformedAdminApiResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return value
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return value
}

function assertFiniteInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return value
}

function assertPositiveFiniteInteger(value: unknown, fieldName: string): number {
  const integerValue = assertFiniteInteger(value, fieldName)

  if (integerValue <= 0) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return integerValue
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || typeof value === 'string') {
    return value
  }

  throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
}

function assertUserRole(value: unknown): UserRole {
  if (value !== 'user' && value !== 'admin') {
    throw new MalformedAdminApiResponseError('Malformed admin API response: user_role')
  }

  return value
}

function parseAdminReputationSummary(value: unknown): ReputationSummary {
  try {
    return parseReputationSummary(value)
  } catch (error) {
    if (error instanceof MalformedReputationResponseError) {
      throw new MalformedAdminApiResponseError(error.message.replace('Malformed reputation response', 'Malformed admin API response'))
    }

    throw error
  }
}

function parseAdminReputationLedger(value: unknown): ReputationLedgerEntry[] {
  try {
    return parseReputationLedger(value)
  } catch (error) {
    if (error instanceof MalformedReputationResponseError) {
      throw new MalformedAdminApiResponseError(error.message.replace('Malformed reputation ledger response', 'Malformed admin API response'))
    }

    throw error
  }
}

function assertNonNegativeFiniteInteger(value: unknown, fieldName: string): number {
  const integerValue = assertFiniteInteger(value, fieldName)

  if (integerValue < 0) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return integerValue
}

function assertIsoTimestamp(value: unknown, fieldName: string): string {
  const stringValue = assertString(value, fieldName)

  if (!Number.isFinite(Date.parse(stringValue))) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return stringValue
}

function isAdminUserActivityType(value: unknown): value is AdminUserActivityType {
  return typeof value === 'string' && ADMIN_USER_ACTIVITY_TYPES.includes(value as AdminUserActivityType)
}

function assertAdminUserActivityType(value: unknown, fieldName: string): AdminUserActivityType {
  if (!isAdminUserActivityType(value)) {
    throw new MalformedAdminApiResponseError(`Malformed admin API response: ${fieldName}`)
  }

  return value
}

function parseAdminUserActivityRoute(value: unknown): AdminUserActivityRoute {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: route')
  }

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function parseAdminUserActivityAvailableTypes(value: unknown): AdminUserActivityType[] {
  if (!Array.isArray(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: available_types')
  }

  return value.map((type) => assertAdminUserActivityType(type, 'available_types'))
}

export function parseAdminUserActivityItem(value: unknown): AdminUserActivityItem {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected activity item object')
  }

  return {
    id: assertString(value.id, 'id'),
    type: assertAdminUserActivityType(value.type, 'type'),
    occurred_at: assertIsoTimestamp(value.occurred_at, 'occurred_at'),
    title: assertString(value.title, 'title'),
    summary: assertString(value.summary, 'summary'),
    target_label: assertString(value.target_label, 'target_label'),
    route: parseAdminUserActivityRoute(value.route),
  }
}

export function parseAdminUserActivityTimeline(value: unknown): AdminUserActivityTimeline {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected activity timeline object')
  }

  const items = value.items

  if (!Array.isArray(items)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: items')
  }

  return {
    items: items.map(parseAdminUserActivityItem),
    count: assertNonNegativeFiniteInteger(value.count, 'count'),
    page: assertNonNegativeFiniteInteger(value.page, 'page'),
    limit: assertNonNegativeFiniteInteger(value.limit, 'limit'),
    available_types: parseAdminUserActivityAvailableTypes(value.available_types),
  }
}

export function parseAdminUserListRow(value: unknown): AdminUserListRow {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected user object')
  }

  return {
    user_id: assertString(value.user_id, 'user_id'),
    user_name: assertString(value.user_name, 'user_name'),
    user_email: assertString(value.user_email, 'user_email'),
    user_role: assertUserRole(value.user_role),
    user_reputation_score: assertNumber(value.user_reputation_score, 'user_reputation_score'),
    user_created_at: assertString(value.user_created_at, 'user_created_at'),
  }
}

export function parseAdminUserList(value: unknown): AdminUserListRow[] {
  if (!Array.isArray(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected user list array')
  }

  return value.map(parseAdminUserListRow)
}

export function parseAdminUserDetail(value: unknown): AdminUserDetail {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected user detail object')
  }

  return {
    ...parseAdminUserListRow(value),
    reputation: parseAdminReputationSummary(value.reputation),
    reputation_ledger: parseAdminReputationLedger(value.reputation_ledger),
  }
}

export function parseAdminReputationPolicyConfig(value: unknown): AdminReputationPolicyConfig {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected reputation policy object')
  }

  return {
    protected_newcomer_window_hours: assertFiniteInteger(
      value.protected_newcomer_window_hours,
      'protected_newcomer_window_hours',
    ),
    max_protected_newcomer_window_hours: assertPositiveFiniteInteger(
      value.max_protected_newcomer_window_hours,
      'max_protected_newcomer_window_hours',
    ),
    updated_at: assertNullableString(value.updated_at, 'updated_at'),
  }
}

export function parseAdminUserReputationLedgerPage(value: unknown): AdminUserReputationLedgerPage {
  if (!isRecord(value)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: expected paginated ledger object')
  }

  const results = value.results
  if (!Array.isArray(results)) {
    throw new MalformedAdminApiResponseError('Malformed admin API response: results')
  }

  return {
    count: assertNonNegativeFiniteInteger(value.count, 'count'),
    next: assertNullableString(value.next, 'next'),
    previous: assertNullableString(value.previous, 'previous'),
    results: results.map((item) => {
      try {
        const parseFn = typeof parseReputationLedger === 'function' ? parseReputationLedger : parseAdminReputationLedger
        return parseFn([item])[0]
      } catch {
        throw new MalformedAdminApiResponseError('Malformed admin API response: ledger entry')
      }
    }),
  }
}

function buildAdminUserListParams(params: FetchAdminUsersParams = {}) {
  const queryParams: Record<string, string | number> = {}
  const search = params.search?.trim()

  if (search) {
    queryParams.search = search
  }

  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    queryParams.limit = Math.max(0, Math.floor(params.limit))
  }

  return Object.keys(queryParams).length > 0 ? { params: queryParams } : undefined
}

function buildAdminUserActivityTimelineParams(params: Pick<FetchAdminUserActivityTimelineParams, 'types' | 'limit' | 'page'> = {}) {
  const queryParams = new URLSearchParams()

  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    queryParams.set('limit', String(Math.max(0, Math.floor(params.limit))))
  }
  
  if (typeof params.page === 'number' && Number.isFinite(params.page)) {
    queryParams.set('page', String(Math.max(1, Math.floor(params.page))))
  }

  params.types?.forEach((type) => {
    if (isAdminUserActivityType(type)) {
      queryParams.append('type', type)
    }
  })

  return queryParams.size > 0 ? { params: queryParams } : undefined
}

export async function fetchAdminUsers(params: FetchAdminUsersParams = {}) {
  const response = await http.get<unknown>('/admin-api/users/', buildAdminUserListParams(params))

  return parseAdminUserList(response.data)
}

export async function fetchAdminUserDetail(userId: string) {
  const response = await http.get<unknown>(`/admin-api/users/${encodeURIComponent(userId)}/`)

  return parseAdminUserDetail(response.data)
}

export async function fetchAdminUserActivityTimeline(params: FetchAdminUserActivityTimelineParams) {
  const response = await http.get<unknown>(
    `/admin-api/users/${encodeURIComponent(params.userId)}/activity/`,
    buildAdminUserActivityTimelineParams(params),
  )

  return parseAdminUserActivityTimeline(response.data)
}

export async function fetchAdminUserReputationLedger(params: FetchAdminUserReputationLedgerParams) {
  const queryParams = new URLSearchParams()
  if (typeof params.page === 'number' && Number.isFinite(params.page)) {
    queryParams.set('page', String(Math.max(1, Math.floor(params.page))))
  }

  const config = queryParams.size > 0 ? { params: queryParams } : undefined
  const response = await http.get<unknown>(`/admin-api/users/${encodeURIComponent(params.userId)}/reputation-ledger/`, config)

  return parseAdminUserReputationLedgerPage(response.data)
}

export async function updateAdminUserManualOverride(params: UpdateAdminUserManualOverrideParams) {
  const response = await http.patch<unknown>(`/admin-api/users/${encodeURIComponent(params.userId)}/reputation-override/`, {
    manual_reputation_level: params.manual_reputation_level,
    note: params.note,
  })

  return parseAdminUserDetail(response.data)
}

export async function fetchAdminReputationPolicyConfig() {
  const response = await http.get<unknown>('/admin-api/reputation-policy/')

  return parseAdminReputationPolicyConfig(response.data)
}

export async function updateAdminReputationPolicyConfig(params: UpdateAdminReputationPolicyConfigParams) {
  const response = await http.patch<unknown>('/admin-api/reputation-policy/', {
    protected_newcomer_window_hours: params.protected_newcomer_window_hours,
  })

  return parseAdminReputationPolicyConfig(response.data)
}
