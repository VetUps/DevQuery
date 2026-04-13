import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import { useSessionStore } from '@/features/auth/stores/session'

const queryState = {
  data: ref<any>({
    count: 12,
    next: null,
    previous: null,
    results: [],
  }),
  isPending: ref(false),
  isError: ref(false),
  isPlaceholderData: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn(() => queryState),
}))

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => ({
    data: ref(null),
    isPending: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
  })),
}))

async function mountHomePage(options: { authenticated?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const sessionStore = useSessionStore()

  if (options.authenticated) {
    sessionStore.setSession({
      access: 'access-token',
      refresh: 'refresh-token',
    })
  } else {
    sessionStore.clearSession()
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/questions/ask', component: { template: '<div>ask</div>' } },
      { path: '/profile', component: { template: '<div>profile</div>' } },
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

  return { wrapper }
}

function collectLinks(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('a')
    .map((link) => ({
      text: link.text(),
      href: link.attributes('href') ?? '',
    }))
}

describe('discovery shell polish', () => {
  beforeEach(() => {
    localStorage.clear()
    queryState.data.value = {
      count: 12,
      next: null,
      previous: null,
      results: [],
    }
    queryState.isPending.value = false
    queryState.isError.value = false
    queryState.isPlaceholderData.value = false
    queryState.refetch.mockReset()
  })

  it('renders the discovery-first reserve in the main column', async () => {
    const { wrapper } = await mountHomePage()

    expect(wrapper.get('[data-testid="discovery-search-reserve"]').text()).toContain(
      'Найдите вопрос по названию',
    )
    expect(wrapper.get('[data-testid="question-search-input"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="question-ordering-select"]').text()).toContain('Сначала новые')
  })

  it('keeps guest ask-question entry pointed at registration', async () => {
    const { wrapper } = await mountHomePage()
    const links = collectLinks(wrapper)

    expect(
      links.some((link) => link.text.includes('Задать вопрос') && link.href === '/register'),
    ).toBe(true)
  })

  it('switches ask-question entry to the authoring route for authenticated users', async () => {
    const { wrapper } = await mountHomePage({ authenticated: true })
    const links = collectLinks(wrapper)

    expect(
      links.some((link) => link.text.includes('Задать вопрос') && link.href === '/questions/ask'),
    ).toBe(true)
  })
})
