import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import { markNotificationRead } from '@/features/notifications/api/notifications'
import { notificationsQueryKey } from '@/features/notifications/queries/useNotificationsQuery'

export const markNotificationReadMutationKey = ['notifications', 'mark-read'] as const

export function useMarkNotificationReadMutation() {
  return useMutation({
    mutationKey: markNotificationReadMutationKey,
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey })
    },
  })
}
