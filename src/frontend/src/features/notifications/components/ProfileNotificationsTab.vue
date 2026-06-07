<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'

import type { NotificationItem, NotificationListStatus, NotificationPayload } from '@/features/notifications/api/notifications'
import { getInvitationPresentation, type InvitationPresentation } from '@/features/notifications/libs/invitationPresentation'
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/features/notifications/mutations/useMarkNotificationReadMutation'
import { useProfileNotificationsQuery } from '@/features/notifications/queries/useNotificationsQuery'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

interface QuestionContext {
  title: string
  authorName: string | null
  tags: string[]
}

interface NotificationCardView {
  notification: NotificationItem
  questionContext: QuestionContext | null
  invitationPresentation: InvitationPresentation
}

const selectedStatus = shallowRef<NotificationListStatus>('all')
const notificationsQuery = useProfileNotificationsQuery(selectedStatus)
const markReadMutation = useMarkNotificationReadMutation()
const markAllReadMutation = useMarkAllNotificationsReadMutation()
const markReadError = shallowRef<string | null>(null)
const markAllError = shallowRef<string | null>(null)
const pendingNotificationId = shallowRef<string | null>(null)

const notifications = computed(() => notificationsQuery.notifications.value)
const notificationCards = computed<NotificationCardView[]>(() => notifications.value.map((notification) => ({
  notification,
  questionContext: getQuestionContext(notification),
  invitationPresentation: getInvitationPresentation(notification),
})))
const unreadLoadedNotifications = computed(() => notifications.value.filter((notification) => !notification.is_read))
const hasExistingNotifications = computed(() => notificationsQuery.hasLoadedNotifications.value)
const showLoading = computed(() => notificationsQuery.isInitialLoading.value)
const showError = computed(() => notificationsQuery.isInitialError.value)
const showEmpty = computed(() => !showLoading.value && !showError.value && notifications.value.length === 0)
const emptyTitle = computed(() => selectedStatus.value === 'unread' ? 'Непрочитанных уведомлений нет' : 'Уведомлений пока нет')
const emptyDescription = computed(() => selectedStatus.value === 'unread'
  ? 'Все загруженные уведомления уже прочитаны. Переключитесь на все уведомления, чтобы увидеть историю.'
  : 'Когда вас пригласят помочь с защищённым вопросом, уведомление появится здесь.')
const canMarkAllRead = computed(() => unreadLoadedNotifications.value.length > 0 && !markAllReadMutation.isPending.value)
const hasNextPage = computed(() => notificationsQuery.hasNextPage.value === true)

function selectStatus(status: NotificationListStatus) {
  if (selectedStatus.value === status) {
    return
  }

  selectedStatus.value = status
  markReadError.value = null
  markAllError.value = null
  pendingNotificationId.value = null
}

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

function isMarkReadPending(notification: NotificationItem) {
  return pendingNotificationId.value === notification.notification_id && markReadMutation.isPending.value
}

async function markAsRead(notification: NotificationItem) {
  if (notification.is_read || isMarkReadPending(notification)) {
    return
  }

  markReadError.value = null
  pendingNotificationId.value = notification.notification_id

  try {
    await markReadMutation.mutateAsync(notification.notification_id)
  } catch {
    markReadError.value = 'Не удалось отметить уведомление прочитанным. Попробуйте ещё раз.'
  } finally {
    pendingNotificationId.value = null
  }
}

async function markAllAsRead() {
  if (!canMarkAllRead.value) {
    return
  }

  markAllError.value = null

  try {
    await markAllReadMutation.mutateAsync()
  } catch {
    markAllError.value = 'Не удалось отметить все уведомления прочитанными. Попробуйте ещё раз.'
  }
}

async function loadMoreNotifications() {
  if (!hasNextPage.value || notificationsQuery.isLoadMorePending.value) {
    return
  }

  await notificationsQuery.fetchNextPage()
}
</script>

