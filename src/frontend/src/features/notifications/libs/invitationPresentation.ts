import type { NotificationItem } from '@/features/notifications/api/notifications'
import { formatDateTime } from '@/shared/libs/formatting'

export type InvitationPresentationState = 'active' | 'expired' | 'protected_ended' | 'unavailable'

export interface InvitationPresentation {
  state: InvitationPresentationState
  label: string
  helpText: string
  canRenderCta: boolean
  ctaUrl: string | null
  ctaLabel: string
  unavailableCtaLabel: string
}

const CTA_LABEL = 'Перейти к вопросу'
const CTA_UNAVAILABLE_LABEL = 'Переход к вопросу недоступен'

function getInvitationState(notification: NotificationItem): InvitationPresentationState {
  if (notification.is_expired || notification.invitation_status === 'expired') {
    return 'expired'
  }

  if (notification.protected_window_ended || notification.invitation_status === 'protected_ended') {
    return 'protected_ended'
  }

  if (notification.invitation_status === 'active') {
    return 'active'
  }

  return 'unavailable'
}

function getHelpText(notification: NotificationItem, state: InvitationPresentationState): string {
  if (state === 'active') {
    if (notification.protected_window_active && notification.protected_until) {
      return `Защищённое окно активно до ${formatDateTime(notification.protected_until)}. Перейдите к вопросу и помогите автору.`
    }

    return 'Приглашение активно. Перейдите к вопросу и помогите автору.'
  }

  if (state === 'expired') {
    return 'Срок приглашения истёк. Ответить по этому приглашению уже нельзя.'
  }

  if (state === 'protected_ended') {
    return 'Защищённое окно завершено. Вопрос может быть открыт для более широкого круга участников.'
  }

  return 'Контекст приглашения недоступен или больше не позволяет перейти к экспертному ответу.'
}

export function getInvitationPresentation(notification: NotificationItem): InvitationPresentation {
  const state = getInvitationState(notification)
  const canRenderCta = state === 'active' && notification.cta_url !== null

  const labels: Record<InvitationPresentationState, string> = {
    active: 'Приглашение активно',
    expired: 'Приглашение истекло',
    protected_ended: 'Окно защиты завершено',
    unavailable: 'Приглашение недоступно',
  }

  return {
    state,
    label: labels[state],
    helpText: getHelpText(notification, state),
    canRenderCta,
    ctaUrl: canRenderCta ? notification.cta_url : null,
    ctaLabel: CTA_LABEL,
    unavailableCtaLabel: CTA_UNAVAILABLE_LABEL,
  }
}
