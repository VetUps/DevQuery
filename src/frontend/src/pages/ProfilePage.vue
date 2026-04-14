<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useCurrentUserQuery } from '@/features/auth/queries/useCurrentUserQuery'
import { useSessionStore } from '@/features/auth/stores/session'
import ProfileEditHistoryTab from '@/features/solutions/components/ProfileEditHistoryTab.vue'
import ProfileEditReviewQueue from '@/features/solutions/components/ProfileEditReviewQueue.vue'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import { formatLongDate } from '@/shared/libs/formatting'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

type ProfileTab = 'overview' | 'review' | 'history'

const PROFILE_TABS: Array<{ value: ProfileTab; label: string }> = [
  { value: 'overview', label: 'Обзор' },
  { value: 'review', label: 'Проверка правок' },
  { value: 'history', label: 'История правок' },
]

function isProfileTab(value: string): value is ProfileTab {
  return PROFILE_TABS.some((tab) => tab.value === value)
}

const route = useRoute()
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
const activeTab = computed<ProfileTab>(() => {
  const routeTab = String(route.query.tab ?? 'overview').trim()

  return isProfileTab(routeTab) ? routeTab : 'overview'
})

async function setActiveTab(tab: ProfileTab) {
  if (tab === activeTab.value) {
    return
  }

  await router.replace({
    path: '/profile',
    query: tab === 'overview' ? {} : { tab },
  })
}
</script>

<template>
  <AppShellLayout>
    <section class="profile-page" data-testid="profile-page">
      <InlineFeedbackPanel
        v-if="profileQuery.isPending.value && !user"
        eyebrow="Профиль"
        title="Загружаем профиль"
        description="Подтягиваем ваш рабочий контекст и инструменты проверки правок."
      />

      <InlineFeedbackPanel
        v-else-if="!profileQuery.isPending.value && !user"
        eyebrow="Профиль"
        title="Не удалось загрузить профиль"
        description="Попробуйте открыть страницу ещё раз."
        tone="danger"
      />

      <template v-else-if="user">
        <SurfacePanel class="profile-page__summary" padding="lg">
          <div class="profile-page__summary-copy">
            <p class="profile-page__eyebrow">Профиль</p>
            <h1 class="profile-page__title">{{ user.user_name }}</h1>
            <p class="profile-page__email">{{ user.user_email }}</p>
          </div>

          <dl class="profile-page__facts">
            <div class="profile-page__fact">
              <dt>Репутация</dt>
              <dd>{{ user.user_reputation_score }}</dd>
            </div>
            <div class="profile-page__fact">
              <dt>Дата регистрации</dt>
              <dd>{{ formatLongDate(user.user_created_at) }}</dd>
            </div>
          </dl>
        </SurfacePanel>

        <nav class="profile-page__tabs" aria-label="Навигация профиля">
          <button
            v-for="tab in PROFILE_TABS"
            :key="tab.value"
            type="button"
            class="profile-page__tab"
            :class="{ 'profile-page__tab--active': activeTab === tab.value }"
            :data-testid="`profile-tab-${tab.value}`"
            @click="setActiveTab(tab.value)"
          >
            {{ tab.label }}
          </button>
        </nav>

        <SurfacePanel class="profile-page__workspace" padding="lg">
          <section v-if="activeTab === 'overview'" class="profile-page__grid">
            <article class="profile-page__overview-card">
              <p class="profile-page__card-eyebrow">Проверка правок</p>
              <h2 class="profile-page__card-title">Соберите входящие предложения в одном месте</h2>
              <p class="profile-page__card-copy">
                Во вкладке проверки скоро появится очередь новых правок к вашим решениям:
                от свежих предложений до быстрого перехода в сравнение версий.
              </p>
            </article>

            <article class="profile-page__overview-card">
              <p class="profile-page__card-eyebrow">История правок</p>
              <h2 class="profile-page__card-title">Следите за тем, как менялись ваши решения</h2>
              <p class="profile-page__card-copy">
                История будет собирать уже обработанные правки по вашим решениям и показывать,
                что именно было принято или отклонено.
              </p>
            </article>
          </section>

          <ProfileEditReviewQueue v-else-if="activeTab === 'review'" />

          <ProfileEditHistoryTab v-else />
        </SurfacePanel>
      </template>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.profile-page {
  display: grid;
  gap: var(--space-lg);
}

.profile-page__summary {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.profile-page__summary-copy,
.profile-page__facts,
.profile-page__fact,
.profile-page__grid {
  display: grid;
}

.profile-page__summary-copy {
  gap: var(--space-xs);
}

.profile-page__eyebrow,
.profile-page__title,
.profile-page__email,
.profile-page__card-eyebrow,
.profile-page__card-title,
.profile-page__card-copy,
.profile-page__workspace-title,
.profile-page__workspace-copy {
  margin: 0;
}

.profile-page__eyebrow,
.profile-page__card-eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-page__title {
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.profile-page__email,
.profile-page__card-copy,
.profile-page__workspace-copy {
  color: var(--color-muted);
  line-height: 1.6;
}

.profile-page__facts {
  grid-template-columns: repeat(2, minmax(0, max-content));
  gap: var(--space-lg);
}

.profile-page__fact {
  gap: 4px;
}

.profile-page__fact dt {
  color: var(--color-muted);
  font-size: 13px;
}

.profile-page__fact dd {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.profile-page__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.profile-page__tab {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.88);
  color: var(--color-text);
  font-weight: 600;
}

.profile-page__tab--active {
  border-color: rgb(14 116 144 / 0.22);
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
}

.profile-page__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
}

.profile-page__overview-card {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.62);
}

.profile-page__card-title,
.profile-page__workspace-title {
  font-size: 22px;
  line-height: 1.08;
}

@media (width <= 900px) {
  .profile-page__summary,
  .profile-page__grid {
    grid-template-columns: 1fr;
  }

  .profile-page__facts {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
}
</style>
