<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'

import type { NotificationItem } from '@/features/notifications/api/notifications'
import { getInvitationPresentation, type InvitationPresentation } from '@/features/notifications/libs/invitationPresentation'
import { useNotificationSummaryQuery } from '@/features/notifications/queries/useNotificationsQuery'
import { formatDateTime } from '@/shared/libs/formatting'
import AppButton from '@/shared/ui/AppButton.vue'
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const PROFILE_NOTIFICATIONS_ROUTE = {
  path: '/profile',
  query: { tab: 'notifications' },
} as const

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: undefined,
})

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const internalOpen = shallowRef(false)
const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    if (props.open === undefined) {
      internalOpen.value = value
    }

    emit('update:open', value)
  },
})
const summaryQuery = useNotificationSummaryQuery()

const summary = computed(() => summaryQuery.data.value)
const latestNotifications = computed(() => summary.value?.latest ?? [])
const latestNotificationRows = computed(() => latestNotifications.value.map((notification) => ({
  notification,
  invitationPresentation: getInvitationPresentationFor(notification),
})))
const hasCachedLatest = computed(() => latestNotifications.value.length > 0)
const unreadCount = computed(() => Math.max(0, summary.value?.unread_count ?? 0))
const badgeText = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)))
const panelId = 'header-notification-menu-panel'
const showLoading = computed(() => summaryQuery.isPending.value && !summary.value)
const showInitialError = computed(() => summaryQuery.isError.value && !summary.value)
const showStaleError = computed(() => summaryQuery.isError.value && Boolean(summary.value))
const showEmpty = computed(
  () => !summaryQuery.isPending.value && !summaryQuery.isError.value && latestNotifications.value.length === 0,
)

function toggleMenu() {
  isOpen.value = !isOpen.value
}

function closeMenu() {
  isOpen.value = false
}

function notificationReadState(notification: NotificationItem) {
  return notification.is_read ? 'Просмотрено' : 'Новое'
}

function getInvitationPresentationFor(notification: NotificationItem): InvitationPresentation | null {
  if (notification.notification_type !== 'expert_invitation') {
    return null
  }

  return getInvitationPresentation(notification)
}
</script>

<template>
  <div class="header-notification-menu" data-testid="header-notification-menu">
    <button
      class="header-notification-menu__trigger"
      type="button"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      aria-label="Открыть уведомления"
      data-testid="header-notification-trigger"
      @click="toggleMenu"
    >
      <span class="header-notification-menu__icon" aria-hidden="true">🔔</span>
      <span class="header-notification-menu__trigger-text">Уведомления</span>
      <span class="header-notification-menu__badge" data-testid="header-notification-badge">
        {{ badgeText }}
      </span>
    </button>

    <section
      v-if="isOpen"
      :id="panelId"
      class="header-notification-menu__panel"
      aria-label="Последние уведомления"
      data-testid="header-notification-panel"
    >
      <header class="header-notification-menu__panel-header">
        <div>
          <p class="header-notification-menu__eyebrow">Уведомления</p>
          <h2 class="header-notification-menu__title">Последние события</h2>
        </div>
        <RouterLink
          class="header-notification-menu__profile-link"
          :to="PROFILE_NOTIFICATIONS_ROUTE"
          data-testid="header-notification-profile-link"
          @click="closeMenu"
        >
          Все уведомления
        </RouterLink>
      </header>

      <div v-if="showLoading" class="header-notification-menu__loading" data-testid="header-notification-loading">
        <ContentSkeleton :lines="3" compact />
        <p class="header-notification-menu__state-copy">Загружаем последние уведомления…</p>
      </div>

      <InlineFeedbackPanel
        v-else-if="showInitialError"
        data-testid="header-notification-error"
        eyebrow="Уведомления"
        title="Не удалось загрузить уведомления"
        description="Попробуйте обновить краткую сводку. Повреждённые или недоступные ответы не отображаются в шапке."
        tone="danger"
        show-action
        action-label="Повторить"
        @action="summaryQuery.refetch"
      />

      <InlineFeedbackPanel
        v-else-if="showEmpty"
        data-testid="header-notification-empty"
        eyebrow="Уведомления"
        title="Пока ничего нового"
        description="Когда появятся приглашения или важные события, они будут показаны здесь."
      />

      <div v-else class="header-notification-menu__content" data-testid="header-notification-latest">
        <p
          v-if="showStaleError"
          class="header-notification-menu__stale-error"
          role="status"
          data-testid="header-notification-stale-error"
        >
          Не удалось обновить сводку. Показываем последние доступные уведомления.
        </p>

        <ul v-if="hasCachedLatest" class="header-notification-menu__list" aria-label="Последние уведомления">
          <li
            v-for="row in latestNotificationRows"
            :key="row.notification.notification_id"
            class="header-notification-menu__item"
            :class="{ 'header-notification-menu__item--unread': !row.notification.is_read }"
            data-testid="header-notification-row"
          >
            <span class="header-notification-menu__item-state" data-testid="header-notification-row-state">
              {{ notificationReadState(row.notification) }}
            </span>
            <h3 class="header-notification-menu__item-title">{{ row.notification.title }}</h3>
            <p class="header-notification-menu__item-message">{{ row.notification.message }}</p>
            <div
              v-if="row.invitationPresentation"
              class="header-notification-menu__invitation"
              data-testid="header-invitation-state"
            >
              <span class="header-notification-menu__invitation-status" data-testid="header-invitation-status">
                {{ row.invitationPresentation.label }}
              </span>
              <p class="header-notification-menu__invitation-help" data-testid="header-invitation-help">
                {{ row.invitationPresentation.helpText }}
              </p>
            </div>
            <time class="header-notification-menu__item-time" :datetime="row.notification.created_at">
              {{ formatDateTime(row.notification.created_at) }}
            </time>
          </li>
        </ul>
      </div>

      <footer class="header-notification-menu__footer">
        <AppButton variant="secondary" size="compact" data-testid="header-notification-close" @click="closeMenu">
          Закрыть
        </AppButton>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.header-notification-menu {
  position: relative;
  display: inline-flex;
}

