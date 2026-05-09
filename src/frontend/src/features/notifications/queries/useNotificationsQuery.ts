import { useInfiniteQuery, useQuery } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

import {
  fetchNotificationSummary,
  fetchNotifications,
  type FetchNotificationsParams,
  type NotificationItem,
  type PaginatedNotificationResponse,
  type NotificationListStatus,
} from '@/features/notifications/api/notifications'

export interface NotificationListQueryState {
  status: NotificationListStatus
  page: number
}

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationQueryKeys.all, 'list'] as const,
  list: (params: FetchNotificationsParams = {}) => [
    ...notificationQueryKeys.lists(),
    {
      status: params.status ?? 'all',
      page: params.page ?? 1,
    } satisfies NotificationListQueryState,
  ] as const,
  profileLists: () => [...notificationQueryKeys.all, 'profile-list'] as const,
  profileList: (status: NotificationListStatus = 'all') => [
    ...notificationQueryKeys.profileLists(),
    {
      status,
    },
  ] as const,
  summary: () => [...notificationQueryKeys.all, 'summary'] as const,
}

export const notificationsQueryKey = notificationQueryKeys.list()
export const notificationSummaryQueryKey = notificationQueryKeys.summary()

type UseNotificationsQueryFirstArg = FetchNotificationsParams | MaybeRefOrGetter<boolean>

type ProfileNotificationsQueryData = {
  pages?: PaginatedNotificationResponse[]
}

type ProfileNotificationsQueryResult = {
  data: { value: ProfileNotificationsQueryData | undefined }
  isPending: { value: boolean }
  isError: { value: boolean }
  isFetchingNextPage: { value: boolean }
  isFetchNextPageError: { value: boolean }
}

function isEnabledOnlyArgument(value: UseNotificationsQueryFirstArg | undefined): value is MaybeRefOrGetter<boolean> {
  if (typeof value === 'boolean' || typeof value === 'function') {
    return true
  }

  return typeof value === 'object' && value !== null && 'value' in value && typeof value.value === 'boolean'
}

export function useNotificationsQuery(enabled?: MaybeRefOrGetter<boolean>): ReturnType<typeof useQuery>
export function useNotificationsQuery(
  params?: FetchNotificationsParams,
  enabled?: MaybeRefOrGetter<boolean>,
): ReturnType<typeof useQuery>
export function useNotificationsQuery(
  firstArg: UseNotificationsQueryFirstArg = {},
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const params = isEnabledOnlyArgument(firstArg) ? {} : firstArg
  const resolvedEnabled = isEnabledOnlyArgument(firstArg) ? firstArg : enabled

  return useQuery({
    queryKey: notificationQueryKeys.list(params),
    queryFn: () => fetchNotifications(params),
    enabled: resolvedEnabled,
  })
}

function deriveNextNotificationPage(lastPage: PaginatedNotificationResponse, loadedPageCount: number) {
  if (lastPage.next === null) {
    return undefined
  }

  try {
    const nextUrl = new URL(lastPage.next, 'http://localhost')
    const nextPage = Number(nextUrl.searchParams.get('page'))

    if (Number.isInteger(nextPage) && nextPage > 0) {
      return nextPage
    }
  } catch {
    // Fall through to the sequential page fallback for opaque but truthy next cursors.
  }

  return loadedPageCount + 1
}

function getProfileNotificationsPages(query: ProfileNotificationsQueryResult) {
  return query.data.value?.pages ?? []
}

export function useProfileNotificationsQuery(
  status: MaybeRefOrGetter<NotificationListStatus> = 'all',
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const resolvedStatus = () => toValue(status)
  const queryKey = typeof status === 'string'
    ? notificationQueryKeys.profileList(status)
    : computed(() => notificationQueryKeys.profileList(resolvedStatus()))

  const query = useInfiniteQuery<
    PaginatedNotificationResponse,
    Error,
    ProfileNotificationsQueryData,
    ReturnType<typeof notificationQueryKeys.profileList>,
    number
  >({
    queryKey,
    queryFn: ({ pageParam }) => fetchNotifications({
      status: resolvedStatus(),
      page: pageParam,
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => deriveNextNotificationPage(lastPage, allPages.length),
    enabled,
  })

  const pages = computed(() => getProfileNotificationsPages(query))
  const notifications = computed<NotificationItem[]>(() => pages.value.flatMap((page) => page.results))
  const totalCount = computed(() => pages.value[0]?.count ?? 0)
  const hasLoadedPages = computed(() => pages.value.length > 0)
  const hasLoadedNotifications = computed(() => notifications.value.length > 0)
  const isInitialLoading = computed(() => query.isPending.value && !hasLoadedPages.value)
  const isInitialError = computed(() => query.isError.value && !hasLoadedPages.value)
  const isStaleError = computed(() => query.isError.value && hasLoadedPages.value)
  const isLoadMorePending = computed(() => query.isFetchingNextPage.value)
  const isLoadMoreError = computed(() => query.isFetchNextPageError.value)

  return {
    ...query,
    pages,
    notifications,
    totalCount,
    hasLoadedPages,
    hasLoadedNotifications,
    isInitialLoading,
    isInitialError,
    isStaleError,
    isLoadMorePending,
    isLoadMoreError,
  }
}

export function useNotificationSummaryQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: notificationQueryKeys.summary(),
    queryFn: fetchNotificationSummary,
    enabled,
  })
}
