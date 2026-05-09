import { nextTick, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type LocationQueryRaw } from 'vue-router'

import { useSessionStore } from '@/features/auth/stores/session'
import type { PaginatedResponse, QuestionListItem, QuestionListParams } from '@/features/questions/api/questions'
import HomePage from '@/pages/HomePage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'

const currentUserState = vi.hoisted(() => ({
  data: { value: null as any },
  isPending: { value: false },
  isError: { value: false },
  error: { value: null as unknown },
  refetch: vi.fn(),
}))

const questionListCapture = vi.hoisted(() => ({
  params: null as MaybeRefOrGetter<QuestionListParams> | null,
}))

const questionListState = vi.hoisted(() => ({
  data: { value: null as PaginatedResponse<QuestionListItem> | null },
  isPending: { value: false },
  isError: { value: false },
  isPlaceholderData: { value: false },
  refetch: vi.fn(),
}))

const tagAutocompleteState = vi.hoisted(() => ({
  data: [] as unknown,
  isError: false,
  isFetching: false,
}))

const notificationsQueryState = vi.hoisted(() => ({
  data: { value: { count: 0, next: null, previous: null, results: [] } },
  isPending: { value: false },
  isError: { value: false },
  refetch: vi.fn(),
}))

const mountedWrappers: VueWrapper[] = []

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn((params: MaybeRefOrGetter<QuestionListParams>) => {
    questionListCapture.params = params

    return questionListState
  }),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteState),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => notificationsQueryState),
}))

vi.mock('@/features/solutions/components/ProfileEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="solution-review-workspace">Очередь правок к вашим решениям готова к проверке.</div>',
  },
}))

vi.mock('@/features/questions/components/ProfileQuestionEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="question-review-workspace">Очередь правок к вашим вопросам готова к проверке.</div>',
  },
}))

vi.mock('@/features/solutions/components/ProfileEditHistoryTab.vue', () => ({
  default: {
    template: '<div data-testid="history-workspace">История обработанных правок к вашим решениям доступна в профиле.</div>',
  },
}))

function buildQuestion(overrides: Partial<QuestionListItem> = {}): QuestionListItem {
  return {
    question_id: 'question-1',
    user: 'user-1',
    user_name: 'Sergey',
    user_reputation_score: 128,
    reputation: {
      score: 128,
      level: 'expert',
      level_label: 'Эксперт',
      level_minimum_score: 100,
      is_manual_override: false,
      manual_level: null,
      next_level: 'master',
      next_level_label: 'Мастер',
      next_level_minimum_score: 300,
      points_to_next_level: 172,
    },
    question_title: 'Как сохранить query параметры при пагинации Vue Router?',
    question_status: 'open',
    question_created_at: '2026-05-01T10:00:00Z',
    question_updated_at: '2026-05-02T10:00:00Z',
    tags: [
      { name: 'vue', questions_count: 12 },
      { name: 'django', questions_count: 7 },
    ],
    is_protected: false,
    protection_reason_code: 'question_not_protected',
    protected_until: null,
    author_level: null,
    author_points_to_next_level: null,
    author_next_level: null,
    author_next_level_label: null,
    viewer_can_answer: true,
    viewer_answer_reason_code: 'answer_allowed',
    viewer_answer_reason_message: '',
    viewer_answer_required_level: null,
    viewer_answer_required_level_label: null,
    viewer_level: null,
    viewer_level_label: null,
    viewer_points_to_next_level: null,
    viewer_next_level: null,
    viewer_next_level_label: null,
    viewer_can_downvote: true,
    viewer_downvote_reason_code: 'question_downvote_allowed',
    viewer_downvote_reason_message: '',
    ...overrides,
  }
}

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    user_name: 'Sergey',
    user_email: 'sergey@example.com',
    user_reputation_score: 128,
    user_avatar_url: null,
    user_bio: null,
    user_created_at: '2026-04-01T09:15:00Z',
    reputation: {
      score: 128,
      level: 'expert',
      level_label: 'Эксперт',
      level_minimum_score: 100,
      is_manual_override: false,
      manual_level: null,
      next_level: 'master',
      next_level_label: 'Мастер',
      next_level_minimum_score: 300,
      points_to_next_level: 172,
    },
    reputation_ledger: [
      {
        id: 'ledger-1',
        amount: 15,
        reason: 'best_solution',
        note: 'Ваш ответ выбрали лучшим решением.',
        actor_name: 'Question Author',
        created_at: '2026-05-05T12:00:00Z',
      },
    ],
    ...overrides,
  }
}

