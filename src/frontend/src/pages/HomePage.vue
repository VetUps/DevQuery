<script setup lang="ts">
// Кратко: собирает страницу из данных и компонентов.
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

import { useSessionStore } from '@/features/auth/stores/session'
import { useNotificationsQuery } from '@/features/notifications/queries/useNotificationsQuery'
import { useQuestionListQuery } from '@/features/questions/queries/useQuestionListQuery'
import DiscoverySearchReserve from '@/features/questions/components/DiscoverySearchReserve.vue'
import PublicDiscoveryIntro from '@/features/questions/components/PublicDiscoveryIntro.vue'
import QuestionCard from '@/features/questions/components/QuestionCard.vue'
import QuestionListPagination from '@/features/questions/components/QuestionListPagination.vue'
import QuestionListSkeleton from '@/features/questions/components/QuestionListSkeleton.vue'
import TopUsersWidget from '@/features/users/components/TopUsersWidget.vue'
import type { QuestionOrdering } from '@/features/questions/api/questions'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

function normalizePage(rawPage: unknown) {
  const parsedPage = Number.parseInt(String(rawPage ?? '1'), 10)

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
const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)

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
const questionListQuery = useQuestionListQuery(computed(() => ({
  page: currentPage.value,
  search: activeSearch.value,
  ordering: activeOrdering.value,
  tags: activeTags.value,
})))
const notificationsQuery = useNotificationsQuery(isAuthenticated)

const invitedQuestionIds = computed(() => {
  if (!isAuthenticated.value || notificationsQuery.isPending.value || notificationsQuery.isError.value) {
    return new Set<string>()
  }

  return new Set(
    (notificationsQuery.data.value?.results ?? [])
      .filter((notification) => (
        notification.notification_type === 'expert_invitation' &&
        typeof notification.source_question_id === 'string' &&
        notification.source_question_id.length > 0
      ))
      .map((notification) => notification.source_question_id as string),
  )
})

const questionList = computed(() => questionListQuery.data.value?.results ?? [])
const totalQuestions = computed(() => questionListQuery.data.value?.count ?? 0)
const hasNextPage = computed(() => Boolean(questionListQuery.data.value?.next))
const isLoadingList = computed(
  () => questionListQuery.isPending.value && !questionListQuery.data.value,
)
const isEmptyList = computed(
  () => !questionListQuery.isPending.value && !questionListQuery.isError.value && questionList.value.length === 0,
)
const isSearchEmptyList = computed(() => isEmptyList.value && Boolean(activeSearch.value))
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
    return 'Как только в системе появятся новые обсуждения, они сразу покажутся здесь.'
  }

  return `В публичной ленте пока нет вопросов ${activeFilterSummary.value}. Попробуйте изменить поиск или теги.`
})
const errorStateDescription = computed(() => {
  if (!activeFilterSummary.value) {
    return 'Мы не смогли получить список вопросов с сервера. Повторите запрос ещё раз.'
  }

  return `Мы не смогли получить список вопросов ${activeFilterSummary.value}. Активные фильтры сохранены — повторите запрос ещё раз.`
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
  <AppShellLayout>
    <section class="home-page">
      <div class="home-page__content">
        <div class="home-page__main">
          <DiscoverySearchReserve
            v-model:search="searchDraft"
            v-model:ordering="orderingModel"
            v-model:tags="tagFilterModel"
            :total-questions="totalQuestions"
          />

          <SurfacePanel class="home-page__list-section" aria-label="Лента вопросов">
            <div class="home-page__section-heading">
              <div>
                <p class="home-page__eyebrow">Открытые обсуждения</p>
                <h2 class="home-page__section-title">Живая база инженерных вопросов</h2>
              </div>
              <p class="home-page__section-meta">
                Страница {{ currentPage }} из публичной ленты.
              </p>
            </div>

            <QuestionListSkeleton v-if="isLoadingList" />

            <InlineFeedbackPanel
              v-else-if="questionListQuery.isError.value"
              eyebrow="Не удалось загрузить данные. Попробуйте снова."
              title="Лента временно недоступна"
              :description="errorStateDescription"
              :show-action="true"
              action-label="Попробовать снова"
              tone="danger"
              data-testid="question-list-state-error"
              @action="questionListQuery.refetch()"
            />

            <InlineFeedbackPanel
              v-else-if="isEmptyList"
              :eyebrow="isFilteredEmptyList ? 'Фильтры ленты' : 'Публичная лента'"
              :title="isFilteredEmptyList ? 'Ничего не нашли' : 'Вопросов пока нет'"
              :description="emptyStateDescription"
              :show-action="isFilteredEmptyList"
              action-label="Сбросить фильтры"
              data-testid="question-list-state-empty"
              @action="resetEmptyStateFilters"
            />

            <div v-else class="home-page__question-list">
              <QuestionCard
                v-for="question in questionList"
                :key="question.question_id"
                :question="question"
                :is-authenticated="isAuthenticated"
                :is-invited-for-current-user="invitedQuestionIds.has(question.question_id)"
              />
            </div>

            <QuestionListPagination
              :page="currentPage"
              :has-next-page="hasNextPage"
              :is-busy="questionListQuery.isPlaceholderData.value"
            />
          </SurfacePanel>
        </div>

        <aside
          class="home-page__sidebar"
          aria-label="Дополнительная информация"
          data-testid="home-discovery-sidebar"
        >
          <PublicDiscoveryIntro :total-questions="totalQuestions" />
          <TopUsersWidget />
        </aside>
      </div>
    </section>
  </AppShellLayout>
</template>

<style scoped>
.home-page {
  display: grid;
}

.home-page__content {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
  gap: var(--space-xl);
}

.home-page__main,
.home-page__sidebar {
  display: grid;
  gap: var(--space-xl);
  align-content: start;
}

.home-page__sidebar {
  position: sticky;
  top: calc(64px + var(--space-lg));
  align-self: start;
  max-height: calc(100vh - 64px - (var(--space-lg) * 2));
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.home-page__list-section {
  display: grid;
  gap: var(--space-lg);
}

.home-page__section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-md);
}

.home-page__eyebrow,
.home-page__section-title,
.home-page__section-meta {
  margin: 0;
}

.home-page__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.home-page__section-title {
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.home-page__section-meta {
  color: var(--color-muted);
  line-height: 1.6;
}

.home-page__question-list {
  display: grid;
  gap: var(--space-md);
}

@media (width <= 980px) {
  .home-page__content {
    grid-template-columns: 1fr;
  }

  .home-page__sidebar {
    position: static;
    max-height: none;
    overflow-y: visible;
    scrollbar-gutter: auto;
  }
}

@media (width <= 640px) {
  .home-page__section-title {
    font-size: 24px;
  }
}
</style>
