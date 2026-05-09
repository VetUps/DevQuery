import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation, useQuery } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  fetchNotificationSummary,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  MalformedNotificationResponseError,
  parseMarkAllNotificationsReadResponse,
  parseNotificationCtaUrl,
  parseNotificationEnvelope,
  parseNotificationSummaryResponse,
  type NotificationItem,
} from '@/features/notifications/api/notifications'
import {
  markAllNotificationsReadMutationKey,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/features/notifications/mutations/useMarkNotificationReadMutation'
import {
  notificationQueryKeys,
  useNotificationSummaryQuery,
  useNotificationsQuery,
} from '@/features/notifications/queries/useNotificationsQuery'
import { http } from '@/shared/api/http'

vi.mock('@/shared/api/http', () => ({
  http: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()

  return {
    ...actual,
    useQuery: vi.fn((options) => options),
    useMutation: vi.fn((options) => options),
  }
})

const mockedHttp = vi.mocked(http)

function buildNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: '11111111-1111-4111-8111-111111111111',
    notification_type: 'expert_invitation',
    title: 'Вас пригласили ответить',
    message: 'Новый защищённый вопрос ждёт экспертного ответа.',
    payload: {
      question_title: 'How to type Vue Query?',
      author_name: 'Ada',
    },
    source_question_id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-05-08T10:00:00Z',
    read_at: null,
    expires_at: '2026-05-09T10:00:00Z',
    is_read: false,
    is_expired: false,
    invitation_status: 'active',
    protected_window_active: true,
    protected_window_ended: false,
    protected_until: '2026-05-08T22:00:00Z',
    cta_url: '/questions/22222222-2222-4222-8222-222222222222',
    ...overrides,
  }
}

function buildEnvelope(results: unknown[] = [buildNotification()]) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  }
}

function buildSummary(latest: unknown[] = [buildNotification()]) {
  return {
    unread_count: latest.length,
    latest,
  }
}

