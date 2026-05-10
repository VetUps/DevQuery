import { http } from '@/shared/api/http'

export interface PaginatedNotificationResponse<T = NotificationItem> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type NotificationListStatus = 'all' | 'unread'

export interface FetchNotificationsParams {
  status?: NotificationListStatus
  page?: number
}

export type NotificationPayload = Record<string, unknown>
export type NotificationInvitationStatus = 'active' | 'expired' | 'protected_ended' | 'unavailable' | (string & {})

export interface NotificationItem {
  notification_id: string
  notification_type: string
  title: string
  message: string
  payload: NotificationPayload
  source_question_id: string | null
  created_at: string
  read_at: string | null
  expires_at: string | null
  is_read: boolean
  is_expired: boolean
  invitation_status: NotificationInvitationStatus | null
  protected_window_active: boolean
  protected_window_ended: boolean
  protected_until: string | null
  cta_url: string | null
}

export interface NotificationSummaryResponse {
  unread_count: number
  latest: NotificationItem[]
}

export interface MarkAllNotificationsReadResponse {
  marked_count: number
  unread_count: number
}

export class MalformedNotificationResponseError extends Error {
  constructor(message: string) {
    super(`Malformed notification response: ${message}`)
    this.name = 'MalformedNotificationResponseError'
  }
}

const LOCAL_QUESTION_CTA_PATTERN = /^\/questions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function parseNotificationCtaUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const ctaUrl = value.trim()

  if (!LOCAL_QUESTION_CTA_PATTERN.test(ctaUrl)) {
    return null
  }

  return ctaUrl
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new MalformedNotificationResponseError(`${path} must be an object`)
  }
}

function parseString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MalformedNotificationResponseError(`${path} must be a string`)
  }

  return value
}

function parseNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null
  }

  return parseString(value, path)
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new MalformedNotificationResponseError(`${path} must be a boolean`)
  }

  return value
}

function parseNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MalformedNotificationResponseError(`${path} must be a number`)
  }

  return value
}

function parseNullableCtaUrl(value: unknown): string | null {
  return parseNotificationCtaUrl(value)
}

function parseDateTime(value: unknown, path: string): string {
  const dateTime = parseString(value, path)

  if (Number.isNaN(Date.parse(dateTime))) {
    throw new MalformedNotificationResponseError(`${path} must be an ISO datetime string`)
  }

  return dateTime
}

function parseNullableDateTime(value: unknown, path: string): string | null {
  if (value === null) {
    return null
  }

  return parseDateTime(value, path)
}

function parsePayload(value: unknown, path: string): NotificationPayload {
  if (value === null) {
    return {}
  }

  if (!isRecord(value)) {
    throw new MalformedNotificationResponseError(`${path} must be an object or null`)
  }

  return { ...value }
}

export function parseNotificationItem(value: unknown, path = 'notification'): NotificationItem {
  assertRecord(value, path)

  return {
    notification_id: parseString(value.notification_id, `${path}.notification_id`),
    notification_type: parseString(value.notification_type, `${path}.notification_type`),
    title: parseString(value.title, `${path}.title`),
    message: parseString(value.message, `${path}.message`),
    payload: parsePayload(value.payload, `${path}.payload`),
    source_question_id: parseNullableString(value.source_question_id, `${path}.source_question_id`),
    created_at: parseDateTime(value.created_at, `${path}.created_at`),
    read_at: parseNullableDateTime(value.read_at, `${path}.read_at`),
    expires_at: parseNullableDateTime(value.expires_at, `${path}.expires_at`),
    is_read: parseBoolean(value.is_read, `${path}.is_read`),
    is_expired: parseBoolean(value.is_expired, `${path}.is_expired`),
    invitation_status: parseNullableString(value.invitation_status, `${path}.invitation_status`),
    protected_window_active: parseBoolean(value.protected_window_active, `${path}.protected_window_active`),
    protected_window_ended: parseBoolean(value.protected_window_ended, `${path}.protected_window_ended`),
    protected_until: parseNullableDateTime(value.protected_until, `${path}.protected_until`),
    cta_url: parseNullableCtaUrl(value.cta_url),
  }
}

export function parseNotificationEnvelope(value: unknown): PaginatedNotificationResponse {
  assertRecord(value, 'envelope')

  const count = parseNumber(value.count, 'count')
  const next = parseNullableString(value.next, 'next')
  const previous = parseNullableString(value.previous, 'previous')

  if (!Array.isArray(value.results)) {
    throw new MalformedNotificationResponseError('results must be an array')
  }

  return {
    count,
    next,
    previous,
    results: value.results.map((item, index) => parseNotificationItem(item, `results[${index}]`)),
  }
}

export function parseNotificationSummaryResponse(value: unknown): NotificationSummaryResponse {
  assertRecord(value, 'summary')

  const unreadCount = parseNumber(value.unread_count, 'summary.unread_count')

  if (!Array.isArray(value.latest)) {
    throw new MalformedNotificationResponseError('summary.latest must be an array')
  }

  return {
    unread_count: unreadCount,
    latest: value.latest.map((item, index) => parseNotificationItem(item, `summary.latest[${index}]`)),
  }
}

export function parseMarkAllNotificationsReadResponse(value: unknown): MarkAllNotificationsReadResponse {
  assertRecord(value, 'mark_all')

  return {
    marked_count: parseNumber(value.marked_count, 'mark_all.marked_count'),
    unread_count: parseNumber(value.unread_count, 'mark_all.unread_count'),
  }
}

function buildNotificationListQueryParams(params: FetchNotificationsParams) {
  const queryParams: Record<string, NotificationListStatus | number> = {}

  if (params.status && params.status !== 'all') {
    queryParams.status = params.status
  }

  if (params.page !== undefined) {
    queryParams.page = params.page
  }

  return queryParams
}

export async function fetchNotifications(params: FetchNotificationsParams = {}) {
  const queryParams = buildNotificationListQueryParams(params)
  const response = Object.keys(queryParams).length > 0
    ? await http.get<unknown>('/notifications/', { params: queryParams })
    : await http.get<unknown>('/notifications/')

  return parseNotificationEnvelope(response.data)
}

export async function fetchNotificationSummary() {
  const response = await http.get<unknown>('/notifications/summary/')

  return parseNotificationSummaryResponse(response.data)
}

export async function markNotificationRead(notificationId: string) {
  const response = await http.patch<unknown>(`/notifications/${notificationId}/read/`)

  return parseNotificationItem(response.data, 'notification')
}

export async function markAllNotificationsRead() {
  const response = await http.patch<unknown>('/notifications/read-all/')

  return parseMarkAllNotificationsReadResponse(response.data)
}
