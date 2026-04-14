import { readonly, shallowRef } from 'vue'

export type AppToastTone = 'default' | 'danger' | 'success'

export interface AppToast {
  id: string
  message: string
  tone: AppToastTone
}

interface PushToastPayload {
  message: string
  tone?: AppToastTone
  durationMs?: number
}

const toasts = shallowRef<AppToast[]>([])
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearToastTimer(id: string) {
  const timer = toastTimers.get(id)

  if (!timer) {
    return
  }

  clearTimeout(timer)
  toastTimers.delete(id)
}

function removeToast(id: string) {
  clearToastTimer(id)
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

function pushToast(payload: PushToastPayload) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const durationMs = payload.durationMs ?? 4800

  toasts.value = [
    ...toasts.value,
    {
      id,
      message: payload.message,
      tone: payload.tone ?? 'danger',
    },
  ]

  if (durationMs > 0) {
    const timer = setTimeout(() => {
      removeToast(id)
    }, durationMs)

    toastTimers.set(id, timer)
  }

  return id
}

export function useToastStore() {
  return {
    toasts: readonly(toasts),
    pushToast,
    removeToast,
  }
}
