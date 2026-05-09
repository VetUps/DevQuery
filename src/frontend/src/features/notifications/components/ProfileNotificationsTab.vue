<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'

import type { NotificationItem, NotificationPayload } from '@/features/notifications/api/notifications'
import { useMarkNotificationReadMutation } from '@/features/notifications/mutations/useMarkNotificationReadMutation'
import { useNotificationsQuery } from '@/features/notifications/queries/useNotificationsQuery'
import { formatDateTime } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

type InvitationViewState = 'active' | 'expired' | 'protected-ended' | 'unavailable'

interface QuestionContext {
  title: string
  authorName: string | null
  tags: string[]
}

const notificationsQuery = useNotificationsQuery()
const markReadMutation = useMarkNotificationReadMutation()
const actionError = shallowRef<string | null>(null)
const pendingNotificationId = shallowRef<string | null>(null)

const notifications = computed(() => notificationsQuery.data.value?.results ?? [])
const hasExistingNotifications = computed(() => notifications.value.length > 0)
const showLoading = computed(() => notificationsQuery.isPending.value && !hasExistingNotifications.value)
const showError = computed(() => notificationsQuery.isError.value && !hasExistingNotifications.value)
const showEmpty = computed(() => !notificationsQuery.isPending.value && !notificationsQuery.isError.value && notifications.value.length === 0)

