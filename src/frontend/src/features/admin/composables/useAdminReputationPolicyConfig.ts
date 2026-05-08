import { computed, readonly, ref, shallowRef } from 'vue'

import {
  fetchAdminReputationPolicyConfig,
  updateAdminReputationPolicyConfig,
  type AdminReputationPolicyConfig,
} from '@/features/admin/api/admin'

const SAFE_LOAD_ERROR = 'Не удалось загрузить настройки политики. Проверьте соединение и попробуйте снова.'
const SAFE_SAVE_ERROR = 'Не удалось сохранить настройки политики. Проверьте значение и попробуйте снова.'
const SAFE_SUCCESS = 'Настройки политики сохранены.'
const DEFAULT_MAX_WINDOW_HOURS = 72

const POLICY_FIELD = 'protected_newcomer_window_hours'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function extractFirstMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (Array.isArray(value)) {
    const firstMessage = value.find((item) => typeof item === 'string' && item.trim())

    if (typeof firstMessage === 'string') {
      return firstMessage.trim()
    }
  }

  return ''
}

function extractBackendFieldError(error: unknown): string {
  if (!isRecord(error) || !isRecord(error.response)) {
    return ''
  }

  const responseData = error.response.data

  if (!isRecord(responseData)) {
    return ''
  }

  return extractFirstMessage(responseData[POLICY_FIELD])
}

export function useAdminReputationPolicyConfig() {
  const config = ref<AdminReputationPolicyConfig | null>(null)
  const editableHours = shallowRef('')
  const isLoading = shallowRef(false)
  const isSaving = shallowRef(false)
  const loadError = shallowRef('')
  const saveError = shallowRef('')
  const saveSuccess = shallowRef('')
  const backendFieldError = shallowRef('')

  let loadRequestId = 0

  const maxHours = computed(() => config.value?.max_protected_newcomer_window_hours ?? DEFAULT_MAX_WINDOW_HOURS)
  const currentHours = computed(() => config.value?.protected_newcomer_window_hours ?? null)
  const isLoaded = computed(() => config.value !== null)
  const normalizedEditableHours = computed(() => String(editableHours.value).trim())
  const hasUnchangedValue = computed(() => String(currentHours.value ?? '') === normalizedEditableHours.value)

  const localFieldError = computed(() => {
    const value = normalizedEditableHours.value

    if (!value) {
      return 'Укажите длительность защитного окна.'
    }

    if (!/^\d+$/.test(value)) {
      return 'Введите целое число часов без дробей и знаков.'
    }

    const numericValue = Number(value)

    if (!Number.isSafeInteger(numericValue)) {
      return 'Введите корректное целое число часов.'
    }

    if (numericValue < 1) {
      return 'Минимальное значение — 1 час.'
    }

    if (numericValue > maxHours.value) {
      return `Максимальное значение — ${maxHours.value} ч.`
    }

    return ''
  })

  const fieldError = computed(() => localFieldError.value || backendFieldError.value)
  const canSave = computed(() => isLoaded.value && !isSaving.value && !localFieldError.value)

  function applyConfig(nextConfig: AdminReputationPolicyConfig) {
    config.value = nextConfig
    editableHours.value = String(nextConfig.protected_newcomer_window_hours)
    backendFieldError.value = ''
  }

  async function loadConfig() {
    const requestId = ++loadRequestId
    isLoading.value = true
    loadError.value = ''
    saveError.value = ''
    saveSuccess.value = ''
    backendFieldError.value = ''

    try {
      const result = await fetchAdminReputationPolicyConfig()

      if (requestId !== loadRequestId) {
        return
      }

      applyConfig(result)
    } catch {
      if (requestId === loadRequestId) {
        loadError.value = SAFE_LOAD_ERROR
      }
    } finally {
      if (requestId === loadRequestId) {
        isLoading.value = false
      }
    }
  }

  async function saveConfig() {
    if (isSaving.value) {
      return
    }

    saveError.value = ''
    saveSuccess.value = ''
    backendFieldError.value = ''

    if (localFieldError.value || !config.value) {
      return
    }

    isSaving.value = true

    try {
      const result = await updateAdminReputationPolicyConfig({
        protected_newcomer_window_hours: Number(normalizedEditableHours.value),
      })

      applyConfig(result)
      saveSuccess.value = SAFE_SUCCESS
    } catch (error) {
      const backendError = extractBackendFieldError(error)

      if (backendError) {
        backendFieldError.value = backendError
      } else {
        saveError.value = SAFE_SAVE_ERROR
      }
    } finally {
      isSaving.value = false
    }
  }

  return {
    config: readonly(config),
    editableHours,
    currentHours,
    maxHours,
    isLoaded,
    isLoading: readonly(isLoading),
    isSaving: readonly(isSaving),
    loadError: readonly(loadError),
    saveError: readonly(saveError),
    saveSuccess: readonly(saveSuccess),
    fieldError,
    hasUnchangedValue,
    canSave,
    loadConfig,
    saveConfig,
  }
}
