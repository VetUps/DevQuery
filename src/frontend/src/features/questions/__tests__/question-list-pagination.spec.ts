import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type LocationQueryRaw, type Router } from 'vue-router'

import QuestionListPagination from '@/features/questions/components/QuestionListPagination.vue'

async function mountPagination({
  initialQuery = {},
  page = 1,
  hasNextPage = true,
  isBusy = false,
}: {
  initialQuery?: LocationQueryRaw
  page?: number
  hasNextPage?: boolean
  isBusy?: boolean
} = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<main />' } }],
  })

  await router.push({ path: '/', query: initialQuery })
  await router.isReady()

  const wrapper = mount(QuestionListPagination, {
    props: {
      page,
      hasNextPage,
      isBusy,
    },
    global: {
      plugins: [router],
    },
  })

  await flushPromises()

  return { wrapper, router }
}

function paginationButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-testid="question-list-pagination"] button')
}

async function expectNoRoutePushOnClick({
  router,
  button,
}: {
  router: Router
  button: ReturnType<ReturnType<typeof mount>['get']>
}) {
  const pushSpy = vi.spyOn(router, 'push')

  await button.trigger('click')
  await flushPromises()

  expect(pushSpy).not.toHaveBeenCalled()
}

describe('QuestionListPagination', () => {
  it('renders compact glyph controls with accessible labels and a visible page counter', async () => {
    const { wrapper } = await mountPagination({ page: 7 })
    const [previousButton, nextButton] = paginationButtons(wrapper)

    expect(wrapper.get('[data-testid="question-list-pagination"]').text()).toBe('‹7›')
    expect(wrapper.text()).not.toContain('Предыдущая страница')
    expect(wrapper.text()).not.toContain('Следующая страница')
    expect(wrapper.text()).not.toContain('Страница 7')
    expect(previousButton.attributes('aria-label')).toBe('Предыдущая страница')
    expect(nextButton.attributes('aria-label')).toBe('Следующая страница')
    expect(wrapper.get('.question-list-pagination__label').attributes('aria-label')).toBe('Текущая страница 7')
  })

  it('does not navigate from the first page when previous is disabled', async () => {
    const { wrapper, router } = await mountPagination({ page: 1, hasNextPage: true })
    const [previousButton] = paginationButtons(wrapper)

    expect(previousButton.attributes('disabled')).toBeDefined()
    await expectNoRoutePushOnClick({ router, button: previousButton })
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('does not navigate forward when no next page is available', async () => {
    const { wrapper, router } = await mountPagination({ page: 3, hasNextPage: false })
    const [, nextButton] = paginationButtons(wrapper)

    expect(nextButton.attributes('disabled')).toBeDefined()
    await expectNoRoutePushOnClick({ router, button: nextButton })
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('does not navigate while busy', async () => {
    const { wrapper, router } = await mountPagination({
      page: 2,
      hasNextPage: true,
      isBusy: true,
      initialQuery: { page: '2', tag: ['vue'] },
    })
    const [previousButton, nextButton] = paginationButtons(wrapper)
    const pushSpy = vi.spyOn(router, 'push')

    expect(previousButton.attributes('disabled')).toBeDefined()
    expect(nextButton.attributes('disabled')).toBeDefined()

    await previousButton.trigger('click')
    await nextButton.trigger('click')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query).toEqual({ page: '2', tag: ['vue'] })
  })

  it('preserves search and ordering while normalizing repeated tag params on next-page navigation', async () => {
    const { wrapper, router } = await mountPagination({
      page: 2,
      hasNextPage: true,
      initialQuery: {
        page: '2',
        search: 'serializer',
        ordering: 'question_created_at',
        tag: [' Vue ', 'vue', '', 'DJANGO', '  '],
      },
    })
    const pushSpy = vi.spyOn(router, 'push')
    const [, nextButton] = paginationButtons(wrapper)

    await nextButton.trigger('click')
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query).toEqual({
      page: '3',
      search: 'serializer',
      ordering: 'question_created_at',
      tag: ['vue', 'django'],
    })
  })

  it('removes page from the query instead of writing page=1 when navigating back to page one', async () => {
    const { wrapper, router } = await mountPagination({
      page: 2,
      hasNextPage: true,
      initialQuery: {
        page: '2',
        search: 'serializer',
        tag: ['Vue', 'vue', ''],
      },
    })
    const [previousButton] = paginationButtons(wrapper)

    await previousButton.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      search: 'serializer',
      tag: ['vue'],
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()
  })
})
