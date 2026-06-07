import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QuestionFavoriteAction from '@/features/questions/components/QuestionFavoriteAction.vue'

const { mutateAsyncMock, isPending } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  isPending: { value: false },
})) as unknown as {
  mutateAsyncMock: ReturnType<typeof vi.fn>
  isPending: { value: boolean }
}

vi.mock('@/features/questions/mutations/useQuestionFavoriteMutation', () => ({
  useQuestionFavoriteMutation: () => ({
    mutateAsync: mutateAsyncMock,
    isPending,
  }),
}))

function mountFavoriteAction(props: Partial<InstanceType<typeof QuestionFavoriteAction>['$props']> = {}) {
  return mount(QuestionFavoriteAction, {
    props: {
      questionId: 'question-1',
      isFavorited: false,
      favoritesCount: 2,
      isAuthenticated: true,
      ...props,
    },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to" data-router-link @click.prevent><slot /></a>',
        },
      },
    },
  })
}

describe('QuestionFavoriteAction', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({
      question_id: 'question-1',
      favorites_count: 3,
      is_favorited: true,
    })
    isPending.value = false
  })

  it('renders inactive authenticated state with visible count and pressed semantics', () => {
    const wrapper = mountFavoriteAction({ isFavorited: false, favoritesCount: 4 })
    const root = wrapper.get('[data-testid="question-favorite-action"]')
    const button = wrapper.get('[data-testid="question-favorite-button"]')

    expect(root.attributes('data-favorited')).toBe('false')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('aria-busy')).toBe('false')
    expect(button.attributes('aria-label')).toContain('Добавить в избранное')
    expect(wrapper.get('[data-testid="question-favorite-count"]').text()).toBe('4')
    expect(wrapper.get('[data-testid="question-favorite-count"]').classes()).toContain('question-favorite-action__count--compact')
    expect(wrapper.find('.question-favorite-action__state').exists()).toBe(false)
  })

  it('renders active state with filled and non-color cues', () => {
    const wrapper = mountFavoriteAction({ isFavorited: true, favoritesCount: 9, variant: 'large' })
    const root = wrapper.get('[data-testid="question-favorite-action"]')
    const button = wrapper.get('[data-testid="question-favorite-button"]')
    const icon = wrapper.get('.question-favorite-action__icon')

    expect(root.classes()).toContain('question-favorite-action--active')
    expect(root.classes()).toContain('question-favorite-action--large')
    expect(root.attributes('data-favorited')).toBe('true')
    expect(button.attributes('data-favorited')).toBe('true')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('aria-label')).toContain('В избранном')
    expect(icon.classes()).toContain('question-favorite-action__icon--filled')
    expect(wrapper.find('.question-favorite-action__state').exists()).toBe(false)
    expect(wrapper.get('[data-testid="question-favorite-count"]').text()).toBe('9')
  })

  it('calls the favorite mutation with the desired next server state', async () => {
    const wrapper = mountFavoriteAction({ isFavorited: false })

    await wrapper.get('[data-testid="question-favorite-button"]').trigger('click')

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      questionId: 'question-1',
      isFavorited: true,
    })
  })

  it('calls the unfavorite mutation with the desired next server state', async () => {
    const wrapper = mountFavoriteAction({ isFavorited: true })

    await wrapper.get('[data-testid="question-favorite-button"]').trigger('click')

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      questionId: 'question-1',
      isFavorited: false,
    })
  })

  it('disables the authenticated action and exposes busy state while pending', async () => {
    isPending.value = true
    const wrapper = mountFavoriteAction({ isFavorited: false })
    const root = wrapper.get('[data-testid="question-favorite-action"]')
    const button = wrapper.get('[data-testid="question-favorite-button"]')

    expect(root.attributes('data-pending')).toBe('true')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()

    await button.trigger('click')

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('renders an anonymous login affordance without calling the mutation', async () => {
    const wrapper = mountFavoriteAction({ isAuthenticated: false, favoritesCount: 5 })
    const link = wrapper.get('[data-testid="question-favorite-login-link"]')

    expect(wrapper.find('[data-testid="question-favorite-button"]').exists()).toBe(false)
    expect(link.attributes('href')).toBe('/login')
    expect(link.attributes('aria-label')).toBe('Войдите, чтобы добавить вопрос в избранное')
    expect(wrapper.get('[data-testid="question-favorite-count"]').text()).toBe('5')

    await link.trigger('click')

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('keeps the public count visible and non-negative', () => {
    const wrapper = mountFavoriteAction({ favoritesCount: -3 })

    expect(wrapper.get('[data-testid="question-favorite-count"]').text()).toBe('0')
  })
})
