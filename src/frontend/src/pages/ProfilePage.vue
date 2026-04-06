<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import { useSessionStore } from '@/features/auth/stores/session'
import AppShellLayout from '@/layouts/AppShellLayout.vue'

const router = useRouter()
const sessionStore = useSessionStore()
const profileQuery = useCurrentUserQuery()

watch(
  () => profileQuery.error.value,
  async (error) => {
    if (error && !sessionStore.isAuthenticated) {
      await router.replace({
        path: '/login',
        query: { message: 'session-expired' },
      })
    }
  },
)

const user = computed(() => profileQuery.data.value)
</script>

<template>
  <AppShellLayout>
    <section class="profile-page">
      <div class="profile-page__card">
        <template v-if="profileQuery.isPending.value">
          <p class="profile-page__muted">Загружаем профиль…</p>
        </template>

        <template v-else-if="user">
          <p class="profile-page__eyebrow">Профиль</p>
          <h1 class="profile-page__title">{{ user.user_name }}</h1>
          <p class="profile-page__meta">{{ user.user_email }}</p>

          <dl class="profile-page__stats">
            <div>
              <dt>Репутация</dt>
              <dd>{{ user.user_reputation_score }}</dd>
            </div>
            <div>
              <dt>Дата регистрации</dt>
              <dd>{{ new Date(user.user_created_at).toLocaleDateString('ru-RU') }}</dd>
            </div>
          </dl>

          <div class="profile-page__placeholder">
            <p class="profile-page__placeholder-title">Проверка правок скоро появится</p>
            <p class="profile-page__muted">
              Здесь будет отдельная зона, в которой можно будет одобрять или отклонять
              правки к вашим решениям.
            </p>
          </div>
        </template>

        <template v-else>
          <p class="profile-page__muted">
            Не удалось загрузить профиль. Попробуйте открыть страницу ещё раз.
          </p>
        </template>
      </div>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.profile-page__card {
  display: grid;
  gap: var(--space-lg);
  padding: var(--space-2xl);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.52);
}

.profile-page__eyebrow,
.profile-page__title,
.profile-page__meta,
.profile-page__muted {
  margin: 0;
}

.profile-page__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.profile-page__title {
  font-size: 32px;
}

.profile-page__meta,
.profile-page__muted {
  color: var(--color-muted);
}

.profile-page__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-md);
  margin: 0;
}

.profile-page__stats dt {
  color: var(--color-muted);
  font-size: 14px;
}

.profile-page__stats dd {
  margin: var(--space-xs) 0 0;
  font-size: 20px;
  font-weight: 600;
}

.profile-page__placeholder {
  padding: var(--space-lg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(228 222 208 / 0.46);
}

.profile-page__placeholder-title {
  margin: 0 0 var(--space-sm);
  font-weight: 600;
}
</style>
