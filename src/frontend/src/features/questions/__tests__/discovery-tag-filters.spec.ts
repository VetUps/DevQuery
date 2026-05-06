import { ref, toValue } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => ({
    data: ref(null),
    isPending: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
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
      { path: '/questions/ask', component: { template: '<div>ask</div>' } },
      { path: '/profile', component: { template: '<div>profile</div>' } },
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

function latestListParams() {
  return toValue(vi.mocked(useQuestionListQuery).mock.calls.at(-1)?.[0])
}

describe('discovery tag filters', () => {
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes repeated malformed tag params before querying and rendering active chips', async () => {
    const { wrapper } = await mountHomePage('/?tag=&tag=Vue&tag=vue&tag=%20%20django%20%20&search=serializer&ordering=question_created_at&page=2')

    expect(latestListParams()).toEqual({
      page: 2,
      search: 'serializer',
      ordering: 'question_created_at',
      tags: ['vue', 'django'],
    })

    const activeFilters = wrapper.get('[data-testid="discovery-tag-chips"]')
    expect(activeFilters.text()).toContain('#vue')
    expect(activeFilters.text()).toContain('#django')
    expect(activeFilters.text()).not.toContain('#Vue')
  })

  it('removes one tag filter without dropping search or ordering and resets pagination', async () => {
    const { wrapper, router } = await mountHomePage('/?tag=vue&tag=django&search=serializer&ordering=question_created_at&page=3')

    await wrapper.get('button[aria-label="Убрать фильтр по тегу vue"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      tag: ['django'],
      search: 'serializer',
      ordering: 'question_created_at',
    })
    expect(latestListParams()).toMatchObject({ tags: ['django'], page: 1 })
  })

  it('clears all tag filters while preserving search and removes tag from the URL', async () => {
    const { wrapper, router } = await mountHomePage('/?tag=vue&search=serializer&page=2')

    await wrapper.get('[data-testid="discovery-tag-clear-all"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ search: 'serializer' })
    expect(latestListParams()).toMatchObject({ tags: [], search: 'serializer', page: 1 })
  })

  it('preserves active tags when ordering or debounced search changes reset the page', async () => {
    vi.useFakeTimers()
    const { wrapper, router } = await mountHomePage('/?tag=vue&tag=django&page=4')

    await wrapper.get('[data-testid="question-ordering-select"]').setValue('question_created_at')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      tag: ['vue', 'django'],
      ordering: 'question_created_at',
    })

    await wrapper.get('[data-testid="question-search-input"]').setValue('composables')
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      tag: ['vue', 'django'],
      ordering: 'question_created_at',
      search: 'composables',
    })
    expect(latestListParams()).toMatchObject({
      tags: ['vue', 'django'],
      ordering: 'question_created_at',
      search: 'composables',
      page: 1,
    })
  })

  it('preserves search, ordering, and normalized repeated tag params when paginating forward', async () => {
    queryState.data.value = {
      count: 30,
      next: 'http://api.example.test/question/?page=3',
      previous: 'http://api.example.test/question/?page=1',
      results: [],
    }

    const { wrapper, router } = await mountHomePage('/?tag=Vue&tag=&tag=vue&tag=DJANGO&page=2&search=serializer&ordering=question_created_at')

    await wrapper.get('button[aria-label="Следующая страница"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      tag: ['vue', 'django'],
      page: '3',
      search: 'serializer',
      ordering: 'question_created_at',
    })
    expect(latestListParams()).toMatchObject({
      tags: ['vue', 'django'],
      page: 3,
      search: 'serializer',
      ordering: 'question_created_at',
    })
  })

  it('removes page while preserving search, ordering, and repeated tags when paginating back to page one', async () => {
    queryState.data.value = {
      count: 30,
      next: 'http://api.example.test/question/?page=3',
      previous: 'http://api.example.test/question/?page=1',
      results: [],
    }

    const { wrapper, router } = await mountHomePage('/?tag=Vue&tag=&tag=vue&tag=DJANGO&page=2&search=serializer&ordering=question_created_at')

    await wrapper.get('button[aria-label="Предыдущая страница"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      tag: ['vue', 'django'],
      search: 'serializer',
      ordering: 'question_created_at',
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(latestListParams()).toMatchObject({
      tags: ['vue', 'django'],
      page: 1,
      search: 'serializer',
      ordering: 'question_created_at',
    })
  })

  it('keeps active filters visible and retryable when the list query errors', async () => {
    queryState.isError.value = true

    const { wrapper } = await mountHomePage('/?tag=vue&tag=django')

    expect(wrapper.get('[data-testid="discovery-tag-chips"]').text()).toContain('#vue')
    expect(wrapper.get('[data-testid="question-list-state-error"]').text()).toContain('Активные фильтры сохранены')

    await wrapper.get('[data-testid="question-list-state-error"] button').trigger('click')

    expect(queryState.refetch).toHaveBeenCalled()
  })

  it('shows filter-aware empty copy and clears search plus tags from the empty reset action', async () => {
    const { wrapper, router } = await mountHomePage('/?tag=vue&search=serializer')

    const emptyState = wrapper.get('[data-testid="question-list-state-empty"]')
    expect(emptyState.text()).toContain('с тегами #vue')
    expect(emptyState.text()).toContain('serializer')

    await emptyState.get('button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({})
    expect(latestListParams()).toMatchObject({ search: '', tags: [], page: 1 })
  })
})
