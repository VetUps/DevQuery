<script setup lang="ts">
import { storeToRefs } from 'pinia'

import AppShellLayout from '@/layouts/AppShellLayout.vue'
import { useSessionStore } from '@/features/auth/stores/session'
import AppButton from '@/shared/ui/AppButton.vue'

const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)
</script>

<template>
  <AppShellLayout>
    <section class="home-page">
      <div class="home-page__hero">
        <p class="home-page__eyebrow">Главная</p>
        <h1 class="home-page__title">
          База фронтенда
        </h1>

        <div v-if="!isAuthenticated" class="home-page__actions">
          <RouterLink to="/register">
            <AppButton>Создать аккаунт</AppButton>
          </RouterLink>
          <RouterLink to="/login">
            <AppButton variant="secondary">Войти</AppButton>
          </RouterLink>
        </div>

        <p v-else class="home-page__status">
          Сессия активна. Следующий шаг для этого маршрута — показать реальную
          публичную ленту вопросов без перетяжки всей архитектуры.
        </p>
      </div>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.home-page__hero {
  display: grid;
  gap: var(--space-lg);
  padding: var(--space-2xl);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.52);
}

.home-page__eyebrow,
.home-page__status {
  margin: 0;
}

.home-page__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.home-page__title {
  margin: 0;
  max-width: 14ch;
  font-size: 40px;
  line-height: 1;
}

.home-page__status {
  max-width: 64ch;
  color: var(--color-muted);
  line-height: 1.7;
}

.home-page__actions {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

@media (width <= 640px) {
  .home-page__hero {
    padding: var(--space-lg);
  }

  .home-page__title {
    font-size: 32px;
  }
}
</style>
