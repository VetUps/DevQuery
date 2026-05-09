import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
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

const draftAssistantMutationState = {
  isPending: ref(false),
  error: ref<unknown>(null),
  data: ref(null),
  mutateAsync: vi.fn(),
}

const tagAutocompleteQueryState = {
  data: ref([]),
  isPending: ref(false),
  isError: ref(false),
}

const notificationsQueryState = {
  data: ref<any>({ count: 0, next: null, previous: null, results: [] }),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn(() => listQueryState),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => tagAutocompleteQueryState),
}))

vi.mock('@/features/notifications/queries/useNotificationsQuery', () => ({
  useNotificationsQuery: vi.fn(() => notificationsQueryState),
}))

vi.mock('@/features/questions/mutations/useCreateQuestionMutation', () => ({
  useCreateQuestionMutation: vi.fn(() => createQuestionMutationState),
}))

vi.mock('@/features/questions/mutations/useQuestionDraftAssistantMutation', () => ({
  useQuestionDraftAssistantMutation: vi.fn(() => draftAssistantMutationState),
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

function getAddTagButton(wrapper: VueWrapper) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Добавить')

  if (!button) {
    throw new Error('Expected the add tag button to be rendered')
  }

  return button
}

function getButtonByText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)

  if (!button) {
    throw new Error(`Expected button with text "${text}" to be rendered`)
  }

  return button
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

    draftAssistantMutationState.isPending.value = false
    draftAssistantMutationState.error.value = null
    draftAssistantMutationState.data.value = null
    draftAssistantMutationState.mutateAsync.mockReset()

    tagAutocompleteQueryState.data.value = []
    tagAutocompleteQueryState.isPending.value = false
    tagAutocompleteQueryState.isError.value = false

    notificationsQueryState.data.value = { count: 0, next: null, previous: null, results: [] }
    notificationsQueryState.isPending.value = false
    notificationsQueryState.isError.value = false
    notificationsQueryState.refetch.mockReset()
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

  it('blocks submit when no tags are selected', async () => {
    const { wrapper } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('Как замкнуть markdown preview и publish flow?')
    await wrapper.get('#question-body').setValue('Нужно пройти полный путь question-created.')
    await wrapper.get('form').trigger('submit.prevent')

    expect(createQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Добавьте хотя бы один тег к вопросу.')
    expect(wrapper.text()).toContain('Проверьте форму и исправьте ошибки перед отправкой.')
  })

  it('requests draft assistant feedback with the current local create draft without publishing', async () => {
    draftAssistantMutationState.mutateAsync.mockResolvedValue({
      status: 'ok',
      mode: 'create',
      summary: 'Черновик выглядит понятным.',
      findings: [],
      suggested_title: null,
      suggested_body: null,
      suggested_tags: [],
      warnings: [],
    })

    const { wrapper } = await mountQuestionCreateForm()

    expect(wrapper.text()).toContain('Проверить черновик вопроса')

    await wrapper.get('#question-title').setValue('Как подключить Vue Query к форме?')
    await wrapper.get('#question-body').setValue('Нужна обратная связь по черновику перед публикацией.')
    await wrapper.get('#question-tags').setValue('vue')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('#question-tags').setValue('django')
    await getAddTagButton(wrapper).trigger('click')

    const assistantButton = wrapper.findAll('button').find((button) => button.text() === 'Проверить черновик')
    expect(assistantButton).toBeDefined()

    await assistantButton!.trigger('click')
    await flushPromises()

    expect(draftAssistantMutationState.mutateAsync).toHaveBeenCalledWith({
      question_title: 'Как подключить Vue Query к форме?',
      question_body: 'Нужна обратная связь по черновику перед публикацией.',
      tags: ['vue', 'django'],
      mode: 'create',
    })
    expect(createQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('keeps local editing available while assistant feedback is pending', async () => {
    draftAssistantMutationState.isPending.value = true

    const { wrapper } = await mountQuestionCreateForm()

    expect(wrapper.text()).toContain('Помощник анализирует черновик. Поля вопроса пока не изменяются.')

    const pendingAssistantButton = wrapper.findAll('button').find((button) => button.text() === 'Проверяем…')
    expect(pendingAssistantButton?.attributes('disabled')).toBeDefined()

    await wrapper.get('#question-title').setValue('Можно продолжать редактирование')

    expect((wrapper.get('#question-title').element as HTMLInputElement).value).toBe('Можно продолжать редактирование')
    expect(createQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('renders assistant failures as generic non-blocking copy without publishing and allows retry', async () => {
    const rawAssistantError = 'provider token leaked stack trace'
    draftAssistantMutationState.mutateAsync
      .mockRejectedValueOnce(new Error(rawAssistantError))
      .mockResolvedValueOnce({
        status: 'ok',
        mode: 'create',
        summary: 'Повторная проверка прошла успешно.',
        findings: [],
        suggested_title: null,
        suggested_body: null,
        suggested_tags: [],
        warnings: [],
      })

    const { wrapper } = await mountQuestionCreateForm()

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось получить рекомендации. Попробуйте ещё раз позже; черновик не был изменён.')
    expect(wrapper.text()).not.toContain(rawAssistantError)
    expect(createQuestionMutationState.mutateAsync).not.toHaveBeenCalled()

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Повторная проверка прошла успешно.')
    expect(wrapper.text()).not.toContain('Не удалось получить рекомендации')
    expect(draftAssistantMutationState.mutateAsync).toHaveBeenCalledTimes(2)
  })

  it('renders successful assistant feedback through the integrated panel', async () => {
    draftAssistantMutationState.mutateAsync.mockResolvedValue({
      status: 'ok',
      mode: 'create',
      summary: 'Добавьте воспроизводимый пример и уточните ожидаемое поведение.',
      findings: [
        {
          code: 'missing-context',
          message: 'Не хватает технического контекста.',
          severity: 'warning',
          field: 'question_body',
        },
      ],
      suggested_title: 'Как отладить Vue Query mutation в форме вопроса?',
      suggested_body: 'Опишите окружение, шаги воспроизведения и ожидаемый результат.',
      suggested_tags: ['vue', 'vue-query'],
      warnings: [],
    })

    const { wrapper } = await mountQuestionCreateForm()

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Добавьте воспроизводимый пример и уточните ожидаемое поведение.')
    expect(wrapper.text()).toContain('Не хватает технического контекста.')
    expect(wrapper.text()).toContain('Как отладить Vue Query mutation в форме вопроса?')
    expect(wrapper.text()).toContain('#vue-query')
    expect(createQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('applies assistant suggestions only after each explicit local apply action', async () => {
    draftAssistantMutationState.mutateAsync.mockResolvedValue({
      status: 'ok',
      mode: 'create',
      summary: 'Можно уточнить черновик перед публикацией.',
      findings: [],
      suggested_title: 'Как отладить Vue Query mutation в форме вопроса?',
      suggested_body: 'Опишите окружение, шаги воспроизведения и ожидаемый результат.',
      suggested_tags: ['vue', 'vue-query'],
      warnings: [],
    })

    const { wrapper, router } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('Исходный заголовок')
    await wrapper.get('#question-body').setValue('Исходный текст вопроса.')
    await wrapper.get('#question-tags').setValue('django')
    await getAddTagButton(wrapper).trigger('click')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect((wrapper.get('#question-title').element as HTMLInputElement).value).toBe('Исходный заголовок')
    expect((wrapper.get('#question-body').element as HTMLTextAreaElement).value).toBe('Исходный текст вопроса.')
    expect(wrapper.text()).toContain('#django')

    await getButtonByText(wrapper, 'Применить заголовок').trigger('click')
    expect((wrapper.get('#question-title').element as HTMLInputElement).value).toBe(
      'Как отладить Vue Query mutation в форме вопроса?',
    )
    expect((wrapper.get('#question-body').element as HTMLTextAreaElement).value).toBe('Исходный текст вопроса.')
    expect(wrapper.text()).toContain('#django')

    await getButtonByText(wrapper, 'Применить текст').trigger('click')
    expect((wrapper.get('#question-body').element as HTMLTextAreaElement).value).toBe(
      'Опишите окружение, шаги воспроизведения и ожидаемый результат.',
    )
    expect(wrapper.text()).toContain('#django')

    await getButtonByText(wrapper, 'Применить теги').trigger('click')
    expect(wrapper.text()).toContain('#vue')
    expect(wrapper.text()).toContain('#vue-query')
    expect(wrapper.text()).not.toContain('#django')
    expect(createQuestionMutationState.mutateAsync).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('ask-question')
  })

  it('publishes manually after assistant failure without leaking assistant error details', async () => {
    const rawAssistantError = 'provider stack trace token sk-live-secret internal timeout payload'
    draftAssistantMutationState.mutateAsync.mockImplementation(async () => {
      draftAssistantMutationState.error.value = new Error(rawAssistantError)
      throw draftAssistantMutationState.error.value
    })
    createQuestionMutationState.mutateAsync.mockResolvedValue({
      question_id: 'manual-after-assistant-failure',
    })

    const { wrapper, router } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('Черновик до ошибки помощника')
    await wrapper.get('#question-body').setValue('Этот текст должен остаться доступен для ручной публикации.')
    await wrapper.get('#question-tags').setValue('vue')
    await getAddTagButton(wrapper).trigger('click')

    await getButtonByText(wrapper, 'Проверить черновик').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось получить рекомендации. Попробуйте ещё раз позже; черновик не был изменён.')
    expect(wrapper.text()).not.toContain(rawAssistantError)
    expect((wrapper.get('#question-title').element as HTMLInputElement).value).toBe('Черновик до ошибки помощника')

    await wrapper.get('#question-title').setValue('Ручная публикация после ошибки помощника')
    await wrapper.get('#question-body').setValue('Автор вручную уточнил вопрос и продолжает стандартную публикацию.')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      question_title: 'Ручная публикация после ошибки помощника',
      question_body: 'Автор вручную уточнил вопрос и продолжает стандартную публикацию.',
      tags: ['vue'],
    })
    expect(router.currentRoute.value.params.questionId).toBe('manual-after-assistant-failure')
    expect(router.currentRoute.value.query.message).toBe('question-created')
  })

  it('sends selected tags in the create question payload', async () => {
    createQuestionMutationState.mutateAsync.mockResolvedValue({
      question_id: 'question-created-id',
    })

    const { wrapper } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('  Как замкнуть markdown preview и publish flow?  ')
    await wrapper.get('#question-body').setValue('  Нужно пройти полный путь question-created.  ')
    await wrapper.get('#question-tags').setValue('vue')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('#question-tags').setValue('django')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionMutationState.mutateAsync).toHaveBeenCalledWith({
      question_title: 'Как замкнуть markdown preview и publish flow?',
      question_body: 'Нужно пройти полный путь question-created.',
      tags: ['vue', 'django'],
    })
  })

  it('renders server tag errors without clearing selected tags', async () => {
    createQuestionMutationState.mutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          tags: ['Выберите существующий тег или создайте корректный тег.'],
        },
      },
    })

    const { wrapper } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('Как замкнуть markdown preview и publish flow?')
    await wrapper.get('#question-body').setValue('Нужно пройти полный путь question-created.')
    await wrapper.get('#question-tags').setValue('vue')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Выберите существующий тег или создайте корректный тег.')
    expect(wrapper.text()).toContain('#vue')
    expect(createQuestionMutationState.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('navigates to the created detail route with the success message', async () => {
    createQuestionMutationState.mutateAsync.mockResolvedValue({
      question_id: 'question-created-id',
    })

    const { wrapper, router } = await mountQuestionCreateForm()

    await wrapper.get('#question-title').setValue('Как замкнуть markdown preview и publish flow?')
    await wrapper.get('#question-body').setValue('Нужно пройти полный путь question-created.')
    await wrapper.get('#question-tags').setValue('vue')
    await getAddTagButton(wrapper).trigger('click')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createQuestionMutationState.mutateAsync).toHaveBeenCalled()
    expect(router.currentRoute.value.params.questionId).toBe('question-created-id')
    expect(router.currentRoute.value.query.message).toBe('question-created')
  })
})
