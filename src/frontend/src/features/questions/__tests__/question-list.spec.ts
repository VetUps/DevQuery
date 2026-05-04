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

  it('renders linked public tag chips on tagged question cards', async () => {
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
          tags: [
            { name: 'vue', questions_count: 12 },
            { name: 'django-rest-framework', questions_count: 8 },
          ],
        },
      ],
    }

    const { wrapper } = await mountHomePage()

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
