<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DiscoverySearchReserve from '@/features/questions/components/DiscoverySearchReserve.vue'
import QuestionCard from '@/features/questions/components/QuestionCard.vue'
import QuestionListPagination from '@/features/questions/components/QuestionListPagination.vue'
import QuestionListSkeleton from '@/features/questions/components/QuestionListSkeleton.vue'
import type { QuestionOrdering } from '@/features/questions/api/questions'
import { useFavoriteQuestionListQuery } from '@/features/questions/queries/useFavoriteQuestionListQuery'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

function normalizePage(rawPage: unknown) {
  const value = Array.isArray(rawPage) ? rawPage[0] : rawPage
  const parsedPage = Number.parseInt(String(value ?? '1'), 10)

  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage
}

function normalizeSearch(rawSearch: unknown) {
  const value = Array.isArray(rawSearch) ? rawSearch[0] : rawSearch

  return String(value ?? '').trim()
}

function normalizeOrdering(rawOrdering: unknown): QuestionOrdering {
  const value = Array.isArray(rawOrdering) ? rawOrdering[0] : rawOrdering

  return value === 'question_created_at' ? value : '-question_created_at'
}

function normalizeTags(rawTags: unknown) {
  const values = Array.isArray(rawTags) ? rawTags : [rawTags]
  const normalizedTags = values
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)

  return [...new Set(normalizedTags)]
}

function areTagListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

const route = useRoute()
const router = useRouter()

const currentPage = computed(() => normalizePage(route.query.page))
const activeSearch = computed(() => normalizeSearch(route.query.search))
const activeOrdering = computed(() => normalizeOrdering(route.query.ordering))
const activeTags = computed(() => normalizeTags(route.query.tag))
const searchDraft = shallowRef(activeSearch.value)
const orderingModel = computed({
  get: () => activeOrdering.value,
  set: (value: QuestionOrdering) => {
    void pushDiscoveryQuery({
      ordering: value,
      page: 1,
    })
  },
})
const tagFilterModel = computed({
  get: () => activeTags.value,
  set: (value: string[]) => {
    const nextTags = normalizeTags(value)

    if (areTagListsEqual(nextTags, activeTags.value)) {
      return
    }

    void pushDiscoveryQuery({
      page: 1,
      tags: nextTags,
    })
  },
})
const favoritesQuery = useFavoriteQuestionListQuery(computed(() => ({
  page: currentPage.value,
  search: activeSearch.value,
  ordering: activeOrdering.value,
  tags: activeTags.value,
})))

