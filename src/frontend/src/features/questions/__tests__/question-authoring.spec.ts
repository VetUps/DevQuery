import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { routes } from '@/app/router'
import { useSessionStore } from '@/features/auth/stores/session'
import QuestionCreateForm from '@/features/questions/components/QuestionCreateForm.vue'
import HomePage from '@/pages/HomePage.vue'

const listQueryState = {
  data: ref({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  isPlaceholderData: ref(false),
  refetch: vi.fn(),
}

const createQuestionMutationState = {
  isPending: ref(false),
  mutateAsync: vi.fn(),
}

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn(() => listQueryState),
}))

vi.mock('@/features/questions/mutations/useCreateQuestionMutation', () => ({
  useCreateQuestionMutation: vi.fn(() => createQuestionMutationState),
}))

async function mountHomePage(authenticated = false) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/questions/ask', component: { template: '<div>ask</div>' } },
    ],
  })

  if (authenticated) {
    const sessionStore = useSessionStore()
    sessionStore.setSession({ access: 'access-token', refresh: 'refresh-token' })
  }

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

async function mountQuestionCreateForm() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/questions/ask', name: 'ask-question', component: { template: '<div>ask</div>' } },
      { path: '/questions/:questionId', name: 'question-detail', component: { template: '<div>detail</div>' } },
    ],
  })

  await router.push('/questions/ask')
  await router.isReady()

  const wrapper = mount(QuestionCreateForm, {
    global: {
      plugins: [pinia, router],
    },
  })

  await flushPromises()

  return { wrapper, router }
}

describe('question authoring flow', () => {
  beforeEach(() => {
    localStorage.clear()
    listQueryState.data.value = { count: 0, next: null, previous: null, results: [] }
    listQueryState.isPending.value = false
    listQueryState.isError.value = false
    listQueryState.isPlaceholderData.value = false
    listQueryState.refetch.mockReset()

    createQuestionMutationState.isPending.value = false
    createQuestionMutationState.mutateAsync.mockReset()
  })

  it('registers the protected ask-question route', () => {
    const askQuestionRoute = routes.find((route) => route.path === '/questions/ask')

    expect(askQuestionRoute).toBeDefined()
    expect(askQuestionRoute?.meta?.requiresAuth).toBe(true)
  })

  it('routes the guest ask CTA on the home page to registration', async () => {
    const { wrapper } = await mountHomePage(false)

    const askLink = wrapper.findAll('a').find((link) => link.text().includes('Задать вопрос'))

    expect(askLink?.attributes('href')).toBe('/register')
  })

  it('shows the form summary when required fields are empty', async () => {
    const { wrapper } = await mountQuestionCreateForm()

    await wrapper.get('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Проверьте форму и исправьте ошибки перед отправкой.')
  })

  it('navigates to the created detail route with the success message', async () => {
    createQuestionMutationState.mutateAsync.mockResolvedValue({
      question_id: 'question-created-id',
    })

    const { wrapper, router } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('Как замкнуть markdown preview и publish flow?')
    await wrapper.get('#question-body').setValue('Нужно пройти полный путь question-created.')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionMutationState.mutateAsync).toHaveBeenCalled()
    expect(router.currentRoute.value.params.questionId).toBe('question-created-id')
    expect(router.currentRoute.value.query.message).toBe('question-created')
  })
})
