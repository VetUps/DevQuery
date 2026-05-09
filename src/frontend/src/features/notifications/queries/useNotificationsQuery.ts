import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'

import { fetchNotifications } from '@/features/notifications/api/notifications'

export const notificationsQueryKey = ['notifications', 'list'] as const

export function useNotificationsQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    enabled,
  })
}