const favoriteQuestions = computed(() => favoritesQuery.data.value?.results ?? [])
const totalFavorites = computed(() => favoritesQuery.data.value?.count ?? 0)
const hasNextPage = computed(() => Boolean(favoritesQuery.data.value?.next))
const isLoadingList = computed(() => favoritesQuery.isPending.value && !favoritesQuery.data.value)
const isEmptyList = computed(
  () => !favoritesQuery.isPending.value && !favoritesQuery.isError.value && favoriteQuestions.value.length === 0,
)
const isTagFilteredList = computed(() => activeTags.value.length > 0)
const isFilteredEmptyList = computed(() => isEmptyList.value && (Boolean(activeSearch.value) || isTagFilteredList.value))
const activeFilterSummary = computed(() => {
  const parts: string[] = []

  if (activeSearch.value) {
    parts.push(`по запросу «${activeSearch.value}»`)
  }

  if (activeTags.value.length > 0) {
    parts.push(`с тегами ${activeTags.value.map((tag) => `#${tag}`).join(', ')}`)
  }

  return parts.join(' и ')
})
const emptyStateDescription = computed(() => {
  if (!isFilteredEmptyList.value) {
    return 'Сохраняйте вопросы в избранное из ленты или карточки вопроса — они появятся в этом списке.'
  }

  return `В избранном пока нет вопросов ${activeFilterSummary.value}. Попробуйте изменить поиск или теги.`
})
const errorStateDescription = computed(() => {
  if (!activeFilterSummary.value) {
    return 'Мы не смогли получить ваши избранные вопросы с сервера. Повторите запрос ещё раз.'
  }

  return `Мы не смогли получить ваши избранные вопросы ${activeFilterSummary.value}. Активные фильтры сохранены — повторите запрос ещё раз.`
})

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

function buildDiscoveryQuery(overrides: {
  page?: number
  search?: string
  ordering?: QuestionOrdering
  tags?: string[]
}) {
  const query = { ...route.query }
  const nextPage = overrides.page ?? currentPage.value
  const nextSearch = overrides.search ?? activeSearch.value
  const nextOrdering = overrides.ordering ?? activeOrdering.value
  const nextTags = normalizeTags(overrides.tags ?? activeTags.value)

  query.tab = 'favorites'

  if (nextPage > 1) {
    query.page = String(nextPage)
  } else {
    delete query.page
  }

  if (nextSearch) {
    query.search = nextSearch
  } else {
    delete query.search
  }

  if (nextOrdering === 'question_created_at') {
    query.ordering = nextOrdering
  } else {
    delete query.ordering
  }

  if (nextTags.length > 0) {
    query.tag = nextTags
  } else {
    delete query.tag
  }

  return query
}

function clearSearchDebounceTimer() {
  if (!searchDebounceTimer) {
    return
  }

  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
}

async function replaceDiscoveryQuery(overrides: Parameters<typeof buildDiscoveryQuery>[0]) {
  await router.replace({
    query: buildDiscoveryQuery(overrides),
  })
}

async function pushDiscoveryQuery(overrides: Parameters<typeof buildDiscoveryQuery>[0]) {
  await router.push({
    query: buildDiscoveryQuery(overrides),
  })
}

async function resetEmptyStateFilters() {
  clearSearchDebounceTimer()
  searchDraft.value = ''

  await pushDiscoveryQuery({
    page: 1,
    search: '',
    tags: [],
  })
}

watch(activeSearch, (value) => {
  if (searchDraft.value !== value) {
    searchDraft.value = value
  }
})

watch(searchDraft, (value) => {
  clearSearchDebounceTimer()

  searchDebounceTimer = setTimeout(() => {
    void replaceDiscoveryQuery({
      page: 1,
      search: value.trim(),
    })
  }, 500)
})

onBeforeUnmount(clearSearchDebounceTimer)
</script>

<template>
  <section class="profile-favorites-tab" aria-label="Избранные вопросы" data-testid="profile-favorites-workspace">
    <DiscoverySearchReserve
      v-model:search="searchDraft"
      v-model:ordering="orderingModel"
      v-model:tags="tagFilterModel"
      :total-questions="totalFavorites"
    />

    <SurfacePanel class="profile-favorites-tab__list-section" aria-label="Список избранных вопросов">
      <div class="profile-favorites-tab__section-heading">
        <div>
          <p class="profile-favorites-tab__eyebrow">Избранное</p>
          <h2 class="profile-favorites-tab__section-title">Сохранённые вопросы</h2>
        </div>
        <p class="profile-favorites-tab__section-meta" data-testid="profile-favorites-count">
          {{ totalFavorites }} сохранённых вопросов · страница {{ currentPage }}.
        </p>
      </div>

      <QuestionListSkeleton v-if="isLoadingList" />

      <InlineFeedbackPanel
        v-else-if="favoritesQuery.isError.value"
        eyebrow="Избранное временно недоступно"
        title="Не удалось загрузить сохранённые вопросы"
        :description="errorStateDescription"
        :show-action="true"
        action-label="Попробовать снова"
        tone="danger"
        data-testid="profile-favorites-state-error"
        @action="favoritesQuery.refetch()"
      />

      <InlineFeedbackPanel
        v-else-if="isEmptyList"
        :eyebrow="isFilteredEmptyList ? 'Фильтры избранного' : 'Избранное'"
        :title="isFilteredEmptyList ? 'Ничего не нашли' : 'Сохранённых вопросов пока нет'"
        :description="emptyStateDescription"
        :show-action="isFilteredEmptyList"
        action-label="Сбросить фильтры"
        data-testid="profile-favorites-state-empty"
        @action="resetEmptyStateFilters"
      />

      <div v-else class="profile-favorites-tab__question-list" data-testid="profile-favorites-list">
        <QuestionCard
          v-for="question in favoriteQuestions"
          :key="question.question_id"
          :question="question"
          :is-authenticated="true"
        />
      </div>

      <QuestionListPagination
        :page="currentPage"
        :has-next-page="hasNextPage"
        :is-busy="favoritesQuery.isPlaceholderData.value"
      />
    </SurfacePanel>
  </section>
</template>

<style scoped>
.profile-favorites-tab,
.profile-favorites-tab__list-section,
.profile-favorites-tab__question-list {
  display: grid;
  gap: var(--space-lg);
}

.profile-favorites-tab__question-list {
  gap: var(--space-md);
}

.profile-favorites-tab__section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-md);
}

.profile-favorites-tab__eyebrow,
.profile-favorites-tab__section-title,
.profile-favorites-tab__section-meta {
  margin: 0;
}

.profile-favorites-tab__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-favorites-tab__section-title {
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.profile-favorites-tab__section-meta {
  color: var(--color-muted);
  line-height: 1.6;
}

@media (width <= 640px) {
  .profile-favorites-tab__section-title {
    font-size: 24px;
  }
}
</style>