.header-notification-menu__trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.82);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.72);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.header-notification-menu__trigger:hover,
.header-notification-menu__trigger[aria-expanded='true'] {
  border-color: rgb(14 116 144 / 0.34);
  background: rgb(255 255 255 / 0.9);
  box-shadow: 0 14px 30px rgb(14 116 144 / 0.1);
}

.header-notification-menu__icon {
  line-height: 1;
}

.header-notification-menu__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--color-accent);
  color: #f8fbfc;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.header-notification-menu__panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 30;
  display: grid;
  width: min(380px, calc(100vw - 32px));
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.86);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 24px 70px rgb(31 41 51 / 0.16);
}

.header-notification-menu__panel-header {
  display: flex;
  gap: var(--space-md);
  align-items: start;
  justify-content: space-between;
}

.header-notification-menu__eyebrow,
.header-notification-menu__title,
.header-notification-menu__state-copy,
.header-notification-menu__stale-error,
.header-notification-menu__item-title,
.header-notification-menu__item-message,
.header-notification-menu__invitation-help,
.header-notification-menu__item-time {
  margin: 0;
}

.header-notification-menu__eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-notification-menu__title {
  margin-top: 3px;
  font-size: 18px;
  line-height: 1.15;
}

.header-notification-menu__profile-link {
  flex: 0 0 auto;
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.header-notification-menu__profile-link:hover {
  text-decoration: underline;
}

.header-notification-menu__loading,
.header-notification-menu__content,
.header-notification-menu__list {
  display: grid;
  gap: var(--space-sm);
}

.header-notification-menu__state-copy {
  color: var(--color-muted);
  font-size: 14px;
}

.header-notification-menu__stale-error {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: rgb(234 179 8 / 0.14);
  color: #854d0e;
  font-size: 13px;
  line-height: 1.45;
}

.header-notification-menu__list {
  max-height: 360px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.header-notification-menu__item {
  display: grid;
  gap: 5px;
  padding: var(--space-md);
  border: 1px solid rgb(31 41 51 / 0.06);
  border-radius: var(--radius-md);
  background: rgb(247 243 234 / 0.58);
}

.header-notification-menu__item--unread {
  border-color: rgb(14 116 144 / 0.22);
  background: rgb(14 116 144 / 0.08);
}

.header-notification-menu__item-state,
.header-notification-menu__invitation-status {
  justify-self: start;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgb(31 41 51 / 0.08);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 800;
}

.header-notification-menu__item-title {
  font-size: 15px;
  line-height: 1.25;
}

.header-notification-menu__invitation {
  display: grid;
  gap: 4px;
}

.header-notification-menu__invitation-status {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

.header-notification-menu__item-message,
.header-notification-menu__invitation-help,
.header-notification-menu__item-time {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.45;
}

.header-notification-menu__footer {
  display: flex;
  justify-content: end;
}

@media (width <= 560px) {
  .header-notification-menu,
  .header-notification-menu__trigger {
    width: 100%;
  }

  .header-notification-menu__trigger {
    justify-content: center;
  }

  .header-notification-menu__panel {
    right: auto;
    left: 0;
  }
}
</style>
