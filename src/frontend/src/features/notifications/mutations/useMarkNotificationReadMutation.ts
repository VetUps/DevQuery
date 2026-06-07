// Кратко: держит основную логику этого файла.
import { useMutation } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/notifications/api/notifications'
import { notificationQueryKeys } from '@/features/notifications/queries/useNotificationsQuery'

export const markNotificationReadMutationKey = ['notifications', 'mark-read'] as const
export const markAllNotificationsReadMutationKey = ['notifications', 'mark-all-read'] as const

async function invalidateNotificationQueries() {
  await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all })
}

export function useMarkNotificationReadMutation() {
  return useMutation({
    mutationKey: markNotificationReadMutationKey,
    mutationFn: markNotificationRead,
    onSuccess: invalidateNotificationQueries,
  })
}

export function useMarkAllNotificationsReadMutation() {
  return useMutation({
    mutationKey: markAllNotificationsReadMutationKey,
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidateNotificationQueries,
  })
}
