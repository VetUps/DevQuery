import { nextTick, ref, toValue } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProfileFavoritesTab from '@/features/questions/components/ProfileFavoritesTab.vue'
import { useFavoriteQuestionListQuery } from '@/features/questions/queries/useFavoriteQuestionListQuery'

const favoriteMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

const favoritesQueryState = {
  data: ref<any>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  isPlaceholderData: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/questions/queries/useFavoriteQuestionListQuery', () => ({
  useFavoriteQuestionListQuery: vi.fn(() => favoritesQueryState),
}))

vi.mock('@/features/questions/mutations/useQuestionFavoriteMutation', () => ({
  useQuestionFavoriteMutation: vi.fn(() => favoriteMutationState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => ({
    data: ref([{ name: 'vue', questions_count: 4 }]),
    isError: ref(false),
    isFetching: ref(false),
  })),
}))

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    question_id: 'favorite-question-1',
    user: 'user-1',
    question_title: 'Как сохранить вопрос в избранном?',
    question_status: 'open',
    question_created_at: '2026-03-01T12:00:00Z',
    question_updated_at: '2026-03-02T12:00:00Z',
    favorites_count: 3,
    is_favorited: true,
    tags: [{ name: 'vue', questions_count: 4 }],
    ...overrides,
  }
}

async function mountProfileFavorites(initialPath = '/profile?tab=favorites') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', component: ProfileFavoritesTab },
      { path: '/questions/:questionId', component: { template: '<div>question detail</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })

  await router.push(initialPath)
  await router.isReady()

  const wrapper = mount(ProfileFavoritesTab, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: {
        teleport: true,
      },
    },
  })

  await flushPromises()

  return { wrapper, router }
}

