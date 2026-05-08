import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useMutation, useQuery } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  fetchNotifications,
  markNotificationRead,
  MalformedNotificationResponseError,
  parseNotificationCtaUrl,
  parseNotificationEnvelope,
  type NotificationItem,
} from '@/features/notifications/api/notifications'
import { useMarkNotificationReadMutation } from '@/features/notifications/mutations/useMarkNotificationReadMutation'
import { useNotificationsQuery } from '@/features/notifications/queries/useNotificationsQuery'
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

  it('fetches notifications from the recipient-scoped list endpoint and parses the envelope', async () => {
    mockedHttp.get.mockResolvedValue({ data: buildEnvelope() })

    await expect(fetchNotifications()).resolves.toEqual(buildEnvelope())

    expect(mockedHttp.get).toHaveBeenCalledWith('/notifications/')
  })

  it('marks notifications read through the server-confirmed endpoint and parses the returned item', async () => {
    const readNotification = buildNotification({
      read_at: '2026-05-08T11:00:00Z',
      is_read: true,
    })
    mockedHttp.patch.mockResolvedValue({ data: readNotification })

    await expect(markNotificationRead(readNotification.notification_id)).resolves.toEqual(readNotification)

    expect(mockedHttp.patch).toHaveBeenCalledWith(`/notifications/${readNotification.notification_id}/read/`)
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

  it('propagates rejected GET and PATCH requests without hiding Vue Query error state', async () => {
    mockedHttp.get.mockRejectedValueOnce(new Error('GET timeout'))
    mockedHttp.patch.mockRejectedValueOnce(new Error('PATCH timeout'))

    await expect(fetchNotifications()).rejects.toThrow('GET timeout')
    await expect(markNotificationRead('notification-1')).rejects.toThrow('PATCH timeout')
  })

  it('exposes stable query and mutation keys and invalidates only after mark-read success', async () => {
    const queryOptions = useNotificationsQuery(false)
    const mutationOptions = useMarkNotificationReadMutation()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)

    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['notifications', 'list'],
      enabled: false,
      queryFn: fetchNotifications,
    }))
    expect(queryOptions.queryKey).toEqual(['notifications', 'list'])

    expect(useMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutationKey: ['notifications', 'mark-read'],
      mutationFn: markNotificationRead,
    }))

    await expect(mutationOptions.onSuccess?.(buildNotification(), 'notification-1', undefined)).resolves.toBeUndefined()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications', 'list'] })
  })
})