function resetFrontendState() {
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  currentUserState.data.value = null
  currentUserState.isPending.value = false
  currentUserState.isError.value = false
  currentUserState.error.value = null
  currentUserState.refetch.mockReset()
  questionListCapture.params = null
  questionListState.data.value = {
    count: 42,
    next: '/question/?page=3',
    previous: '/question/?page=1',
    results: [buildQuestion()],
  }
  questionListState.isPending.value = false
  questionListState.isError.value = false
  questionListState.isPlaceholderData.value = false
  questionListState.refetch.mockReset()
  tagAutocompleteState.data = []
  tagAutocompleteState.isError = false
  tagAutocompleteState.isFetching = false
  notificationsQueryState.data.value = { count: 0, next: null, previous: null, results: [] }
  notificationsQueryState.isPending.value = false
  notificationsQueryState.isError.value = false
  notificationsQueryState.refetch.mockReset()
}

async function flushUi() {
  await flushPromises()
  await nextTick()
}

function capturedQuestionParams() {
  if (!questionListCapture.params) {
    throw new Error('Question list params were not captured')
  }

  return toValue(questionListCapture.params)
}

async function mountRoute(path: '/' | '/profile', initialQuery: LocationQueryRaw = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/profile', component: ProfilePage },
    ],
  })

  await router.push({ path, query: initialQuery })
  await router.isReady()

  const component = path === '/' ? HomePage : ProfilePage
  const wrapper = mount(component, {
    global: {
      plugins: [pinia, router],
    },
  })
  mountedWrappers.push(wrapper)
  await flushUi()

  return { wrapper, router, sessionStore: useSessionStore() }
}

function scopedText(wrapper: VueWrapper, selector: string) {
  return wrapper.get(selector).text()
}

const prototypeMarkerPattern = new RegExp([
  'M' + '00[0-9]',
  'mile' + 'stone',
  'появится' + ' позже',
  'будущие' + ' ограничения',
  'здесь (будет|появится)',
  'road' + 'map',
  'роад' + 'мап',
  'прото' + 'тип',
  'prototype' + ' copy',
  'prototype' + '-copy',
].join('|'), 'i')

describe('product polish assembly', () => {
  beforeEach(() => {
    resetFrontendState()
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }

    resetFrontendState()
  })

  it('composes the compact header, discovery-only home sidebar, and query-safe compact pagination', async () => {
    const { wrapper, router } = await mountRoute('/', {
      page: '2',
      tag: [' Vue ', 'vue', '', 'DJANGO'],
      search: 'serializer',
      ordering: 'question_created_at',
    })

    expect(wrapper.get('[data-testid="app-header"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="ask-question-link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('[data-testid="register-link"]').attributes('href')).toBe('/register')
    expect(wrapper.get('[data-testid="login-link"]').attributes('href')).toBe('/login')

    const sidebarText = scopedText(wrapper, '[data-testid="home-discovery-sidebar"]')
    expect(sidebarText).toContain('Публичная лента')
    expect(sidebarText).toContain('Читать, а потом отвечать')
    expect(sidebarText).not.toContain('Быстрый вход')
    expect(sidebarText).not.toContain('Создать аккаунт')
    expect(sidebarText).not.toMatch(prototypeMarkerPattern)

    expect(capturedQuestionParams()).toMatchObject({
      page: 2,
      search: 'serializer',
      ordering: 'question_created_at',
      tags: ['vue', 'django'],
    })
    expect(wrapper.get('[data-testid="question-list-pagination"]').text()).toBe('‹2›')

    const [, nextButton] = wrapper.findAll('[data-testid="question-list-pagination"] button')
    await nextButton.trigger('click')
    await flushUi()

    expect(router.currentRoute.value.query).toEqual({
      page: '3',
      tag: ['vue', 'django'],
      search: 'serializer',
      ordering: 'question_created_at',
    })
  })

  it('composes the authenticated header and profile reputation dialog cleanup across tab navigation', async () => {
    currentUserState.data.value = buildProfile()
    const { wrapper, router, sessionStore } = await mountRoute('/profile')

    sessionStore.setSession({
      access: 'synthetic-access-token',
      refresh: 'synthetic-refresh-token',
    })
    await flushUi()

    expect(wrapper.get('[data-testid="app-header"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="ask-question-link"]').attributes('href')).toBe('/questions/ask')
    expect(wrapper.get('[data-testid="account-menu-toggle"]').attributes('title')).toBe('Sergey')
    expect(wrapper.text()).toContain('Sergey')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await wrapper.get('[data-testid="reputation-explanation-trigger"]').trigger('click')
    await flushUi()

    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Как работает репутация')
    expect(document.body.querySelector('[data-testid="reputation-explanation-panel"]')?.textContent).toContain('Лучшее решение+15')
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.get('[data-testid="profile-tab-history"]').trigger('click')
    await flushUi()

    expect(router.currentRoute.value.query).toEqual({ tab: 'history' })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="reputation-explanation-panel"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(wrapper.text()).toContain('История обработанных правок к вашим решениям доступна в профиле.')
  })
})
