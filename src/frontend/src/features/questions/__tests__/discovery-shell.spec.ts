import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => ({
    data: ref({ count: 0, next: null, previous: null, results: [] }),
    isPending: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
  })),
  useNotificationSummaryQuery: vi.fn(() => ({
    data: ref({ unread_count: 0 }),
    isPending: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
  })),
}))

vi.mock('@/features/users/queries/useTopUsersQuery', () => ({
  useTopUsersQuery: vi.fn(() => ({
    data: ref({ count: 0, next: null, previous: null, results: [] }),
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

function collectLinks(wrapper: VueWrapper) {
  return wrapper
    .findAll('a')
    .map((link) => ({
      text: link.text(),
      href: link.attributes('href') ?? '',
    }))
}

function expectDiscoveryOnlySidebar(wrapper: VueWrapper) {
  const sidebar = wrapper.get('[data-testid="home-discovery-sidebar"]')
  const sidebarText = sidebar.text()

  expect(sidebarText).toContain('Публичная лента')
  expect(sidebarText).toContain('Читать, а потом отвечать')
  expect(sidebarText).toContain('Сейчас в ленте 12 вопросов')
  expect(sidebarText).not.toContain('Быстрый вход')
  expect(sidebarText).not.toContain('Задать вопрос')
  expect(sidebarText).not.toContain('Создать аккаунт')
  expect(sidebarText).not.toContain('Войти')
  expect(sidebar.findAll('a')).toHaveLength(0)
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

  it('keeps guest ask-question entry in the header while the sidebar stays discovery-only', async () => {
    const { wrapper } = await mountHomePage()
    const links = collectLinks(wrapper)

    expectDiscoveryOnlySidebar(wrapper)
    expect(
      links.some((link) => link.text.includes('Задать вопрос') && link.href === '/register'),
    ).toBe(true)
  })

  it('keeps authenticated ask-question entry in the header while the sidebar stays discovery-only', async () => {
    const { wrapper } = await mountHomePage({ authenticated: true })
    const links = collectLinks(wrapper)

    expectDiscoveryOnlySidebar(wrapper)
    expect(
      links.some((link) => link.text.includes('Задать вопрос') && link.href === '/questions/ask'),
    ).toBe(true)
  })
})
