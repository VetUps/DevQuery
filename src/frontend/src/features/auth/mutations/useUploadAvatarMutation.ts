import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { uploadAvatar } from '../api/auth'
import { CURRENT_USER_QUERY_KEY } from '../queries/useCurrentUserQuery'
import { useSessionStore } from '../stores/session'

export function useUploadAvatarMutation() {
  const queryClient = useQueryClient()
  const sessionStore = useSessionStore()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!sessionStore.accessToken) {
        throw new Error('Not authenticated')
      }
      return uploadAvatar(file, sessionStore.accessToken)
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, updatedProfile)
      queryClient.invalidateQueries({ queryKey: ['publicProfile', updatedProfile.user_id] })
    },
  })
}