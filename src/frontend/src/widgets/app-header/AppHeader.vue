<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useSessionStore } from '@/features/auth/stores/session'
import AppButton from '@/shared/ui/AppButton.vue'

import AccountMenu from './AccountMenu.vue'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)

const isMenuOpen = ref(false)

const isSignedIn = computed(() => isAuthenticated.value)

watch(
  () => route.fullPath,
  () => {
    isMenuOpen.value = false
  },
)

async function handleLogout() {
  await sessionStore.logout()
  isMenuOpen.value = false
  await router.push('/')
}
</script>

<template>
  <header class="app-header" data-testid="app-header">
    <div class="app-header__inner">
      <RouterLink class="app-header__wordmark" to="/">
        StackOverflow 2.0
      </RouterLink>

      <nav class="app-header__nav" aria-label="Основная навигация">
        <template v-if="isSignedIn">
          <RouterLink class="app-header__link" to="/">
            Главная
          </RouterLink>

          <AccountMenu
            :open="isMenuOpen"
            @close="isMenuOpen = !isMenuOpen"
            @logout="handleLogout"
          />
        </template>

        <template v-else>
          <RouterLink class="app-header__button-link" to="/register">
            <AppButton>Создать аккаунт</AppButton>
          </RouterLink>
          <RouterLink class="app-header__link" to="/login">
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
  border-bottom: 1px solid rgb(207 198 180 / 0.75);
  background: rgb(228 222 208 / 0.92);
  backdrop-filter: blur(10px);
}

.app-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-md) var(--space-lg);
}

.app-header__wordmark {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.app-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.app-header__link,
.app-header__button-link {
  display: inline-flex;
  align-items: center;
}

.app-header__link {
  min-height: 44px;
  padding: 0 var(--space-md);
  border-radius: 999px;
  color: var(--color-text);
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
