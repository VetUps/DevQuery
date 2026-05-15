import { computed, readonly, ref, shallowRef } from 'vue'

import {
  fetchAdminUserActivityTimeline,
  type AdminUserActivityItem,
  type AdminUserActivityTimeline,
  type AdminUserActivityType,
} from '@/features/admin/api/admin'

const DEFAULT_ACTIVITY_LIMIT = 10
const SAFE_ACTIVITY_ERROR = 'Не удалось загрузить активность пользователя. Повторите попытку.'

function uniqueActivityTypes(types: readonly AdminUserActivityType[]) {
  return [...new Set(types)]
}

export function useAdminUserActivityTimeline() {
  const selectedUserId = shallowRef<string | null>(null)
  const selectedTypes = ref<AdminUserActivityType[]>([])
  const timeline = ref<AdminUserActivityTimeline | null>(null)
  const items = ref<AdminUserActivityItem[]>([])
  const isLoading = shallowRef(false)
  const error = shallowRef<unknown>(null)
  const safeErrorMessage = shallowRef('')
  const page = shallowRef(1)

  let requestId = 0

  const hasSelectedUser = computed(() => Boolean(selectedUserId.value))
  const isEmpty = computed(() => !isLoading.value && !error.value && hasSelectedUser.value && items.value.length === 0)
  const availableTypes = computed<AdminUserActivityType[]>(() => timeline.value?.available_types ?? [])
  const count = computed(() => timeline.value?.count ?? 0)
  const limit = computed(() => timeline.value?.limit ?? DEFAULT_ACTIVITY_LIMIT)
  const hasNextPage = computed(() => count.value > page.value * limit.value)

  function clearTimelineState() {
    timeline.value = null
    items.value = []
    error.value = null
    safeErrorMessage.value = ''
    isLoading.value = false
  }

  function setSelectedUserId(userId: string | null) {
    selectedUserId.value = userId
    page.value = 1
    requestId += 1

    if (!userId) {
      clearTimelineState()
    }
  }

  function setSelectedTypes(types: readonly AdminUserActivityType[]) {
    selectedTypes.value = uniqueActivityTypes(types)
  }

  function toggleSelectedType(type: AdminUserActivityType) {
    selectedTypes.value = selectedTypes.value.includes(type)
      ? selectedTypes.value.filter((selectedType) => selectedType !== type)
      : [...selectedTypes.value, type]
    page.value = 1
  }

  function setPage(newPage: number) {
    page.value = newPage
    void loadTimeline()
  }

  async function loadTimeline() {
    if (!selectedUserId.value) {
      requestId += 1
      clearTimelineState()
      return
    }

    const currentRequestId = ++requestId
    isLoading.value = true
    error.value = null
    safeErrorMessage.value = ''

    try {
      const result = await fetchAdminUserActivityTimeline({
        userId: selectedUserId.value,
        types: selectedTypes.value,
        limit: DEFAULT_ACTIVITY_LIMIT,
        page: page.value,
      })

      if (currentRequestId !== requestId) {
        return
      }

      timeline.value = result
      items.value = result.items
    } catch (caughtError) {
      if (currentRequestId === requestId) {
        error.value = caughtError
        safeErrorMessage.value = SAFE_ACTIVITY_ERROR
        timeline.value = null
        items.value = []
      }
    } finally {
      if (currentRequestId === requestId) {
        isLoading.value = false
      }
    }
  }

  async function retry() {
    await loadTimeline()
  }

  return {
    selectedUserId: readonly(selectedUserId),
    selectedTypes: readonly(selectedTypes),
    timeline: readonly(timeline),
    items: readonly(items),
    isLoading: readonly(isLoading),
    error: readonly(error),
    safeErrorMessage: readonly(safeErrorMessage),
    hasSelectedUser,
    isEmpty,
    availableTypes,
    count,
    limit,
    page: readonly(page),
    hasNextPage,
    setSelectedUserId,
    setSelectedTypes,
    toggleSelectedType,
    setPage,
    loadTimeline,
    retry,
  }
}
