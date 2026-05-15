<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { canAccessAdminWorkspace as canProfileAccessAdminWorkspace } from '@/features/admin/libs/admin-access'
import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import { useSessionStore } from '@/features/auth/stores/session'
import HeaderNotificationMenu from '@/features/notifications/components/HeaderNotificationMenu.vue'
import AppButton from '@/shared/ui/AppButton.vue'

import AccountMenu from './AccountMenu.vue'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)

const isAccountMenuOpen = ref(false)
const isNotificationMenuOpen = ref(false)

const isSignedIn = computed(() => isAuthenticated.value)
const askQuestionTarget = computed(() => (isSignedIn.value ? '/questions/ask' : '/register'))
let accountLabel = computed(() => 'Аккаунт')
let hasAdminWorkspaceAccess = computed(() => false)

try {
  const currentUserQuery = useCurrentUserQuery()

  accountLabel = computed(() => currentUserQuery.data.value?.user_name?.trim() || 'Аккаунт')
  hasAdminWorkspaceAccess = computed(() => canProfileAccessAdminWorkspace(currentUserQuery.data.value))
} catch {
  accountLabel = computed(() => 'Аккаунт')
  hasAdminWorkspaceAccess = computed(() => false)
}

watch(
  () => route.fullPath,
  () => {
    isAccountMenuOpen.value = false
    isNotificationMenuOpen.value = false
  },
)

function handleAccountMenuToggle() {
  isAccountMenuOpen.value = !isAccountMenuOpen.value

  if (isAccountMenuOpen.value) {
    isNotificationMenuOpen.value = false
  }
}

function handleNotificationMenuOpenChange(open: boolean) {
  isNotificationMenuOpen.value = open

  if (open) {
    isAccountMenuOpen.value = false
  }
}

async function handleLogout() {
  await sessionStore.logout()
  isAccountMenuOpen.value = false
  isNotificationMenuOpen.value = false
  await router.push('/')
}
</script>

<template>
  <header class="app-header" data-testid="app-header">
    <div class="app-header__inner">
      <RouterLink class="app-header__wordmark" to="/">
        DevQuery
      </RouterLink>

      <nav class="app-header__nav" aria-label="Основная навигация" data-testid="app-header-nav">
        <template v-if="isSignedIn">
          <RouterLink class="app-header__button-link" data-testid="ask-question-link" :to="askQuestionTarget">
            <AppButton size="compact">Задать вопрос</AppButton>
          </RouterLink>

          <RouterLink class="app-header__link app-header__link--compact" data-testid="home-link" to="/">
            Главная
          </RouterLink>

          <HeaderNotificationMenu
            :open="isNotificationMenuOpen"
            @update:open="handleNotificationMenuOpenChange"
          />

          <AccountMenu
            :can-access-admin-workspace="hasAdminWorkspaceAccess"
            :label="accountLabel"
            :open="isAccountMenuOpen"
            @close="handleAccountMenuToggle"
            @logout="handleLogout"
          />
        </template>

        <template v-else>
          <RouterLink class="app-header__button-link" data-testid="ask-question-link" :to="askQuestionTarget">
            <AppButton size="compact">Задать вопрос</AppButton>
          </RouterLink>
          <RouterLink class="app-header__button-link" data-testid="register-link" to="/register">
            <AppButton variant="secondary" size="compact">Создать аккаунт</AppButton>
          </RouterLink>
          <RouterLink class="app-header__link app-header__link--compact" data-testid="login-link" to="/login">
            Войти
          </RouterLink>
        </template>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid rgb(255 255 255 / 0.4);
  background: rgb(228 222 208 / 0.65);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.04);
}

.app-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-sm) var(--space-lg);
}

.app-header__wordmark {
  color: color-mix(in srgb, var(--color-text) 82%, transparent);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.035em;
}

.app-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.app-header__link,
.app-header__button-link {
  display: inline-flex;
  align-items: center;
}

.app-header__link {
  min-height: 40px;
  padding: 0 var(--space-sm);
  border-radius: 999px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.app-header__link.router-link-active {
  color: var(--color-accent);
  background: rgb(14 116 144 / 0.08);
}

@media (width <= 640px) {
  .app-header__inner {
    align-items: flex-start;
    flex-direction: column;
  }

  .app-header__nav {
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}
</style>