describe('profile favorites tab', () => {
  beforeEach(() => {
    favoritesQueryState.data.value = { count: 0, next: null, previous: null, results: [] }
    favoritesQueryState.isPending.value = false
    favoritesQueryState.isError.value = false
    favoritesQueryState.isPlaceholderData.value = false
    favoritesQueryState.refetch.mockReset()
    favoriteMutationState.isPending.value = false
    favoriteMutationState.mutateAsync.mockReset()
    vi.mocked(useFavoriteQuestionListQuery).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('normalizes favorites route params before querying saved questions', async () => {
    await mountProfileFavorites('/profile?tab=favorites&page=-2&ordering=bad&tag=Vue&tag=&tag=vue&search=%20django%20')

    const params = toValue(vi.mocked(useFavoriteQuestionListQuery).mock.calls.at(-1)?.[0])

    expect(params).toEqual({
      page: 1,
      search: 'django',
      ordering: '-question_created_at',
      tags: ['vue'],
    })
  })

  it('debounces search URL updates and preserves the favorites tab query', async () => {
    vi.useFakeTimers()

    const { wrapper, router } = await mountProfileFavorites('/profile?tab=favorites&tag=vue&ordering=question_created_at&page=3')

    await wrapper.get('[data-testid="question-search-input"]').setValue(' serializers ')
    await vi.advanceTimersByTimeAsync(499)
    expect(router.currentRoute.value.query.search).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      tab: 'favorites',
      tag: ['vue'],
      ordering: 'question_created_at',
      search: 'serializers',
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()
  })

  it('preserves tab=favorites while changing ordering, tags, and pages', async () => {
    favoritesQueryState.data.value = {
      count: 11,
      next: '/question/favorites/?page=3',
      previous: '/question/favorites/?page=1',
      results: [makeQuestion()],
    }

    const { wrapper, router } = await mountProfileFavorites('/profile?tab=favorites&page=2&search=django')

    await wrapper.get('[data-testid="question-ordering-select"]').setValue('question_created_at')
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      tab: 'favorites',
      search: 'django',
      ordering: 'question_created_at',
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()

    await wrapper.get('[data-testid="discovery-tag-draft"]').setValue(' Vue ')
    await wrapper.get('[data-testid="discovery-tag-add"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      tab: 'favorites',
      search: 'django',
      ordering: 'question_created_at',
      tag: ['vue'],
    })

    await wrapper.get('button[aria-label="Следующая страница"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      tab: 'favorites',
      search: 'django',
      ordering: 'question_created_at',
      tag: ['vue'],
      page: '2',
    })
  })

  it('renders loading, plain empty, filtered empty, and retry states inside the favorites workspace', async () => {
    favoritesQueryState.data.value = null
    favoritesQueryState.isPending.value = true

    const loading = await mountProfileFavorites()
    expect(loading.wrapper.get('[data-testid="profile-favorites-workspace"]').find('[data-testid="question-list-skeleton"]').exists()).toBe(true)
    loading.wrapper.unmount()

    favoritesQueryState.data.value = { count: 0, next: null, previous: null, results: [] }
    favoritesQueryState.isPending.value = false

    const empty = await mountProfileFavorites()
    expect(empty.wrapper.get('[data-testid="profile-favorites-state-empty"]').text()).toContain('Сохранённых вопросов пока нет')
    empty.wrapper.unmount()

    const filtered = await mountProfileFavorites('/profile?tab=favorites&search=django&tag=vue')
    expect(filtered.wrapper.get('[data-testid="profile-favorites-state-empty"]').text()).toContain('по запросу «django»')
    expect(filtered.wrapper.get('[data-testid="profile-favorites-state-empty"]').text()).toContain('#vue')
    await filtered.wrapper.get('[data-testid="profile-favorites-state-empty"] button').trigger('click')
    await flushPromises()
    expect(filtered.router.currentRoute.value.query).toEqual({ tab: 'favorites' })
    filtered.wrapper.unmount()

    favoritesQueryState.isError.value = true
    const error = await mountProfileFavorites('/profile?tab=favorites&search=django')
    expect(error.wrapper.get('[data-testid="profile-favorites-state-error"]').text()).toContain('Активные фильтры сохранены')
    await error.wrapper.get('[data-testid="profile-favorites-state-error"] button').trigger('click')
    expect(favoritesQueryState.refetch).toHaveBeenCalledOnce()
  })

  it('renders saved question cards with authenticated favorite controls and detail links', async () => {
    favoritesQueryState.data.value = {
      count: 1,
      next: null,
      previous: null,
      results: [makeQuestion({ question_id: 'favorite-question-42', favorites_count: 8 })],
    }

    const { wrapper, router } = await mountProfileFavorites()

    expect(wrapper.get('[data-testid="profile-favorites-count"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="question-card"]').text()).toContain('Как сохранить вопрос в избранном?')
    expect(wrapper.get('[data-testid="question-favorite-action"]').attributes('data-authenticated')).toBe('true')
    expect(wrapper.get('[data-testid="question-favorite-action"]').attributes('data-favorited')).toBe('true')
    expect(wrapper.get('[data-testid="question-favorite-count"]').text()).toBe('8')
    expect(wrapper.get('a.question-card__link').attributes('href')).toBe('/questions/favorite-question-42')
    expect(wrapper.get('[data-testid="question-tag-chips"] a').attributes('href')).toBe('/profile?tab=favorites&tag=vue')

    await wrapper.get('[data-testid="question-tag-chips"] a').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/profile')
    expect(router.currentRoute.value.query).toEqual({
      tab: 'favorites',
      tag: 'vue',
    })

    await router.push('/profile?tab=favorites')
    await flushPromises()

    await wrapper.get('[data-testid="question-favorite-button"]').trigger('click')
    await nextTick()

    expect(favoriteMutationState.mutateAsync).toHaveBeenCalledWith({
      questionId: 'favorite-question-42',
      isFavorited: false,
    })
    expect(router.currentRoute.value.fullPath).toBe('/profile?tab=favorites')
  })
})
