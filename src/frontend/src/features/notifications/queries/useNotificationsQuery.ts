import { useQuery } from '@tanstack/vue-query'

import { fetchNotifications } from '@/features/notifications/api/notifications'

export const notificationsQueryKey = ['notifications', 'list'] as const

export function useNotificationsQuery(enabled = true) {
  return useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    enabled,
  })
}
