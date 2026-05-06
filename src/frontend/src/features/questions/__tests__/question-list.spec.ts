import { ref, toValue } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import { useQuestionListQuery } from '@/features/questions/queries/useQuestionListQuery'

const queryState = {
  data: ref<any>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  isPlaceholderData: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn(() => queryState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => ({
    data: ref([]),
    isError: ref(false),
    isFetching: ref(false),
  })),
}))

async function mountHomePage(initialPath = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/questions/:questionId', component: { template: '<div>question detail</div>' } },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })

  await router.push(initialPath)
  await router.isReady()

  const wrapper = mount(HomePage, {
    global: {
      plugins: [pinia, router],
    },
  })

  await flushPromises()

  return { wrapper, router }
}

describe('question list home page', () => {
  beforeEach(() => {
    localStorage.clear()
    queryState.data.value = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    }
    queryState.isPending.value = false
    queryState.isError.value = false
    queryState.isPlaceholderData.value = false
    queryState.refetch.mockReset()
    vi.mocked(useQuestionListQuery).mockClear()
  })

  it('renders the loading skeleton while the list query is pending', async () => {
    queryState.data.value = null
    queryState.isPending.value = true

    const { wrapper } = await mountHomePage()

    expect(wrapper.find('[data-testid="question-list-skeleton"]').exists()).toBe(true)
  })

  it('renders the plain empty state when there are no questions', async () => {
    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Вопросов пока нет')
  })

  it('renders the retry action when the list query fails', async () => {
    queryState.isError.value = true

    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Попробовать снова')

    await wrapper.get('[data-testid="question-list-state-error"] button').trigger('click')

    expect(queryState.refetch).toHaveBeenCalled()
  })

  it('renders protected newcomer card metadata and blocked-action explanations on the public list', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-protected-1',
          user: 'user-protected',
          question_title: 'Как пережить первые 12 часов вопроса новичка?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          is_protected: true,
          protection_reason_code: 'question_protected_newcomer',
          protected_until: '2026-03-01T23:59:00Z',
          author_level: 'newcomer',
          author_points_to_next_level: 30,
          author_next_level: 'participant',
          author_next_level_label: 'Участник',
          viewer_can_answer: false,
          viewer_answer_reason_code: 'answer_blocked_insufficient_level',
          viewer_answer_reason_message: 'Этот вопрос новичка защищён на первые 12 часов. Отвечать сейчас могут только участники уровня Эксперт или Мастер.',
          viewer_answer_required_level: 'expert',
          viewer_answer_required_level_label: 'Эксперт',
          viewer_level: 'participant',
          viewer_level_label: 'Участник',
          viewer_points_to_next_level: 70,
          viewer_next_level: 'expert',
          viewer_next_level_label: 'Эксперт',
          viewer_can_downvote: false,
          viewer_downvote_reason_code: 'question_downvote_blocked_protected',
          viewer_downvote_reason_message: 'В первые 12 часов после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.',
          tags: [{ name: 'django', questions_count: 6 }],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.get('[data-testid="question-card-protection"]').text()).toContain('Защита 12 часов')
    expect(wrapper.get('[data-testid="question-card-protection-panel"]').text()).toContain('Защищённый вопрос · Эксперт+ отвечают первые 12 часов')
    expect(wrapper.get('[data-testid="question-card-protection-panel"]').text()).toContain('В течение первых 12 часов после публикации отвечать могут только эксперты и мастера.')
    expect(wrapper.get('[data-testid="question-card-answer-blocked-reason"]').text()).toContain('Отвечать сейчас могут только участники уровня Эксперт или Мастер')
    expect(wrapper.get('[data-testid="question-card-downvote-blocked-reason"]').text()).toContain('даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи')
  })

  it('updates list protection copy when the backend window duration changes', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-protected-24h',
          user: 'user-protected',
          question_title: 'Как пережить первые 24 часа вопроса новичка?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          is_protected: true,
          protection_reason_code: 'question_protected_newcomer',
          protected_until: '2026-03-02T12:00:00Z',
          author_level: 'newcomer',
          author_points_to_next_level: 30,
          author_next_level: 'participant',
          author_next_level_label: 'Участник',
          viewer_can_answer: false,
          viewer_answer_reason_code: 'answer_blocked_insufficient_level',
          viewer_answer_reason_message: 'Этот вопрос новичка защищён на первые 24 часа. Отвечать сейчас могут только участники уровня Эксперт или Мастер.',
          viewer_answer_required_level: 'expert',
          viewer_answer_required_level_label: 'Эксперт',
          viewer_level: 'participant',
          viewer_level_label: 'Участник',
          viewer_points_to_next_level: 70,
          viewer_next_level: 'expert',
          viewer_next_level_label: 'Эксперт',
          viewer_can_downvote: false,
          viewer_downvote_reason_code: 'question_downvote_blocked_protected',
          viewer_downvote_reason_message: 'В первые 24 часа после публикации у вопросов новичков отключены даунвоуты, чтобы обсуждение начиналось с содержательной обратной связи.',
          tags: [{ name: 'django', questions_count: 6 }],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.get('[data-testid="question-card-protection"]').text()).toContain('Защита 24 часов')
    expect(wrapper.get('[data-testid="question-card-protection-panel"]').text()).toContain('Защищённый вопрос · Эксперт+ отвечают первые 24 часов')
    expect(wrapper.get('[data-testid="question-card-protection-panel"]').text()).toContain('В течение первых 24 часов после публикации отвечать могут только эксперты и мастера.')
    expect(wrapper.get('[data-testid="question-card-answer-blocked-reason"]').text()).toContain('первые 24 часа')
    expect(wrapper.get('[data-testid="question-card-downvote-blocked-reason"]').text()).toContain('В первые 24 часа после публикации')
  })

  it('renders linked public tag chips and compact expert reputation on tagged question cards', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-1',
          user: 'user-1',
          question_title: 'Как связать Vue Query и DRF tags?',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          reputation: {
            score: 260,
            level: 'expert',
            level_label: 'Backend Expert',
            next_level: 'master',
            points_to_next_level: 90,
          },
          tags: [
            { name: 'vue', questions_count: 12 },
            { name: 'django-rest-framework', questions_count: 8 },
          ],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    const badge = wrapper.get('[data-testid="author-reputation-badge"]')
    expect(badge.text()).toContain('Backend Expert')
    expect(badge.text()).toContain('260')
    expect(badge.attributes('aria-label')).toBe('Репутация автора: Backend Expert, 260 очк.')

    const chips = wrapper.find('[data-testid="question-tag-chips"]')
    expect(chips.exists()).toBe(true)
    expect(chips.text()).toContain('#vue')
    expect(chips.text()).toContain('#django-rest-framework')
    expect(chips.text()).not.toContain('questions_count')

    const tagLinks = chips.findAll('a')
    expect(tagLinks).toHaveLength(2)
    expect(tagLinks[0].attributes('href')).toBe('/?tag=vue')
    expect(tagLinks[0].attributes('aria-label')).toBe('Фильтровать вопросы по тегу vue')
    expect(tagLinks[1].attributes('href')).toBe('/?tag=django-rest-framework')
  })

  it('renders a legacy score-only reputation badge without requiring summary metadata', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-legacy-reputation',
          user: 'user-legacy',
          question_title: 'Legacy question with score-only reputation remains readable',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          user_reputation_score: 42,
          tags: [],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Legacy question with score-only reputation remains readable')
    const badge = wrapper.get('[data-testid="author-reputation-badge"]')
    expect(badge.text()).toContain('Репутация')
    expect(badge.text()).toContain('42')
  })

  it('does not render an empty tag chip container for untagged question cards', async () => {
    queryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          question_id: 'question-2',
          user: 'user-2',
          question_title: 'Legacy question without tags remains readable',
          question_status: 'open',
          question_created_at: '2026-03-01T12:00:00Z',
          question_updated_at: '2026-03-02T12:00:00Z',
          tags: [],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

    expect(wrapper.text()).toContain('Legacy question without tags remains readable')
    expect(wrapper.find('[data-testid="question-tag-chips"]').exists()).toBe(false)
  })

  it('passes discovery URL params into the question list query', async () => {
    await mountHomePage('/?search=django&ordering=question_created_at&page=2')

    const params = toValue(vi.mocked(useQuestionListQuery).mock.calls.at(-1)?.[0])

    expect(params).toEqual({
      page: 2,
      search: 'django',
      ordering: 'question_created_at',
      tags: [],
    })
  })
})
