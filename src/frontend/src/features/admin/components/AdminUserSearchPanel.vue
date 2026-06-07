<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import type { AdminUserListRow } from '@/features/admin/api/admin'

interface Props {
  searchText: string
  users: readonly AdminUserListRow[]
  selectedUserId: string | null
  isLoading: boolean
  error: string
}

defineProps<Props>()

const emit = defineEmits<{
  'update:searchText': [value: string]
  submit: []
  retry: []
  manageUser: [userId: string]
}>()
</script>

<template>
  <section class="admin-user-search" data-testid="admin-user-search" aria-labelledby="admin-user-search-title">
    <div class="admin-user-search__header">
      <div>
        <p class="admin-user-search__eyebrow">Пользователи</p>
        <h2 id="admin-user-search-title" class="admin-user-search__title">Поиск пользователя</h2>
      </div>
      <p class="admin-user-search__hint">Поиск выполняется только после отправки формы.</p>
    </div>

    <form class="admin-user-search__form" @submit.prevent="emit('submit')">
      <AppInput
        id="admin-user-search-input"
        :model-value="searchText"
        label="Имя или email пользователя"
        placeholder="Например, alice@example.com"
        autocomplete="off"
        @update:model-value="emit('update:searchText', $event)"
      />
      <AppButton type="submit" :disabled="isLoading">
        {{ isLoading ? 'Ищем…' : 'Найти' }}
      </AppButton>
    </form>

    <p v-if="isLoading" class="admin-user-search__status" data-testid="admin-user-search-loading" role="status">
      Загружаем пользователей…
    </p>

    <InlineFeedbackPanel
      v-else-if="error"
      data-testid="admin-user-search-error"
      :title="error"
      description="Ошибка скрыта: служебные детали не показываются в интерфейсе."
      tone="danger"
      show-action
      action-label="Повторить поиск"
      @action="emit('retry')"
    />

    <InlineFeedbackPanel
      v-else-if="users.length === 0"
      data-testid="admin-user-search-empty"
      title="Пользователи не найдены"
      description="Измените поисковую фразу или отправьте пустой поиск для bounded-списка."
    />

    <ul v-else class="admin-user-search__results" aria-label="Результаты поиска пользователей">
      <li
        v-for="user in users"
        :key="user.user_id"
        class="admin-user-search__result"
        :class="{ 'admin-user-search__result--selected': user.user_id === selectedUserId }"
        :data-testid="`admin-user-row-${user.user_id}`"
      >
        <div class="admin-user-search__user-summary">
          <span class="admin-user-search__name">{{ user.user_name }}</span>
          <span class="admin-user-search__email">{{ user.user_email }}</span>
          <span class="admin-user-search__meta">
            {{ user.user_role === 'admin' ? 'Администратор' : 'Пользователь' }} · {{ user.user_reputation_score }} очков
          </span>
        </div>

        <AppButton
          type="button"
          variant="secondary"
          size="compact"
          :data-testid="`admin-user-manage-${user.user_id}`"
          :aria-label="`Управление пользователем ${user.user_name}`"
          @click="emit('manageUser', user.user_id)"
        >
          Управление
        </AppButton>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.admin-user-search {
  display: grid;
  gap: var(--space-md);
}

.admin-user-search__header,
.admin-user-search__form {
  display: flex;
  gap: var(--space-md);
  align-items: end;
  justify-content: space-between;
}

.admin-user-search__form {
  align-items: end;
}

.admin-user-search__form :deep(.app-input) {
  flex: 1 1 320px;
}

.admin-user-search__eyebrow,
.admin-user-search__title,
.admin-user-search__hint,
.admin-user-search__status {
  margin: 0;
}

.admin-user-search__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-user-search__title {
  font-size: 24px;
  line-height: 1.15;
}

.admin-user-search__hint,
.admin-user-search__status,
.admin-user-search__email,
.admin-user-search__meta {
  color: var(--color-muted);
}

.admin-user-search__results {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: 0;
  list-style: none;
}

.admin-user-search__result {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.72);
}

.admin-user-search__result--selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgb(17 112 140 / 0.12);
}

.admin-user-search__user-summary {
  display: grid;
  min-width: 0;
  gap: var(--space-xs);
}

.admin-user-search__name {
  font-weight: 700;
}

@media (width <= 720px) {
  .admin-user-search__header,
  .admin-user-search__form,
  .admin-user-search__result {
    display: grid;
    justify-content: stretch;
  }
}
</style>