describe('notifications API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('parses recipient notification pagination envelopes and normalizes nullable payloads', () => {
    const parsed = parseNotificationEnvelope(buildEnvelope([
      buildNotification({ payload: null, read_at: '2026-05-08T11:00:00Z', is_read: true }),
      buildNotification({
        notification_id: '33333333-3333-4333-8333-333333333333',
        source_question_id: null,
        expires_at: null,
        invitation_status: null,
        protected_until: null,
        cta_url: null,
      }),
    ]))

    expect(parsed).toEqual({
      count: 2,
      next: null,
      previous: null,
      results: [
        buildNotification({ payload: {}, read_at: '2026-05-08T11:00:00Z', is_read: true }),
        buildNotification({
          notification_id: '33333333-3333-4333-8333-333333333333',
          source_question_id: null,
          expires_at: null,
          invitation_status: null,
          protected_until: null,
          cta_url: null,
        }),
      ],
    })
  })

  it('parses summary responses through the item parser and supports empty latest previews', () => {
    const latest = buildNotification({ cta_url: 'https://evil.example.test/phish' })

    expect(parseNotificationSummaryResponse({ unread_count: 0, latest: [] })).toEqual({
      unread_count: 0,
      latest: [],
    })
    expect(parseNotificationSummaryResponse(buildSummary([latest]))).toEqual({
      unread_count: 1,
      latest: [buildNotification({ cta_url: null })],
    })
  })

  it('parses mark-all-read counters from the server-confirmed response', () => {
    expect(parseMarkAllNotificationsReadResponse({ marked_count: 3, unread_count: 0 })).toEqual({
      marked_count: 3,
      unread_count: 0,
    })
  })

  it('fetches notifications with optional status/page query params and parses the envelope', async () => {
    mockedHttp.get.mockResolvedValue({ data: buildEnvelope() })

    await expect(fetchNotifications()).resolves.toEqual(buildEnvelope())
    await expect(fetchNotifications({ status: 'unread', page: 2 })).resolves.toEqual(buildEnvelope())

    expect(mockedHttp.get).toHaveBeenNthCalledWith(1, '/notifications/')
    expect(mockedHttp.get).toHaveBeenNthCalledWith(2, '/notifications/', { params: { status: 'unread', page: 2 } })
  })

  it('fetches notification summary and parses the response', async () => {
    mockedHttp.get.mockResolvedValue({ data: buildSummary() })

    await expect(fetchNotificationSummary()).resolves.toEqual(buildSummary())

    expect(mockedHttp.get).toHaveBeenCalledWith('/notifications/summary/')
  })

  it('marks one notification read and parses the returned item', async () => {
    const readNotification = buildNotification({
      read_at: '2026-05-08T11:00:00Z',
      is_read: true,
    })
    mockedHttp.patch.mockResolvedValue({ data: readNotification })

    await expect(markNotificationRead(readNotification.notification_id)).resolves.toEqual(readNotification)

    expect(mockedHttp.patch).toHaveBeenCalledWith(`/notifications/${readNotification.notification_id}/read/`)
  })

  it('marks all notifications read through the bulk endpoint and parses counters', async () => {
    mockedHttp.patch.mockResolvedValue({ data: { marked_count: 2, unread_count: 0 } })

    await expect(markAllNotificationsRead()).resolves.toEqual({ marked_count: 2, unread_count: 0 })

    expect(mockedHttp.patch).toHaveBeenCalledWith('/notifications/read-all/')
  })

  it('rejects malformed pagination envelopes and item fields with typed parser errors', () => {
    expect(() => parseNotificationEnvelope({ count: 1, next: null, previous: null })).toThrow(
      MalformedNotificationResponseError,
    )
    expect(() => parseNotificationEnvelope({ ...buildEnvelope(), results: {} })).toThrow('results must be an array')
    expect(() => parseNotificationEnvelope(buildEnvelope([{ ...buildNotification(), notification_id: undefined }]))).toThrow(
      'results[0].notification_id must be a string',
    )
    expect(() => parseNotificationEnvelope(buildEnvelope([{ ...buildNotification(), is_read: 'false' }]))).toThrow(
      'results[0].is_read must be a boolean',
    )
    expect(() => parseNotificationEnvelope(buildEnvelope([{ ...buildNotification(), created_at: 'not-a-date' }]))).toThrow(
      'results[0].created_at must be an ISO datetime string',
    )
    expect(() => parseNotificationEnvelope(buildEnvelope([{ ...buildNotification(), payload: [] }]))).toThrow(
      'results[0].payload must be an object or null',
    )
  })

  it('rejects malformed summary and mark-all responses with field-specific parser errors', () => {
    expect(() => parseNotificationSummaryResponse({ unread_count: '1', latest: [] })).toThrow(
      'summary.unread_count must be a number',
    )
    expect(() => parseNotificationSummaryResponse({ unread_count: 1, latest: {} })).toThrow(
      'summary.latest must be an array',
    )
    expect(() => parseNotificationSummaryResponse(buildSummary([{ ...buildNotification(), title: null }]))).toThrow(
      'summary.latest[0].title must be a string',
    )
    expect(() => parseMarkAllNotificationsReadResponse({ unread_count: 0 })).toThrow(
      'mark_all.marked_count must be a number',
    )
    expect(() => parseMarkAllNotificationsReadResponse({ marked_count: 1 })).toThrow(
      'mark_all.unread_count must be a number',
    )
  })

  it('normalizes notification CTAs to local question-detail routes only', () => {
    const questionUrl = '/questions/22222222-2222-4222-8222-222222222222'

    expect(parseNotificationCtaUrl(questionUrl)).toBe(questionUrl)
    expect(parseNotificationEnvelope(buildEnvelope([buildNotification({ cta_url: questionUrl })])).results[0]?.cta_url).toBe(
      questionUrl,
    )

    const unsafeValues: unknown[] = [
      'https://example.test/questions/22222222-2222-4222-8222-222222222222',
      '//example.test/questions/22222222-2222-4222-8222-222222222222',
      '/admin',
      '/questions/../admin',
      '',
      42,
    ]

    for (const ctaUrl of unsafeValues) {
      expect(parseNotificationCtaUrl(ctaUrl)).toBeNull()
      expect(parseNotificationEnvelope(buildEnvelope([{ ...buildNotification(), cta_url: ctaUrl }])).results[0]?.cta_url).toBeNull()
    }
  })

  it('propagates rejected summary, list, and mark-all requests without hiding Vue Query error state', async () => {
    mockedHttp.get.mockRejectedValueOnce(new Error('list timeout'))
    mockedHttp.get.mockRejectedValueOnce(new Error('summary timeout'))
    mockedHttp.patch.mockRejectedValueOnce(new Error('mark-all timeout'))

    await expect(fetchNotifications()).rejects.toThrow('list timeout')
    await expect(fetchNotificationSummary()).rejects.toThrow('summary timeout')
    await expect(markAllNotificationsRead()).rejects.toThrow('mark-all timeout')
  })

  it('exposes status/page-aware list keys and a distinct summary query key', () => {
    const listQueryOptions = useNotificationsQuery({ status: 'unread', page: 2 }, false)
    const legacyEnabledOnlyOptions = useNotificationsQuery(false)
    const summaryQueryOptions = useNotificationSummaryQuery(false)

    expect(useQuery).toHaveBeenNthCalledWith(1, expect.objectContaining({
      queryKey: ['notifications', 'list', { status: 'unread', page: 2 }],
      enabled: false,
    }))
    expect(listQueryOptions.queryKey).toEqual(['notifications', 'list', { status: 'unread', page: 2 }])
    expect(legacyEnabledOnlyOptions.queryKey).toEqual(['notifications', 'list', { status: 'all', page: 1 }])
    expect(summaryQueryOptions.queryKey).toEqual(['notifications', 'summary'])
    expect(notificationQueryKeys.lists()).toEqual(['notifications', 'list'])
  })

  it('invalidates all notification caches only after server-confirmed read mutations succeed', async () => {
    const markOneOptions = useMarkNotificationReadMutation()
    const markAllOptions = useMarkAllNotificationsReadMutation()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)

    expect(useMutation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      mutationKey: ['notifications', 'mark-read'],
      mutationFn: markNotificationRead,
    }))
    expect(useMutation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      mutationKey: markAllNotificationsReadMutationKey,
      mutationFn: markAllNotificationsRead,
    }))

    expect(invalidateSpy).not.toHaveBeenCalled()

    await expect(markOneOptions.onSuccess?.(buildNotification(), 'notification-1', undefined)).resolves.toBeUndefined()
    await expect(markAllOptions.onSuccess?.({ marked_count: 1, unread_count: 0 }, undefined, undefined)).resolves.toBeUndefined()

    expect(invalidateSpy).toHaveBeenCalledTimes(2)
    expect(invalidateSpy).toHaveBeenNthCalledWith(1, { queryKey: ['notifications'] })
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, { queryKey: ['notifications'] })
  })
})
