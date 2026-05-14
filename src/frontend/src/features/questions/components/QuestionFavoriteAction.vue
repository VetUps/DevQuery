<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark } from 'lucide-vue-next'

import { useQuestionFavoriteMutation } from '@/features/questions/mutations/useQuestionFavoriteMutation'

const props = withDefaults(defineProps<{
  questionId: string
  isFavorited: boolean
  favoritesCount: number
  isAuthenticated: boolean
  variant?: 'compact' | 'large'
}>(), {
  variant: 'compact',
})

const favoriteMutation = useQuestionFavoriteMutation()

const safeFavoritesCount = computed(() => Math.max(0, props.favoritesCount))
const nextFavoriteState = computed(() => !props.isFavorited)
const pressedState = computed(() => (props.isFavorited ? 'true' : 'false'))
const busyState = computed(() => (favoriteMutation.isPending.value ? 'true' : 'false'))
const actionLabel = computed(() => (
  props.isFavorited
    ? `В избранном. Убрать из избранного, ${safeFavoritesCount.value}`
    : `Добавить в избранное, ${safeFavoritesCount.value}`
))
const stateLabel = computed(() => (props.isFavorited ? 'В избранном' : 'В избранное'))

async function toggleFavorite() {
  if (!props.isAuthenticated || favoriteMutation.isPending.value) {
    return
  }

  try {
    await favoriteMutation.mutateAsync({
      questionId: props.questionId,
      isFavorited: nextFavoriteState.value,
    })
  } catch {
    // The shared mutation owns rollback and visible toast feedback.
  }
}
</script>

<template>
  <div
    class="question-favorite-action"
    :class="[`question-favorite-action--${variant}`, { 'question-favorite-action--active': isFavorited }]"
    data-testid="question-favorite-action"
    :data-favorited="pressedState"
    :data-authenticated="isAuthenticated ? 'true' : 'false'"
    :data-pending="busyState"
  >
    <button
      v-if="isAuthenticated"
      class="question-favorite-action__button"
      type="button"
      :aria-label="actionLabel"
      :aria-pressed="pressedState"
      :aria-busy="busyState"
      :disabled="favoriteMutation.isPending.value"
      data-testid="question-favorite-button"
      :data-favorited="pressedState"
      @click="toggleFavorite"
    >
      <Bookmark
        class="question-favorite-action__icon"
        :class="{ 'question-favorite-action__icon--filled': isFavorited }"
        aria-hidden="true"
        :size="variant === 'large' ? 24 : 20"
        :stroke-width="2.25"
      />
      <span class="question-favorite-action__state">{{ stateLabel }}</span>
      <span class="question-favorite-action__count" data-testid="question-favorite-count">
        {{ safeFavoritesCount }}
      </span>
    </button>

    <RouterLink
      v-else
      class="question-favorite-action__link"
      to="/login"
      aria-label="Войдите, чтобы добавить вопрос в избранное"
      data-testid="question-favorite-login-link"
      :data-favorited="pressedState"
    >
      <Bookmark
        class="question-favorite-action__icon"
        aria-hidden="true"
        :size="variant === 'large' ? 24 : 20"
        :stroke-width="2.25"
      />
      <span class="question-favorite-action__state">Войдите, чтобы сохранить</span>
      <span class="question-favorite-action__count" data-testid="question-favorite-count">
        {{ safeFavoritesCount }}
      </span>
    </RouterLink>
  </div>
</template>

<style scoped>
.question-favorite-action {
  display: inline-flex;
  max-width: 100%;
}

.question-favorite-action__button,
.question-favorite-action__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 40px;
  border: 1px solid rgb(207 198 180 / 0.9);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.72);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease,
    opacity 0.2s ease;
}

.question-favorite-action--compact .question-favorite-action__button,
.question-favorite-action--compact .question-favorite-action__link {
  padding: 0 var(--space-md);
}

.question-favorite-action--large .question-favorite-action__button,
.question-favorite-action--large .question-favorite-action__link {
  min-height: 48px;
  padding: 0 var(--space-lg);
}

.question-favorite-action__button:hover:enabled,
.question-favorite-action__link:hover {
  border-color: rgb(217 119 6 / 0.42);
  background: rgb(255 251 235 / 0.92);
  box-shadow: 0 12px 24px rgb(217 119 6 / 0.12);
  transform: translateY(-1px);
}

.question-favorite-action__button:focus-visible,
.question-favorite-action__link:focus-visible {
  outline: 3px solid rgb(14 116 144 / 0.28);
  outline-offset: 3px;
}

.question-favorite-action__button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.question-favorite-action--active .question-favorite-action__button {
  border-color: rgb(217 119 6 / 0.54);
  background: linear-gradient(135deg, rgb(255 251 235 / 0.95), rgb(255 237 213 / 0.9));
  color: #92400E;
}

.question-favorite-action__icon {
  flex: 0 0 auto;
  color: currentColor;
}

.question-favorite-action__icon--filled {
  fill: currentColor;
}

.question-favorite-action__state {
  white-space: nowrap;
}

.question-favorite-action__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.8em;
  min-height: 1.8em;
  padding: 0 0.45em;
  border-radius: 999px;
  background: rgb(69 58 38 / 0.08);
  color: inherit;
  font-variant-numeric: tabular-nums;
}
</style>
