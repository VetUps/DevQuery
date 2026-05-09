import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'

import {
  fetchNotificationSummary,
  fetchNotifications,
  type FetchNotificationsParams,
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
  summary: () => [...notificationQueryKeys.all, 'summary'] as const,
}

export const notificationsQueryKey = notificationQueryKeys.list()
export const notificationSummaryQueryKey = notificationQueryKeys.summary()

type UseNotificationsQueryFirstArg = FetchNotificationsParams | MaybeRefOrGetter<boolean>

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

export function useNotificationSummaryQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: notificationQueryKeys.summary(),
    queryFn: fetchNotificationSummary,
    enabled,
  })
}
