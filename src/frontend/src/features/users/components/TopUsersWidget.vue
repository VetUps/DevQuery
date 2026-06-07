<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, ref } from 'vue'
import { useTopUsersQuery, type TopUsersPeriod } from '@/features/users/queries/useTopUsersQuery'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'
import UserAvatar from '@/shared/ui/UserAvatar.vue'

const period = ref<TopUsersPeriod>('global')
const page = ref(1)

const { data, isPending, isError } = useTopUsersQuery(period, page)

const users = computed(() => data.value?.results ?? [])
const hasNextPage = computed(() => Boolean(data.value?.next))
const hasPreviousPage = computed(() => Boolean(data.value?.previous))

function setPeriod(newPeriod: TopUsersPeriod) {
  if (period.value !== newPeriod) {
    period.value = newPeriod
    page.value = 1
  }
}

function nextPage() {
  if (hasNextPage.value) {
    page.value++
  }
}

function prevPage() {
  if (hasPreviousPage.value) {
    page.value--
  }
}

function getMedalClass(index: number) {
  const absoluteIndex = (page.value - 1) * 5 + index
  if (absoluteIndex === 0) return 'medal-gold'
  if (absoluteIndex === 1) return 'medal-silver'
  if (absoluteIndex === 2) return 'medal-bronze'
  return ''
}
</script>

<template>
  <SurfacePanel class="top-users-widget" padding="lg">
    <div class="top-users-widget__header">
      <h2 class="top-users-widget__title">Топ участников</h2>
      
      <div class="top-users-widget__tabs">
        <button 
          class="top-users-widget__tab" 
          :class="{ 'top-users-widget__tab--active': period === 'global' }"
          @click="setPeriod('global')"
        >
          За всё время
        </button>
        <button 
          class="top-users-widget__tab" 
          :class="{ 'top-users-widget__tab--active': period === 'weekly' }"
          @click="setPeriod('weekly')"
        >
          За неделю
        </button>
      </div>
    </div>

    <div class="top-users-widget__content">
      <div v-if="isPending" class="top-users-widget__loading">
        <ContentSkeleton :lines="3" />
      </div>
      <div v-else-if="isError" class="top-users-widget__error">
        <p>Не удалось загрузить данные.</p>
      </div>
      <div v-else-if="users.length === 0" class="top-users-widget__empty">
        <p>Пока нет активных участников.</p>
      </div>
      <ul v-else class="top-users-widget__list">
        <li v-for="(user, index) in users" :key="user.user_id" class="top-users-widget__item">
          <div class="top-users-widget__user">
            <div class="top-users-widget__avatar-wrapper" :class="getMedalClass(index)">
              <UserAvatar :url="user.user_avatar_url" :version="user.user_avatar_updated_at" :alt="user.user_name" size="sm" class="top-users-widget__avatar" />
            </div>
            <div class="top-users-widget__info">
              <span class="top-users-widget__name">{{ user.user_name }}</span>
              <span class="top-users-widget__level">{{ user.reputation.level_label }}</span>
            </div>
            <div class="top-users-widget__score" title="Очки репутации">
              {{ period === 'weekly' ? user.weekly_score : user.user_reputation_score }}
            </div>
          </div>
        </li>
      </ul>
    </div>

    <nav v-if="hasPreviousPage || hasNextPage" class="top-users-widget__pagination" aria-label="Пагинация участников">
      <AppButton
        class="top-users-widget__pagination-control"
        variant="ghost"
        size="compact"
        aria-label="Предыдущая страница"
        :disabled="!hasPreviousPage"
        @click="prevPage"
      >
        <span aria-hidden="true">‹</span>
      </AppButton>

      <p class="top-users-widget__pagination-label" :aria-label="`Текущая страница ${page}`">
        {{ page }}
      </p>

      <AppButton
        class="top-users-widget__pagination-control"
        variant="ghost"
        size="compact"
        aria-label="Следующая страница"
        :disabled="!hasNextPage"
        @click="nextPage"
      >
        <span aria-hidden="true">›</span>
      </AppButton>
    </nav>
  </SurfacePanel>
</template>

<style scoped>
.top-users-widget {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.top-users-widget__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.top-users-widget__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.top-users-widget__tabs {
  display: flex;
  gap: var(--space-xs);
  background: var(--color-surface-hover);
  padding: 4px;
  border-radius: var(--radius-md);
}

.top-users-widget__tab {
  flex: 1;
  background: transparent;
  border: none;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.top-users-widget__tab:hover {
  color: var(--color-text);
}

.top-users-widget__tab--active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.top-users-widget__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.top-users-widget__item {
  display: block;
}

.top-users-widget__user {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
  transition: background-color 0.2s;
}

.top-users-widget__user:hover {
  background-color: var(--color-surface-hover);
}

.top-users-widget__avatar-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  padding: 2px;
}

.top-users-widget__avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background-color: var(--color-surface-hover);
  border: 2px solid var(--color-surface);
}

.medal-gold {
  background: linear-gradient(135deg, #ffd32a, #ffa801);
  box-shadow: 0 2px 8px rgba(255, 168, 1, 0.4);
}

.medal-silver {
  background: linear-gradient(135deg, #d2dae2, #808e9b);
  box-shadow: 0 2px 8px rgba(128, 142, 155, 0.4);
}

.medal-bronze {
  background: linear-gradient(135deg, #ffb142, #cc8e35);
  box-shadow: 0 2px 8px rgba(204, 142, 53, 0.4);
}

.top-users-widget__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top-users-widget__name {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-users-widget__level {
  font-size: 12px;
  color: var(--color-muted);
}

.top-users-widget__score {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-accent);
  background: var(--color-surface-hover);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.top-users-widget__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
}

.top-users-widget__pagination-control {
  min-width: 40px;
  padding-inline: var(--space-sm);
  font-size: 1.35rem;
  line-height: 1;
}

.top-users-widget__pagination-label {
  min-width: 2.25rem;
  margin: 0;
  color: var(--color-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.top-users-widget__loading,
.top-users-widget__error,
.top-users-widget__empty {
  padding: var(--space-md) 0;
  text-align: center;
  color: var(--color-muted);
  font-size: 14px;
}
</style>
