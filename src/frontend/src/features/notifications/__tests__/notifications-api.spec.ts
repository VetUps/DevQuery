import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/vue-query'

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
import { getInvitationPresentation } from '@/features/notifications/libs/invitationPresentation'
import {
  markAllNotificationsReadMutationKey,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/features/notifications/mutations/useMarkNotificationReadMutation'
import {
  notificationQueryKeys,
  useNotificationSummaryQuery,
  useNotificationsQuery,
  useProfileNotificationsQuery,
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
    useInfiniteQuery: vi.fn((options) => options),
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

  it('maps active invitation notifications to safe presentation copy and CTA policy', () => {
    const notification = buildNotification()

    expect(getInvitationPresentation(notification)).toMatchObject({
      state: 'active',
      label: 'Приглашение активно',
      canRenderCta: true,
      ctaUrl: '/questions/22222222-2222-4222-8222-222222222222',
      ctaLabel: 'Перейти к вопросу',
      unavailableCtaLabel: 'Переход к вопросу недоступен',
    })
    expect(getInvitationPresentation(notification).helpText).toContain('Защищённое окно активно до')
  })

  it('keeps active invitations actionable even when no protected-until timestamp is present', () => {
    const presentation = getInvitationPresentation(buildNotification({
      protected_window_active: false,
      protected_until: null,
    }))

    expect(presentation).toMatchObject({
      state: 'active',
      label: 'Приглашение активно',
      helpText: 'Приглашение активно. Перейдите к вопросу и помогите автору.',
      canRenderCta: true,
      ctaUrl: '/questions/22222222-2222-4222-8222-222222222222',
    })
  })

  it.each([
    [
      'expired server fields',
      buildNotification({
        is_expired: true,
        invitation_status: 'active',
        cta_url: '/questions/22222222-2222-4222-8222-222222222222',
        payload: { invitation_status: 'active' },
      }),
      {
        state: 'expired',
        label: 'Приглашение истекло',
        helpText: 'Срок приглашения истёк. Ответить по этому приглашению уже нельзя.',
      },
    ],
    [
      'protected-window-ended server fields',
      buildNotification({
        protected_window_ended: true,
        invitation_status: 'active',
        cta_url: '/questions/22222222-2222-4222-8222-222222222222',
        payload: { protected_window_ended: false },
      }),
      {
        state: 'protected_ended',
        label: 'Окно защиты завершено',
        helpText: 'Защищённое окно завершено. Вопрос может быть открыт для более широкого круга участников.',
      },
    ],
    [
      'unavailable missing context',
      buildNotification({
        invitation_status: 'unavailable',
        source_question_id: null,
        protected_until: null,
        cta_url: null,
      }),
      {
        state: 'unavailable',
        label: 'Приглашение недоступно',
        helpText: 'Контекст приглашения недоступен или больше не позволяет перейти к экспертному ответу.',
      },
    ],
    [
      'unknown status fallback',
      buildNotification({
        invitation_status: 'future_status',
        cta_url: '/questions/22222222-2222-4222-8222-222222222222',
      }),
      {
        state: 'unavailable',
        label: 'Приглашение недоступно',
        helpText: 'Контекст приглашения недоступен или больше не позволяет перейти к экспертному ответу.',
      },
    ],
    [
      'null status fallback',
      buildNotification({
        invitation_status: null,
        cta_url: '/questions/22222222-2222-4222-8222-222222222222',
      }),
      {
        state: 'unavailable',
        label: 'Приглашение недоступно',
        helpText: 'Контекст приглашения недоступен или больше не позволяет перейти к экспертному ответу.',
      },
    ],
  ])('maps %s to honest unavailable/non-actionable presentation when needed', (_caseName, notification, expected) => {
    expect(getInvitationPresentation(notification)).toMatchObject({
      ...expected,
      canRenderCta: false,
      ctaUrl: null,
    })
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

  it('exposes status/page-aware list keys, status-separated profile keys, and a distinct summary query key', () => {
    const listQueryOptions = useNotificationsQuery({ status: 'unread', page: 2 }, false)
    const legacyEnabledOnlyOptions = useNotificationsQuery(false)
    const profileAllOptions = useProfileNotificationsQuery('all', false)
    const profileUnreadOptions = useProfileNotificationsQuery('unread', false)
    const summaryQueryOptions = useNotificationSummaryQuery(false)

    expect(useQuery).toHaveBeenNthCalledWith(1, expect.objectContaining({
      queryKey: ['notifications', 'list', { status: 'unread', page: 2 }],
      enabled: false,
    }))
    expect(useInfiniteQuery).toHaveBeenNthCalledWith(1, expect.objectContaining({
      queryKey: ['notifications', 'profile-list', { status: 'all' }],
      initialPageParam: 1,
      enabled: false,
    }))
    expect(useInfiniteQuery).toHaveBeenNthCalledWith(2, expect.objectContaining({
      queryKey: ['notifications', 'profile-list', { status: 'unread' }],
      initialPageParam: 1,
      enabled: false,
    }))
    expect(listQueryOptions.queryKey).toEqual(['notifications', 'list', { status: 'unread', page: 2 }])
    expect(legacyEnabledOnlyOptions.queryKey).toEqual(['notifications', 'list', { status: 'all', page: 1 }])
    expect(profileAllOptions.queryKey).toEqual(['notifications', 'profile-list', { status: 'all' }])
    expect(profileUnreadOptions.queryKey).toEqual(['notifications', 'profile-list', { status: 'unread' }])
    expect(summaryQueryOptions.queryKey).toEqual(['notifications', 'summary'])
    expect(notificationQueryKeys.lists()).toEqual(['notifications', 'list'])
    expect(notificationQueryKeys.profileList('unread')).toEqual(['notifications', 'profile-list', { status: 'unread' }])
  })

  it('fetches profile notification pages through explicit page params and derives the next page from the envelope', async () => {
    const profileOptions = useProfileNotificationsQuery('unread', false)
    const firstPage = buildEnvelope([buildNotification()])
    firstPage.next = 'http://localhost/api/notifications/?status=unread&page=2'
    const secondPage = buildEnvelope([buildNotification({ notification_id: '33333333-3333-4333-8333-333333333333' })])

    mockedHttp.get.mockResolvedValueOnce({ data: firstPage })
    await expect(profileOptions.queryFn({ pageParam: 1 })).resolves.toEqual(firstPage)
    expect(mockedHttp.get).toHaveBeenCalledWith('/notifications/', { params: { status: 'unread', page: 1 } })
    expect(profileOptions.getNextPageParam(firstPage, [firstPage])).toBe(2)

    mockedHttp.get.mockResolvedValueOnce({ data: secondPage })
    await expect(profileOptions.queryFn({ pageParam: 2 })).resolves.toEqual(secondPage)
    expect(mockedHttp.get).toHaveBeenLastCalledWith('/notifications/', { params: { status: 'unread', page: 2 } })
  })

  it('keeps empty terminal profile pages intact without scheduling extra fetches', () => {
    const profileOptions = useProfileNotificationsQuery('all', false)
    const emptyPage = buildEnvelope([])

    expect(profileOptions.getNextPageParam(emptyPage, [emptyPage])).toBeUndefined()
  })

  it('propagates malformed and rejected profile list pages through Vue Query', async () => {
    const profileOptions = useProfileNotificationsQuery('unread', false)

    mockedHttp.get.mockResolvedValueOnce({ data: { count: 1, next: null, previous: null, results: {} } })
    mockedHttp.get.mockRejectedValueOnce(new Error('profile list timeout'))

    await expect(profileOptions.queryFn({ pageParam: 1 })).rejects.toThrow(MalformedNotificationResponseError)
    await expect(profileOptions.queryFn({ pageParam: 2 })).rejects.toThrow('profile list timeout')
  })

  it('exposes flattened profile notifications and initial/stale/load-more state refs', () => {
    const firstNotification = buildNotification()
    const secondNotification = buildNotification({ notification_id: '33333333-3333-4333-8333-333333333333' })

    vi.mocked(useInfiniteQuery).mockReturnValueOnce({
      data: ref({ pages: [buildEnvelope([firstNotification]), buildEnvelope([secondNotification])] }),
      isPending: ref(false),
      isError: ref(true),
      isFetchingNextPage: ref(true),
      isFetchNextPageError: ref(true),
    } as never)

    const profileQuery = useProfileNotificationsQuery('unread', false)

    expect(profileQuery.pages.value).toHaveLength(2)
    expect(profileQuery.notifications.value).toEqual([firstNotification, secondNotification])
    expect(profileQuery.totalCount.value).toBe(1)
    expect(profileQuery.hasLoadedPages.value).toBe(true)
    expect(profileQuery.hasLoadedNotifications.value).toBe(true)
    expect(profileQuery.isInitialLoading.value).toBe(false)
    expect(profileQuery.isInitialError.value).toBe(false)
    expect(profileQuery.isStaleError.value).toBe(true)
    expect(profileQuery.isLoadMorePending.value).toBe(true)
    expect(profileQuery.isLoadMoreError.value).toBe(true)
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
