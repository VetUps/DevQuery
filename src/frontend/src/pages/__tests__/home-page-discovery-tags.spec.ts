import { nextTick, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type LocationQueryRaw } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import DiscoverySearchReserve from '@/features/questions/components/DiscoverySearchReserve.vue'
import type { PaginatedResponse, QuestionListItem, QuestionListParams } from '@/features/questions/api/questions'

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

const autocompleteState = vi.hoisted(() => ({
  data: [] as unknown,
  isError: false,
  isFetching: false,
}))

vi.mock('@/features/questions/queries/useQuestionListQuery', () => ({
  useQuestionListQuery: vi.fn((params: MaybeRefOrGetter<QuestionListParams>) => {
    questionListCapture.params = params

    return questionListState
  }),
}))

vi.mock('@/features/questions/queries/useTagAutocompleteQuery', () => ({
  useTagAutocompleteQuery: vi.fn(() => autocompleteState),
}))

function emptyQuestionList(): PaginatedResponse<QuestionListItem> {
  return {
    count: 0,
    next: null,
    previous: null,
    results: [],
  }
}

async function mountHomePage(initialQuery: LocationQueryRaw = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: HomePage }],
  })

  await router.push({ path: '/', query: initialQuery })
  await router.isReady()

  const wrapper = mount(HomePage, {
    global: {
      plugins: [pinia, router],
      stubs: {
        AppShellLayout: {
          template: '<main data-testid="shell-layout"><slot /></main>',
        },
        SurfacePanel: {
          template: '<section v-bind="$attrs"><slot /></section>',
        },
        AppButton: {
          template: '<button v-bind="$attrs"><slot /></button>',
        },
        InlineFeedbackPanel: {
          props: ['eyebrow', 'title', 'description', 'showAction', 'actionLabel'],
          emits: ['action'],
          template: `
            <section v-bind="$attrs">
              <p>{{ eyebrow }}</p>
              <h2>{{ title }}</h2>
              <p>{{ description }}</p>
              <button v-if="showAction" type="button" data-testid="feedback-action" @click="$emit('action')">
                {{ actionLabel }}
              </button>
            </section>
          `,
        },
        PublicDiscoveryIntro: {
          template: '<aside data-testid="public-discovery-intro" />',
        },
        QuestionCard: {
          template: '<article data-testid="question-card" />',
        },
        QuestionListPagination: {
          template: '<nav data-testid="question-list-pagination" />',
        },
        QuestionListSkeleton: {
          template: '<div data-testid="question-list-skeleton" />',
        },
      },
    },
  })

  await flushRouteUpdates()

  return { wrapper, router }
}

async function flushRouteUpdates() {
  await flushPromises()
  await nextTick()
}

function capturedQuestionParams() {
  if (!questionListCapture.params) {
    throw new Error('Question list params were not captured')
  }

  return toValue(questionListCapture.params)
}

function tagDraft(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="discovery-tag-draft"]')
}

function addTagButton(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="discovery-tag-add"]')
}

async function addDraftTag(wrapper: VueWrapper, value: string) {
  await tagDraft(wrapper).setValue(value)
  await addTagButton(wrapper).trigger('click')
  await flushRouteUpdates()
}

describe('HomePage discovery tag routing', () => {
  beforeEach(() => {
    questionListCapture.params = null
    questionListState.data.value = emptyQuestionList()
    questionListState.isPending.value = false
    questionListState.isError.value = false
    questionListState.isPlaceholderData.value = false
    questionListState.refetch.mockClear()
    autocompleteState.data = []
    autocompleteState.isError = false
    autocompleteState.isFetching = false
  })

  it('hydrates repeated tag params into normalized chips and question-list params', async () => {
    const { wrapper } = await mountHomePage({
      tag: [' Vue ', 'django', '', 'vue'],
      search: ' serializer ',
      ordering: 'question_created_at',
      page: '3',
    })

    expect(wrapper.get('[data-testid="discovery-tag-filter-input"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="discovery-tag-chip-vue"]').text()).toContain('#vue')
    expect(wrapper.get('[data-testid="discovery-tag-chip-django"]').text()).toContain('#django')
    expect(wrapper.findAll('[data-testid^="discovery-tag-chip-"]')).toHaveLength(2)
    expect(capturedQuestionParams()).toMatchObject({
      page: 3,
      search: 'serializer',
      ordering: 'question_created_at',
      tags: ['vue', 'django'],
    })
  })

  it('pushes one normalized repeated tag query when a manual tag is added and preserves search and ordering', async () => {
    const { wrapper, router } = await mountHomePage({
      tag: ['vue', 'django'],
      search: 'serializer',
      ordering: 'question_created_at',
      page: '4',
    })
    const pushSpy = vi.spyOn(router, 'push')

    await addDraftTag(wrapper, ' MySQL ')

    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query).toMatchObject({
      search: 'serializer',
      ordering: 'question_created_at',
      tag: ['vue', 'django', 'mysql'],
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(capturedQuestionParams().tags).toEqual(['vue', 'django', 'mysql'])
  })

  it('removes chips and clearing the final tag drops tag params without dropping search or ordering', async () => {
    const { wrapper, router } = await mountHomePage({
      tag: ['vue', 'django'],
      search: 'serializer',
      ordering: 'question_created_at',
      page: '2',
    })

    await wrapper.get('[data-testid="discovery-tag-remove-vue"]').trigger('click')
    await flushRouteUpdates()

    expect(router.currentRoute.value.query).toMatchObject({
      search: 'serializer',
      ordering: 'question_created_at',
      tag: ['django'],
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()

    await wrapper.get('[data-testid="discovery-tag-clear-all"]').trigger('click')
    await flushRouteUpdates()

    expect(router.currentRoute.value.query.search).toBe('serializer')
    expect(router.currentRoute.value.query.ordering).toBe('question_created_at')
    expect(router.currentRoute.value.query.tag).toBeUndefined()
    expect(capturedQuestionParams().tags).toEqual([])
  })

  it('does not push a route update for unchanged normalized tag emissions', async () => {
    const { wrapper, router } = await mountHomePage({ tag: ['vue', 'django'] })
    const pushSpy = vi.spyOn(router, 'push')

    wrapper.getComponent(DiscoverySearchReserve).vm.$emit('update:tags', [' Vue ', 'django', 'vue'])
    await flushRouteUpdates()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.tag).toEqual(['vue', 'django'])
  })

  it('keeps active tag context visible in empty and error states with retry intact', async () => {
    const emptyMount = await mountHomePage({ tag: ['Vue', 'django'], search: 'serializer' })

    expect(emptyMount.wrapper.get('[data-testid="question-list-state-empty"]').text()).toContain('с тегами #vue, #django')
    expect(emptyMount.wrapper.get('[data-testid="question-list-state-empty"]').text()).toContain('по запросу «serializer»')

    questionListState.isError.value = true
    const { wrapper } = await mountHomePage({ tag: ['Vue', 'django'], search: 'serializer' })

    expect(wrapper.get('[data-testid="question-list-state-error"]').text()).toContain('с тегами #vue, #django')
    expect(wrapper.get('[data-testid="question-list-state-error"]').text()).toContain('Активные фильтры сохранены')

    await wrapper.get('[data-testid="feedback-action"]').trigger('click')
    expect(questionListState.refetch).toHaveBeenCalledTimes(1)
  })
})
