<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import { useQuestionListQuery } from '@/features/questions/queries/useQuestionListQuery'
import DiscoverySearchReserve from '@/features/questions/components/DiscoverySearchReserve.vue'
import PublicDiscoveryIntro from '@/features/questions/components/PublicDiscoveryIntro.vue'
import QuestionCard from '@/features/questions/components/QuestionCard.vue'
import QuestionListPagination from '@/features/questions/components/QuestionListPagination.vue'
import QuestionListSkeleton from '@/features/questions/components/QuestionListSkeleton.vue'
import { useSessionStore } from '@/features/auth/stores/session'
import AppShellLayout from '@/layouts/AppShellLayout.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'
import AppButton from '@/shared/ui/AppButton.vue'

function normalizePage(rawPage: unknown) {
  const parsedPage = Number.parseInt(String(rawPage ?? '1'), 10)

  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage
}

const route = useRoute()
const sessionStore = useSessionStore()
const { isAuthenticated } = storeToRefs(sessionStore)

const currentPage = computed(() => normalizePage(route.query.page))
const questionListQuery = useQuestionListQuery(currentPage)

const questionList = computed(() => questionListQuery.data.value?.results ?? [])
const totalQuestions = computed(() => questionListQuery.data.value?.count ?? 0)
const hasNextPage = computed(() => Boolean(questionListQuery.data.value?.next))
const askQuestionTarget = computed(() => (isAuthenticated.value ? '/questions/ask' : '/register'))
const isLoadingList = computed(
  () => questionListQuery.isPending.value && !questionListQuery.data.value,
)
const isEmptyList = computed(
  () => !questionListQuery.isPending.value && !questionListQuery.isError.value && questionList.value.length === 0,
)
</script>

<template>
  <AppShellLayout>
    <section class="home-page">
      <div class="home-page__content">
        <div class="home-page__main">
          <DiscoverySearchReserve :total-questions="totalQuestions" />

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
              description="Мы не смогли получить список вопросов с сервера. Повторите запрос ещё раз."
              :show-action="true"
              action-label="Попробовать снова"
              tone="danger"
              data-testid="question-list-state-error"
              @action="questionListQuery.refetch()"
            />

            <InlineFeedbackPanel
              v-else-if="isEmptyList"
              eyebrow="Публичная лента"
              title="Вопросов пока нет"
              description="Как только в системе появятся новые обсуждения, они сразу покажутся здесь."
              data-testid="question-list-state-empty"
            />

            <div v-else class="home-page__question-list">
              <QuestionCard
                v-for="question in questionList"
                :key="question.question_id"
                :question="question"
              />
            </div>

            <QuestionListPagination
              :page="currentPage"
              :has-next-page="hasNextPage"
              :is-busy="questionListQuery.isPlaceholderData.value"
            />
          </SurfacePanel>
        </div>

        <aside class="home-page__sidebar" aria-label="Дополнительная информация">
          <PublicDiscoveryIntro :total-questions="totalQuestions" />

          <SurfacePanel class="home-page__sidebar-card">
            <p class="home-page__eyebrow">Быстрый вход</p>
            <h2 class="home-page__sidebar-title">
              {{ isAuthenticated ? 'Сессия активна' : 'Подключайтесь к обсуждениям' }}
            </h2>
            <p class="home-page__sidebar-text">
              <template v-if="isAuthenticated">
                Задавайте свои вопросы и предлагайте решения
              </template>
              <template v-else>
                Зарегистрируйтесь, чтобы задавать свои вопросы и предлагать
                решения.
              </template>
            </p>

            <div class="home-page__sidebar-actions">
              <RouterLink :to="askQuestionTarget">
                <AppButton>Задать вопрос</AppButton>
              </RouterLink>

              <RouterLink v-if="!isAuthenticated" to="/register">
                <AppButton variant="secondary">Создать аккаунт</AppButton>
              </RouterLink>

              <RouterLink v-if="!isAuthenticated" to="/login">
                <AppButton variant="ghost">Войти</AppButton>
              </RouterLink>
            </div>
          </SurfacePanel>
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

.home-page__list-section,
.home-page__sidebar-card {
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
.home-page__section-meta,
.home-page__sidebar-title,
.home-page__sidebar-text {
  margin: 0;
}

.home-page__eyebrow {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.home-page__section-title,
.home-page__sidebar-title {
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.home-page__section-meta,
.home-page__sidebar-text {
  color: var(--color-muted);
  line-height: 1.6;
}

.home-page__question-list,
.home-page__sidebar-actions {
  display: grid;
  gap: var(--space-md);
}

.home-page__sidebar-actions :deep(a) {
  display: inline-flex;
}

@media (width <= 980px) {
  .home-page__content {
    grid-template-columns: 1fr;
  }

  .home-page__sidebar-card {
    position: static;
  }
}

@media (width <= 640px) {
  .home-page__section-title,
  .home-page__sidebar-title {
    font-size: 24px;
  }
}
</style>
