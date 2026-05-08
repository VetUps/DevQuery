<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/shared/ui/AppButton.vue'

const props = withDefaults(defineProps<{
  open: boolean
  canAccessAdminWorkspace?: boolean
  label?: string
}>(), {
  canAccessAdminWorkspace: false,
  label: 'Аккаунт',
})

const displayLabel = computed(() => props.label?.trim() || 'Аккаунт')

defineEmits<{
  close: []
  logout: []
}>()
</script>

<template>
  <div class="account-menu">
    <AppButton
      variant="secondary"
      size="compact"
      data-testid="account-menu-toggle"
      :title="displayLabel"
      @click="$emit('close')"
    >
      <span class="account-menu__label">{{ displayLabel }}</span>
    </AppButton>

    <div
      v-if="open"
      class="account-menu__panel"
      data-testid="account-menu-panel"
    >
      <RouterLink class="account-menu__link" data-testid="profile-menu-link" to="/profile">
        Профиль
      </RouterLink>
      <RouterLink
        v-if="props.canAccessAdminWorkspace"
        class="account-menu__link"
        data-testid="admin-menu-link"
        to="/admin"
      >
        Администрирование
      </RouterLink>
      <RouterLink
        class="account-menu__link"
        data-testid="review-menu-link"
        :to="{ path: '/profile', query: { tab: 'review' } }"
      >
        Проверка правок
      </RouterLink>
      <button class="account-menu__logout" data-testid="logout-button" @click="$emit('logout')">
        Выйти
      </button>
    </div>
  </div>
</template>

<style scoped>
.account-menu {
  position: relative;
}

.account-menu__label {
  display: inline-block;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-menu__panel {
  position: absolute;
  top: calc(100% + var(--space-xs));
  right: 0;
  display: grid;
  gap: var(--space-xs);
  min-width: 220px;
  padding: var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: #fbf8f1;
  box-shadow: 0 18px 40px rgb(47 57 70 / 0.12);
}

.account-menu__link,
.account-menu__logout {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 40px;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.account-menu__link:hover,
.account-menu__logout:hover {
  background: rgb(14 116 144 / 0.08);
}

.account-menu__logout {
  cursor: pointer;
}
</style>
