<script setup lang="ts">
import { computed } from 'vue'

import AdminReputationPolicyPanel from '@/features/admin/components/AdminReputationPolicyPanel.vue'
import AdminUserManagement from '@/features/admin/components/AdminUserManagement.vue'
import { canAccessAdminWorkspace } from '@/features/admin/libs/admin-access'
import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const currentUserQuery = useCurrentUserQuery()

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

        <AdminUserManagement />

        <div class="admin-page__grid" aria-label="Дополнительные разделы администрирования">
          <AdminReputationPolicyPanel />
        </div>
      </template>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.admin-page {
  display: grid;
  gap: var(--space-lg);
}

.admin-page__hero,
.admin-page__section-card {
  align-content: start;
}

.admin-page__eyebrow,
.admin-page__title,
.admin-page__description,
.admin-page__section-title,
.admin-page__section-description {
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

.admin-page__description,
.admin-page__section-description {
  color: var(--color-muted);
  line-height: 1.6;
}

.admin-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-lg);
}

.admin-page__section-title {
  font-size: 20px;
  line-height: 1.2;
}

@media (width <= 900px) {
  .admin-page__grid {
    grid-template-columns: 1fr;
  }
}
</style>
