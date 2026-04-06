import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'

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

async function mountHomePage() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })

  await router.push('/')
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
})