function readString(payload: NotificationPayload, key: string): string | null {
  const value = payload[key]

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readTags(payload: NotificationPayload): string[] {
  const value = payload.question_tags

  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
}

function getQuestionContext(notification: NotificationItem): QuestionContext | null {
  const title = readString(notification.payload, 'question_title')

  if (!title) {
    return null
  }

  return {
    title,
    authorName: readString(notification.payload, 'author_name'),
    tags: readTags(notification.payload),
  }
}

function getInvitationViewState(notification: NotificationItem): InvitationViewState {
  if (notification.is_expired || notification.invitation_status === 'expired') {
    return 'expired'
  }

  if (notification.protected_window_ended || notification.invitation_status === 'protected_ended') {
    return 'protected-ended'
  }

  if (notification.invitation_status === 'active') {
    return 'active'
  }

  return 'unavailable'
}

function getInvitationBadge(notification: NotificationItem) {
  const state = getInvitationViewState(notification)

  const copy: Record<InvitationViewState, string> = {
    active: 'Приглашение активно',
    expired: 'Приглашение истекло',
    'protected-ended': 'Окно защиты завершено',
    unavailable: 'Приглашение недоступно',
  }

  return copy[state]
}

function getInvitationHelp(notification: NotificationItem) {
  const state = getInvitationViewState(notification)

  if (state === 'active') {
    if (notification.protected_window_active && notification.protected_until) {
      return `Защищённое окно активно до ${formatDateTime(notification.protected_until)}. Перейдите к вопросу и помогите автору.`
    }

    return 'Приглашение активно. Перейдите к вопросу и помогите автору.'
  }

  if (state === 'expired') {
    return 'Срок приглашения истёк. Ответить по этому приглашению уже нельзя.'
  }

  if (state === 'protected-ended') {
    return 'Защищённое окно завершено. Вопрос может быть открыт для более широкого круга участников.'
  }

  return 'Контекст приглашения недоступен или больше не позволяет перейти к экспертному ответу.'
}

function isMarkReadPending(notification: NotificationItem) {
  return pendingNotificationId.value === notification.notification_id && markReadMutation.isPending.value
}

async function markAsRead(notification: NotificationItem) {
  if (notification.is_read || isMarkReadPending(notification)) {
    return
  }

  actionError.value = null
  pendingNotificationId.value = notification.notification_id

  try {
    await markReadMutation.mutateAsync(notification.notification_id)
  } catch {
    actionError.value = 'Не удалось отметить уведомление прочитанным. Попробуйте ещё раз.'
  } finally {
    pendingNotificationId.value = null
  }
}
</script>

<template>
  <section class="profile-notifications" data-testid="profile-notifications-tab">
    <header class="profile-notifications__header">
      <p class="profile-notifications__eyebrow">Уведомления</p>
      <h2 class="profile-notifications__title">Приглашения и важные события</h2>
      <p class="profile-notifications__description">
        Здесь собраны персональные уведомления о вопросах, где ваш экспертный ответ особенно нужен.
      </p>
    </header>

    <InlineFeedbackPanel
      v-if="showLoading"
      data-testid="notifications-loading"
      eyebrow="Уведомления"
      title="Загружаем уведомления"
      description="Проверяем новые приглашения и состояние защищённых вопросов."
    />

    <InlineFeedbackPanel
      v-else-if="showError"
      data-testid="notifications-error"
      eyebrow="Уведомления"
      title="Не удалось загрузить уведомления"
      description="Проверьте соединение и попробуйте ещё раз. Если ответ API повреждён, мы не будем показывать недостоверные данные."
      tone="danger"
      show-action
      action-label="Повторить загрузку"
      @action="notificationsQuery.refetch"
    />

    <InlineFeedbackPanel
      v-else-if="showEmpty"
      data-testid="notifications-empty"
      eyebrow="Уведомления"
      title="Уведомлений пока нет"
      description="Когда вас пригласят помочь с защищённым вопросом, уведомление появится здесь."
    />

    <div v-else class="profile-notifications__list" data-testid="notifications-list">
      <p v-if="notificationsQuery.isError.value" class="profile-notifications__stale-error" data-testid="notifications-stale-error">
        Не удалось обновить список. Показываем последние доступные уведомления.
      </p>

      <p v-if="actionError" class="profile-notifications__action-error" role="alert" data-testid="mark-read-error">
        {{ actionError }}
      </p>

      <SurfacePanel
        v-for="notification in notifications"
        :key="notification.notification_id"
        class="notification-card"
        :class="{
          'notification-card--unread': !notification.is_read,
          'notification-card--read': notification.is_read,
        }"
        padding="lg"
        data-testid="notification-card"
      >
        <div class="notification-card__topline">
          <span class="notification-card__read-state" :data-testid="notification.is_read ? 'read-badge' : 'unread-badge'">
            {{ notification.is_read ? 'Прочитано' : 'Новое' }}
          </span>
          <span class="notification-card__status" data-testid="invitation-status-badge">
            {{ getInvitationBadge(notification) }}
          </span>
        </div>

        <div class="notification-card__body">
          <div class="notification-card__copy">
            <h3 class="notification-card__title">{{ notification.title }}</h3>
            <p class="notification-card__message">{{ notification.message }}</p>
            <p class="notification-card__help" data-testid="invitation-help">
              {{ getInvitationHelp(notification) }}
            </p>
          </div>

          <div v-if="getQuestionContext(notification)" class="notification-card__question" data-testid="question-context">
            <p class="notification-card__question-label">Вопрос</p>
            <p class="notification-card__question-title">{{ getQuestionContext(notification)?.title }}</p>
            <p v-if="getQuestionContext(notification)?.authorName" class="notification-card__question-author">
              Автор: {{ getQuestionContext(notification)?.authorName }}
            </p>
            <ul v-if="getQuestionContext(notification)?.tags.length" class="notification-card__tags" aria-label="Теги вопроса">
              <li v-for="tag in getQuestionContext(notification)?.tags" :key="tag" class="notification-card__tag">
                {{ tag }}
              </li>
            </ul>
          </div>
          <p v-else class="notification-card__missing-context" data-testid="missing-context">
            Детали вопроса недоступны. Уведомление можно прочитать, но карточка не будет выдумывать отсутствующий контекст.
          </p>
        </div>

        <div class="notification-card__actions">
          <RouterLink
            v-if="notification.cta_url"
            class="notification-card__cta"
            data-testid="notification-cta"
            :to="notification.cta_url"
          >
            Перейти к вопросу
          </RouterLink>
          <span v-else class="notification-card__cta-unavailable" data-testid="notification-cta-unavailable">
            Переход к вопросу недоступен
          </span>

          <AppButton
            v-if="!notification.is_read"
            variant="secondary"
            size="compact"
            :disabled="isMarkReadPending(notification)"
            data-testid="mark-read-button"
            @click="markAsRead(notification)"
          >
            {{ isMarkReadPending(notification) ? 'Отмечаем…' : 'Отметить прочитанным' }}
          </AppButton>
        </div>
      </SurfacePanel>
    </div>
  </section>
