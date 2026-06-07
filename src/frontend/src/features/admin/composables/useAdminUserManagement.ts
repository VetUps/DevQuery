// Кратко: держит основную логику этого файла.
import { computed, readonly, ref, shallowRef } from 'vue'

import {
  fetchAdminUserDetail,
  fetchAdminUsers,
  updateAdminUserManualOverride,
  type AdminUserDetail,
  type AdminUserListRow,
  type UpdateAdminUserManualOverrideParams,
} from '@/features/admin/api/admin'

const DEFAULT_USER_LIMIT = 25
const SAFE_LIST_ERROR = 'Не удалось загрузить пользователей. Проверьте соединение и попробуйте снова.'
const SAFE_DETAIL_ERROR = 'Не удалось загрузить детали пользователя. Повторите попытку.'
const SAFE_OVERRIDE_ERROR = 'Не удалось сохранить ручной уровень. Проверьте поля и попробуйте снова.'
const SAFE_OVERRIDE_SUCCESS = 'Ручной уровень сохранён. Журнал репутации обновлён.'

export function useAdminUserManagement() {
  const searchText = shallowRef('')
  const users = ref<AdminUserListRow[]>([])
  const selectedUserId = shallowRef<string | null>(null)
  const selectedUserDetail = ref<AdminUserDetail | null>(null)

  const isListLoading = shallowRef(false)
  const listError = shallowRef('')
  const isDetailLoading = shallowRef(false)
  const detailError = shallowRef('')
  const isOverrideSaving = shallowRef(false)
  const overrideError = shallowRef('')
  const overrideSuccess = shallowRef('')

  let listRequestId = 0
  let detailRequestId = 0

  const hasUsers = computed(() => users.value.length > 0)
  const selectedUser = computed(() => users.value.find((user) => user.user_id === selectedUserId.value) ?? null)

  async function loadUsers() {
    const requestId = ++listRequestId
    isListLoading.value = true
    listError.value = ''

    try {
      const result = await fetchAdminUsers({ search: searchText.value, limit: DEFAULT_USER_LIMIT })

      if (requestId !== listRequestId) {
        return
      }

      users.value = result

      if (selectedUserId.value && !result.some((user) => user.user_id === selectedUserId.value)) {
        selectedUserId.value = null
        selectedUserDetail.value = null
        detailError.value = ''
        overrideError.value = ''
        overrideSuccess.value = ''
      }
    } catch {
      if (requestId === listRequestId) {
        listError.value = SAFE_LIST_ERROR
      }
    } finally {
      if (requestId === listRequestId) {
        isListLoading.value = false
      }
    }
  }

  async function selectUser(userId: string) {
    selectedUserId.value = userId
    selectedUserDetail.value = null
    detailError.value = ''
    overrideError.value = ''
    overrideSuccess.value = ''

    const requestId = ++detailRequestId
    isDetailLoading.value = true

    try {
      const result = await fetchAdminUserDetail(userId)

      if (requestId !== detailRequestId) {
        return
      }

      selectedUserDetail.value = result
    } catch {
      if (requestId === detailRequestId) {
        detailError.value = SAFE_DETAIL_ERROR
      }
    } finally {
      if (requestId === detailRequestId) {
        isDetailLoading.value = false
      }
    }
  }

  async function retrySelectedUser() {
    if (!selectedUserId.value) {
      return
    }

    await selectUser(selectedUserId.value)
  }

  function replaceUserListRowFromDetail(detail: AdminUserDetail) {
    users.value = users.value.map((user) => (user.user_id === detail.user_id
      ? {
          user_id: detail.user_id,
          user_name: detail.user_name,
          user_email: detail.user_email,
          user_role: detail.user_role,
          user_reputation_score: detail.user_reputation_score,
          user_created_at: detail.user_created_at,
        }
      : user))
  }

  async function submitManualOverride(payload: Pick<UpdateAdminUserManualOverrideParams, 'manual_reputation_level' | 'note'>) {
    if (!selectedUserId.value || isOverrideSaving.value) {
      overrideError.value = SAFE_OVERRIDE_ERROR
      return
    }

    isOverrideSaving.value = true
    overrideError.value = ''
    overrideSuccess.value = ''

    try {
      const result = await updateAdminUserManualOverride({
        userId: selectedUserId.value,
        manual_reputation_level: payload.manual_reputation_level,
        note: payload.note,
      })

      selectedUserDetail.value = result
      replaceUserListRowFromDetail(result)
      overrideSuccess.value = SAFE_OVERRIDE_SUCCESS
    } catch {
      overrideError.value = SAFE_OVERRIDE_ERROR
    } finally {
      isOverrideSaving.value = false
    }
  }

  return {
    searchText,
    users: readonly(users),
    selectedUserId: readonly(selectedUserId),
    selectedUser,
    selectedUserDetail: readonly(selectedUserDetail),
    isListLoading: readonly(isListLoading),
    listError: readonly(listError),
    isDetailLoading: readonly(isDetailLoading),
    detailError: readonly(detailError),
    isOverrideSaving: readonly(isOverrideSaving),
    overrideError: readonly(overrideError),
    overrideSuccess: readonly(overrideSuccess),
    hasUsers,
    loadUsers,
    selectUser,
    retrySelectedUser,
    submitManualOverride,
  }
}
