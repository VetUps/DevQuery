<script setup lang="ts">
import { computed, watch } from 'vue'

import {
  ADMIN_USER_ACTIVITY_TYPES,
  type AdminUserActivityItem,
  type AdminUserActivityType,
  type AdminUserListRow,
} from '@/features/admin/api/admin'
import { useAdminUserActivityTimeline } from '@/features/admin/composables/useAdminUserActivityTimeline'
import AppButton from '@/shared/ui/AppButton.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

const ACTIVITY_TYPE_LABELS: Record<AdminUserActivityType, string> = {
  comment: 'Комментарии',
  question: 'Вопросы',
  question_edit_event: 'События правок вопросов',
  question_edit_proposal: 'Предложения правок вопросов',
  question_revision: 'Ревизии вопросов',
  reputation: 'Репутация',
  solution: 'Решения',
  solution_edit: 'Правки решений',
  vote: 'Голоса',
}

const props = defineProps<{
  selectedUser: AdminUserListRow | null
}>()

const activity = useAdminUserActivityTimeline()

const selectedUserId = computed(() => props.selectedUser?.user_id ?? null)
const selectedTypeSet = computed(() => new Set(activity.selectedTypes.value))
const filterOptions = computed(() => ADMIN_USER_ACTIVITY_TYPES.map((type) => ({
  type,
  label: ACTIVITY_TYPE_LABELS[type],
  selected: selectedTypeSet.value.has(type),
})))
const hasActiveFilters = computed(() => activity.selectedTypes.value.length > 0)

function formatActivityTimestamp(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function itemTestId(item: AdminUserActivityItem) {
  return `admin-user-activity-item-${item.type}-${item.id}`
}

function toggleFilter(type: AdminUserActivityType) {
  activity.toggleSelectedType(type)
  void activity.loadTimeline()
}

function clearFilters() {
  activity.setSelectedTypes([])
  void activity.loadTimeline()
}

watch(selectedUserId, (userId) => {
  activity.setSelectedUserId(userId)

  if (userId) {
    void activity.loadTimeline()
  }
}, { immediate: true })
</script>

<template>
  <section class="admin-activity" data-testid="admin-user-activity" aria-labelledby="admin-user-activity-title">
    <div class="admin-activity__header">
      <div>
        <p class="admin-activity__eyebrow">Активность</p>
        <h3 id="admin-user-activity-title" class="admin-activity__title">Журнал действий пользователя</h3>
      </div>
      <AppButton
        v-if="selectedUser"
        variant="secondary"
        size="compact"
        :disabled="activity.isLoading.value"
        data-testid="admin-user-activity-retry"
        @click="activity.retry"
      >
        Обновить активность
      </AppButton>
    </div>

    <InlineFeedbackPanel
      v-if="!selectedUser"
      data-testid="admin-user-activity-no-selection"
      title="Активность появится после выбора пользователя"
      description="Журнал загружается только для выбранной записи администратора."
    />

    <template v-else>
      <div class="admin-activity__selected-context" data-testid="admin-user-activity-selected-context">
        <strong>{{ selectedUser.user_name }}</strong>
        <span>{{ selectedUser.user_email }}</span>
      </div>

      <div class="admin-activity__filters" data-testid="admin-user-activity-filters" aria-label="Фильтры активности">
        <button
          v-for="option in filterOptions"
          :key="option.type"
          class="admin-activity__filter"
          :class="{ 'admin-activity__filter--active': option.selected }"
          type="button"
          :aria-pressed="option.selected"
          :data-testid="`admin-user-activity-filter-${option.type}`"
          :disabled="activity.isLoading.value"
          @click="toggleFilter(option.type)"
        >
          {{ option.label }}
        </button>
        <AppButton
          v-if="hasActiveFilters"
          variant="ghost"
          size="compact"
          :disabled="activity.isLoading.value"
          data-testid="admin-user-activity-filter-clear"
          @click="clearFilters"
        >
          Сбросить фильтры
        </AppButton>
      </div>

      <p v-if="activity.isLoading.value" class="admin-activity__status" data-testid="admin-user-activity-loading" role="status">
        Загружаем компактный журнал активности…
      </p>

      <InlineFeedbackPanel
        v-else-if="activity.error.value"
        data-testid="admin-user-activity-error"
        :title="activity.safeErrorMessage.value"
        description="Служебные подробности скрыты. Данные выбранного пользователя и журнал репутации остаются доступными."
        tone="danger"
        show-action
        action-label="Повторить загрузку активности"
        @action="activity.retry"
      />

      <p v-else-if="activity.isEmpty.value" class="admin-activity__status" data-testid="admin-user-activity-empty">
        Активность не найдена. Для выбранных фильтров нет компактных событий активности.
      </p>

      <template v-else>
        <p class="admin-activity__status" data-testid="admin-user-activity-count">
          Найдено событий: {{ activity.count.value }}. Показано не более {{ activity.limit.value }} компактных записей.
        </p>
        <ul class="admin-activity__list" data-testid="admin-user-activity-list" :aria-label="`Найдено событий: ${activity.count.value}`">
          <li
            v-for="item in activity.items.value"
            :key="`${item.type}-${item.id}`"
            class="admin-activity__item"
            :data-testid="itemTestId(item)"
          >
            <div class="admin-activity__item-header">
              <span class="admin-activity__type">{{ ACTIVITY_TYPE_LABELS[item.type] }}</span>
              <time :datetime="item.occurred_at">{{ formatActivityTimestamp(item.occurred_at) }}</time>
            </div>
            <h4 class="admin-activity__item-title">{{ item.title }}</h4>
            <p class="admin-activity__item-summary">{{ item.summary }}</p>
            <p class="admin-activity__item-target">{{ item.target_label }}</p>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
.admin-activity {
  display: grid;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.admin-activity__header,
.admin-activity__selected-context,
.admin-activity__item-header {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  justify-content: space-between;
}

.admin-activity__selected-context {
  justify-content: flex-start;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 0.5);
}

.admin-activity__selected-context span,
.admin-activity__status,
.admin-activity__item-header time,
.admin-activity__item-summary,
.admin-activity__item-target {
  color: var(--color-muted);
}

.admin-activity__eyebrow,
.admin-activity__title,
.admin-activity__status,
.admin-activity__item-title,
.admin-activity__item-summary,
.admin-activity__item-target {
  margin: 0;
}

.admin-activity__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-activity__title {
  font-size: 22px;
  line-height: 1.15;
}

.admin-activity__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.admin-activity__filter {
  min-height: 38px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.62);
  color: var(--color-text);
  cursor: pointer;
  font-weight: 700;
}

.admin-activity__filter--active {
  border-color: var(--color-accent);
  background: rgb(12 100 125 / 0.12);
  color: var(--color-accent);
}

.admin-activity__filter:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.admin-activity__list {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: 0;
  list-style: none;
}

.admin-activity__item {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.68);
}

.admin-activity__type {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-activity__item-title {
  font-size: 17px;
  line-height: 1.25;
}

@media (width <= 720px) {
  .admin-activity__header,
  .admin-activity__selected-context,
  .admin-activity__item-header {
    display: grid;
    justify-content: stretch;
  }
}
</style>