</template>

<style scoped>
.profile-notifications,
.profile-notifications__header,
.profile-notifications__list,
.notification-card,
.notification-card__body,
.notification-card__copy,
.notification-card__question,
.notification-card__actions {
  display: grid;
}

.profile-notifications {
  gap: var(--space-lg);
}

.profile-notifications__header {
  gap: var(--space-xs);
}

.profile-notifications__eyebrow,
.profile-notifications__title,
.profile-notifications__description,
.notification-card__title,
.notification-card__message,
.notification-card__help,
.notification-card__question-label,
.notification-card__question-title,
.notification-card__question-author,
.notification-card__missing-context,
.profile-notifications__stale-error,
.profile-notifications__action-error {
  margin: 0;
}

.profile-notifications__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-notifications__title {
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.08;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.profile-notifications__description {
  max-width: 62ch;
  color: var(--color-muted);
  line-height: 1.6;
  text-wrap: pretty;
}

.profile-notifications__list {
  gap: var(--space-md);
}

.profile-notifications__stale-error,
.profile-notifications__action-error {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  line-height: 1.5;
}

.profile-notifications__stale-error {
  background: rgb(234 179 8 / 0.12);
  color: #854d0e;
}

.profile-notifications__action-error {
  background: rgb(220 38 38 / 0.1);
  color: #991b1b;
}

.notification-card {
  gap: var(--space-lg);
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.notification-card--unread {
  box-shadow:
    0 0 0 1px rgb(14 116 144 / 0.18),
    0 18px 42px rgb(14 116 144 / 0.1);
}

.notification-card--read {
  opacity: 0.82;
}

.notification-card__topline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
}

.notification-card__read-state,
.notification-card__status,
.notification-card__tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.notification-card__read-state {
  padding: 0 var(--space-sm);
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.notification-card__status {
  padding: 0 var(--space-sm);
  background: rgb(31 41 51 / 0.07);
  color: var(--color-text);
}

.notification-card__body {
  grid-template-columns: minmax(0, 1.3fr) minmax(240px, 0.7fr);
  gap: var(--space-lg);
  align-items: start;
}

.notification-card__copy {
  gap: var(--space-sm);
}

.notification-card__title {
  font-size: 20px;
  line-height: 1.2;
  text-wrap: balance;
}

.notification-card__message,
.notification-card__help,
.notification-card__question-author,
.notification-card__missing-context {
  color: var(--color-muted);
  line-height: 1.55;
  text-wrap: pretty;
}

.notification-card__question,
.notification-card__missing-context {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.58);
  box-shadow: inset 0 0 0 1px rgb(31 41 51 / 0.06);
}

.notification-card__question {
  gap: var(--space-xs);
}

.notification-card__question-label {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.notification-card__question-title {
  font-weight: 700;
  line-height: 1.35;
}

.notification-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: var(--space-xs) 0 0;
  padding: 0;
  list-style: none;
}

.notification-card__tag {
  padding: 0 10px;
  background: rgb(14 116 144 / 0.09);
  color: var(--color-accent);
}

.notification-card__actions {
  grid-template-columns: 1fr auto;
  gap: var(--space-sm);
  align-items: center;
}

.notification-card__cta,
.notification-card__cta-unavailable {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  justify-self: start;
  border-radius: 999px;
  font-weight: 700;
}

.notification-card__cta {
  padding: 0 var(--space-md);
  background: var(--color-accent);
  color: #f8fbfc;
  text-decoration: none;
}

.notification-card__cta-unavailable {
  color: var(--color-muted);
}

@media (width <= 760px) {
  .notification-card__body,
  .notification-card__actions {
    grid-template-columns: 1fr;
  }
}
</style>