<template>
  <section class="profile-notifications" data-testid="profile-notifications-tab">
    <header class="profile-notifications__header">
      <p class="profile-notifications__eyebrow">Уведомления</p>
      <h2 class="profile-notifications__title">Приглашения и важные события</h2>
    </header>

    <div class="profile-notifications__toolbar" data-testid="notifications-toolbar">
      <div class="profile-notifications__filters" aria-label="Фильтр уведомлений" data-testid="notifications-filters">
        <AppButton
          type="button"
          size="compact"
          :variant="selectedStatus === 'all' ? 'primary' : 'secondary'"
          :aria-pressed="selectedStatus === 'all'"
          data-testid="notifications-filter-all"
          @click="selectStatus('all')"
        >
          Все
        </AppButton>
        <AppButton
          type="button"
          size="compact"
          :variant="selectedStatus === 'unread' ? 'primary' : 'secondary'"
          :aria-pressed="selectedStatus === 'unread'"
          data-testid="notifications-filter-unread"
          @click="selectStatus('unread')"
        >
          Непрочитанные
        </AppButton>
      </div>

      <AppButton
        type="button"
        size="compact"
        variant="secondary"
        :disabled="!canMarkAllRead"
        data-testid="mark-all-read-button"
        @click="markAllAsRead"
      >
        {{ markAllReadMutation.isPending.value ? 'Отмечаем…' : 'Отметить все прочитанными' }}
      </AppButton>
    </div>

    <p v-if="markAllError" class="profile-notifications__action-error" role="alert" data-testid="mark-all-error">
      {{ markAllError }}
    </p>

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
      :title="emptyTitle"
      :description="emptyDescription"
    />

    <div v-else class="profile-notifications__list" data-testid="notifications-list">
      <p v-if="notificationsQuery.isStaleError.value" class="profile-notifications__stale-error" data-testid="notifications-stale-error">
        Не удалось обновить список. Показываем последние доступные уведомления.
      </p>

      <p v-if="markReadError" class="profile-notifications__action-error" role="alert" data-testid="mark-read-error">
        {{ markReadError }}
      </p>

      <SurfacePanel
        v-for="card in notificationCards"
        :key="card.notification.notification_id"
        class="notification-card"
        :class="{
          'notification-card--unread': !card.notification.is_read,
          'notification-card--read': card.notification.is_read,
        }"
        padding="lg"
        data-testid="notification-card"
      >
        <div class="notification-card__topline">
          <span class="notification-card__read-state" :data-testid="card.notification.is_read ? 'read-badge' : 'unread-badge'">
            {{ card.notification.is_read ? 'Прочитано' : 'Новое' }}
          </span>
          <span class="notification-card__status" data-testid="invitation-status-badge">
            {{ card.invitationPresentation.label }}
          </span>
        </div>

        <div class="notification-card__body">
          <div class="notification-card__copy">
            <h3 class="notification-card__title">{{ card.notification.title }}</h3>
            <p class="notification-card__message">{{ card.notification.message }}</p>
            <p class="notification-card__help" data-testid="invitation-help">
              {{ card.invitationPresentation.helpText }}
            </p>
          </div>

          <div v-if="card.questionContext" class="notification-card__question" data-testid="question-context">
            <p class="notification-card__question-label">Вопрос</p>
            <p class="notification-card__question-title">{{ card.questionContext.title }}</p>
            <p v-if="card.questionContext.authorName" class="notification-card__question-author">
              Автор: {{ card.questionContext.authorName }}
            </p>
            <ul v-if="card.questionContext.tags.length" class="notification-card__tags" aria-label="Теги вопроса">
              <li v-for="tag in card.questionContext.tags" :key="tag" class="notification-card__tag">
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
            v-if="card.invitationPresentation.canRenderCta && card.invitationPresentation.ctaUrl"
            class="notification-card__cta"
            data-testid="notification-cta"
            :to="card.invitationPresentation.ctaUrl"
          >
            {{ card.invitationPresentation.ctaLabel }}
          </RouterLink>
          <span v-else class="notification-card__cta-unavailable" data-testid="notification-cta-unavailable">
            {{ card.invitationPresentation.unavailableCtaLabel }}
          </span>

          <AppButton
            v-if="!card.notification.is_read"
            variant="secondary"
            size="compact"
            :disabled="isMarkReadPending(card.notification)"
            data-testid="mark-read-button"
            @click="markAsRead(card.notification)"
          >
            {{ isMarkReadPending(card.notification) ? 'Отмечаем…' : 'Отметить прочитанным' }}
          </AppButton>
        </div>
      </SurfacePanel>

      <div class="profile-notifications__pagination" data-testid="notifications-pagination">
        <p v-if="notificationsQuery.isLoadMoreError.value" class="profile-notifications__action-error" role="alert" data-testid="notifications-load-more-error">
          Не удалось загрузить следующую страницу. Уже загруженные уведомления сохранены.
        </p>
        <AppButton
          v-if="hasNextPage || notificationsQuery.isLoadMoreError.value"
          type="button"
          variant="secondary"
          :disabled="notificationsQuery.isLoadMorePending.value"
          data-testid="notifications-load-more-button"
          @click="loadMoreNotifications"
        >
          {{ notificationsQuery.isLoadMorePending.value ? 'Загружаем…' : notificationsQuery.isLoadMoreError.value ? 'Повторить загрузку' : 'Показать ещё' }}
        </AppButton>
        <p v-else class="profile-notifications__end" data-testid="notifications-no-next-page">
          Больше уведомлений нет.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-notifications,
.profile-notifications__header,
.profile-notifications__list,
.profile-notifications__pagination,
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

.profile-notifications__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  justify-content: space-between;
}

.profile-notifications__filters {
  display: flex;
  flex-wrap: wrap;
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
.profile-notifications__action-error,
.profile-notifications__end {
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

.profile-notifications__list,
.profile-notifications__pagination {
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

.profile-notifications__end {
  color: var(--color-muted);
  line-height: 1.5;
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
  .profile-notifications__toolbar {
    align-items: stretch;
  }

  .notification-card__body,
  .notification-card__actions {
    grid-template-columns: 1fr;
  }
}
</style>
