import { computed, readonly, ref, shallowRef } from 'vue'

import { fetchAdminUserReputationLedger } from '@/features/admin/api/admin'
import type { ReputationLedgerEntry } from '@/features/users/api/reputation'

const SAFE_LEDGER_ERROR = 'Не удалось загрузить журнал репутации. Повторите попытку.'

export function useAdminReputationLedger() {
  const selectedUserId = shallowRef<string | null>(null)
  const entries = ref<ReputationLedgerEntry[]>([])
  const isLoading = shallowRef(false)
  const error = shallowRef<unknown>(null)
  const safeErrorMessage = shallowRef('')
  const page = shallowRef(1)
  const hasNextPage = shallowRef(false)
  const count = shallowRef(0)

  let requestId = 0

  function clearLedgerState() {
    entries.value = []
    error.value = null
    safeErrorMessage.value = ''
    isLoading.value = false
    hasNextPage.value = false
    count.value = 0
  }

  function setSelectedUserId(userId: string | null) {
    selectedUserId.value = userId
    page.value = 1
    requestId += 1

    if (!userId) {
      clearLedgerState()
    }
  }

  function setPage(newPage: number) {
    page.value = newPage
    void loadLedger()
  }

  async function loadLedger() {
    if (!selectedUserId.value) {
      requestId += 1
      clearLedgerState()
      return
    }

    const currentRequestId = ++requestId
    isLoading.value = true
    error.value = null
    safeErrorMessage.value = ''

    try {
      const result = await fetchAdminUserReputationLedger({
        userId: selectedUserId.value,
        page: page.value,
      })

      if (currentRequestId !== requestId) {
        return
      }

      entries.value = result.results
      hasNextPage.value = Boolean(result.next)
      count.value = result.count
    } catch (caughtError) {
      if (currentRequestId === requestId) {
        error.value = caughtError
        safeErrorMessage.value = SAFE_LEDGER_ERROR
        entries.value = []
        hasNextPage.value = false
        count.value = 0
      }
    } finally {
      if (currentRequestId === requestId) {
        isLoading.value = false
      }
    }
  }

  async function retry() {
    await loadLedger()
  }

  return {
    selectedUserId: readonly(selectedUserId),
    entries: readonly(entries),
    isLoading: readonly(isLoading),
    error: readonly(error),
    safeErrorMessage: readonly(safeErrorMessage),
    page: readonly(page),
    hasNextPage: readonly(hasNextPage),
    count: readonly(count),
    setSelectedUserId,
    setPage,
    loadLedger,
    retry,
  }
}
