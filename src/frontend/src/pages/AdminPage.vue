<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import AdminReputationPolicyPanel from '@/features/admin/components/AdminReputationPolicyPanel.vue'
import AdminUserManagement from '@/features/admin/components/AdminUserManagement.vue'
import { canAccessAdminWorkspace } from '@/features/admin/libs/admin-access'
import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const currentUserQuery = useCurrentUserQuery()

type AdminTabId = 'users' | 'policy'

interface AdminTabDefinition {
  id: AdminTabId
  label: string
  tabTestId: string
  panelId: string
}

const adminTabs: AdminTabDefinition[] = [
  {
    id: 'users',
    label: 'Пользователи',
    tabTestId: 'admin-tab-users',
    panelId: 'admin-users-panel',
  },
  {
    id: 'policy',
    label: 'Политика репутации',
    tabTestId: 'admin-tab-policy',
    panelId: 'admin-policy-tab-panel',
  },
]

const activeTab = shallowRef<AdminTabId>('users')

const currentUser = computed(() => currentUserQuery.data.value ?? null)
const canAccess = computed(() => canAccessAdminWorkspace(currentUser.value))
const isLoading = computed(() => currentUserQuery.isPending.value && !currentUser.value)
const isUnableToVerify = computed(() => currentUserQuery.isError.value && !currentUser.value)
</script>

<template>
  <AppShellLayout>
    <section class="admin-page" data-testid="admin-page">
      <InlineFeedbackPanel
        v-if="isLoading"
        data-testid="admin-shell-loading"
        eyebrow="Администрирование"
        title="Проверяем доступ"
        description="Подтверждаем вашу роль перед открытием административной рабочей области."
      />

      <InlineFeedbackPanel
        v-else-if="isUnableToVerify"
        data-testid="admin-shell-unable-to-verify"
        eyebrow="Администрирование"
        title="Не удалось подтвердить доступ"
        description="Откройте страницу позже или войдите заново. Подробности ошибки скрыты для безопасности."
        tone="danger"
      />

      <InlineFeedbackPanel
        v-else-if="!canAccess"
        data-testid="admin-shell-forbidden"
        eyebrow="Администрирование"
        title="Недостаточно прав"
        description="Эта рабочая область доступна только администраторам."
        tone="danger"
      />

      <template v-else>
        <SurfacePanel class="admin-page__hero" padding="lg" data-testid="admin-shell">
          <p class="admin-page__eyebrow">Администрирование</p>
          <h1 class="admin-page__title">Рабочая область администратора</h1>
          <p class="admin-page__description">
            Управляйте пользователями, ручными уровнями репутации, журналом активности и политиками платформы из единой защищённой области.
          </p>
        </SurfacePanel>

        <nav class="admin-page__tabs" aria-label="Разделы администрирования">
          <div class="admin-page__tablist" role="tablist" aria-label="Разделы администрирования">
            <button
              v-for="tab in adminTabs"
              :id="`admin-${tab.id}-tab`"
              :key="tab.id"
              class="admin-page__tab"
              :class="{ 'admin-page__tab--active': activeTab === tab.id }"
              type="button"
              role="tab"
              :data-testid="tab.tabTestId"
              :aria-selected="activeTab === tab.id"
              :aria-controls="tab.panelId"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </nav>

        <section
          v-if="activeTab === 'users'"
          id="admin-users-panel"
          class="admin-page__tabpanel"
          data-testid="admin-users-panel"
          role="tabpanel"
          aria-labelledby="admin-users-tab"
        >
          <AdminUserManagement />
        </section>

        <section
          v-if="activeTab === 'policy'"
          id="admin-policy-tab-panel"
          class="admin-page__tabpanel"
          data-testid="admin-policy-tab-panel"
          role="tabpanel"
          aria-labelledby="admin-policy-tab"
        >
          <AdminReputationPolicyPanel />
        </section>
      </template>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.admin-page {
  display: grid;
  gap: var(--space-lg);
}

.admin-page__hero {
  align-content: start;
}

.admin-page__eyebrow,
.admin-page__title,
.admin-page__description {
  margin: 0;
}

.admin-page__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-page__title {
  max-width: 760px;
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1.02;
  letter-spacing: -0.045em;
}

.admin-page__description {
  color: var(--color-muted);
  line-height: 1.6;
}

.admin-page__tabs {
  overflow-x: auto;
}

.admin-page__tablist {
  display: flex;
  gap: var(--space-xs);
  min-width: max-content;
  border-bottom: 1px solid var(--color-border);
}

.admin-page__tab {
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: var(--space-sm) var(--space-md);
}

.admin-page__tab:hover,
.admin-page__tab:focus-visible {
  color: var(--color-text);
}

.admin-page__tab:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.admin-page__tab--active {
  border-bottom-color: var(--color-accent);
  color: var(--color-text);
}

.admin-page__tabpanel {
  display: grid;
  gap: var(--space-lg);
}
</style>
