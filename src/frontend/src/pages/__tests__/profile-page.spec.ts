import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProfilePage from '@/pages/ProfilePage.vue'

const profileState = {
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
}

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => profileState),
}))

vi.mock('@/features/solutions/components/ProfileEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="solution-review-workspace">Здесь появится очередь правок к вашим решениям.</div>',
  },
}))

vi.mock('@/features/questions/components/ProfileQuestionEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="question-review-workspace">Здесь появится очередь правок к вашим вопросам.</div>',
  },
}))

vi.mock('@/features/solutions/components/ProfileEditHistoryTab.vue', () => ({
  default: {
    template: '<div data-testid="history-workspace">Здесь будет история уже обработанных правок к вашим решениям.</div>',
  },
}))

async function mountProfilePage(initialQuery?: Record<string, string>) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/profile', component: ProfilePage }],
  })

  await router.push({
    path: '/profile',
    query: initialQuery,
  })
  await router.isReady()

  const wrapper = mount(ProfilePage, {
    global: {
      plugins: [pinia, router],
      stubs: {
        AppShellLayout: {
          template: '<div data-testid="shell-layout"><slot /></div>',
        },
      },
    },
  })

  await flushPromises()

  return { wrapper, router }
}

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    user_name: 'Sergey',
    user_email: 'sergey@example.com',
    user_reputation_score: 128,
    user_avatar_url: null,
    user_bio: null,
    user_created_at: '2026-04-01T09:15:00Z',
    reputation: {
      score: 128,
      level: 'expert',
      level_label: 'Эксперт',
      level_minimum_score: 100,
      is_manual_override: false,
      manual_level: null,
      next_level: 'master',
      next_level_label: 'Мастер',
      next_level_minimum_score: 300,
      points_to_next_level: 172,
    },
    reputation_ledger: [
      {
        id: 'ledger-1',
        amount: 15,
        reason: 'best_solution',
        note: 'Ваш ответ выбрали лучшим решением.',
        actor_name: 'Question Author',
        created_at: '2026-05-05T12:00:00Z',
      },
      {
        id: 'ledger-2',
        amount: 2,
        reason: 'approved_edit',
        note: '',
        actor_name: null,
        created_at: '2026-05-04T10:00:00Z',
      },
    ],
    ...overrides,
  }
}

describe('profile reputation surfaces', () => {
  beforeEach(() => {
    profileState.data.value = buildProfile()
    profileState.isPending.value = false
    profileState.isError.value = false
    profileState.error.value = null
  })

  it('renders the reputation summary, explanation, and ledger together in the overview tab', async () => {
    const { wrapper } = await mountProfilePage()
    const text = wrapper.text()

    expect(text).toContain('Эксперт')
    expect(text).toContain('128')
    expect(text).toContain('Мастер')
    expect(text).toContain('172')
    expect(text).toContain('Как работает репутация')
    expect(text).toContain('Лучшее решение+15')
    expect(text).toContain('Голос за решение+10')
    expect(text).toContain('Голос за вопрос+5')
    expect(text).toContain('Одобренная правка+2')
    expect(text).toContain('Эксперт100–299')
    expect(text).toContain('Мастер300+')
    expect(text).not.toContain('Новичок0–29')
    expect(text).not.toContain('Участник30–99')
    expect(text).toContain('Достижения и бейджи появятся позже')
    expect(text).toContain('Лучшее решение')
    expect(text).toContain('+15')
    expect(text).toContain('Ваш ответ выбрали лучшим решением.')
  })

  it('renders backend-provided threshold bands in the explanation panel when profile fixtures change', async () => {
    profileState.data.value = buildProfile({
      user_reputation_score: 165,
      reputation: {
        score: 165,
        level: 'expert',
        level_label: 'Эксперт',
        level_minimum_score: 150,
        is_manual_override: false,
        manual_level: null,
        next_level: 'master',
        next_level_label: 'Мастер',
        next_level_minimum_score: 450,
        points_to_next_level: 285,
      },
    })

    const { wrapper } = await mountProfilePage()
    const explanation = wrapper.get('[data-testid="reputation-explanation-panel"]').text()

    expect(explanation).toContain('Эксперт150–449')
    expect(explanation).toContain('Мастер450+')
    expect(explanation).not.toContain('Эксперт100–299')
    expect(explanation).not.toContain('Мастер300+')
  })

  it('renders a localized loading state for the full profile shell', async () => {
    profileState.data.value = null
    profileState.isPending.value = true

    const { wrapper } = await mountProfilePage()

    expect(wrapper.text()).toContain('Загружаем профиль')
    expect(wrapper.text()).toContain('Подтягиваем ваш рабочий контекст')
  })

  it('renders a localized empty state when reputation history is still empty', async () => {
    profileState.data.value = buildProfile({
      reputation_ledger: [],
    })

    const { wrapper } = await mountProfilePage()

    expect(wrapper.get('[data-testid="reputation-ledger-empty"]').text()).toContain('История пока пуста')
    expect(wrapper.text()).toContain('Как только появятся первые награды, голоса или одобренные правки')
  })

  it('isolates reputation fetch failure copy inside the overview instead of replacing the whole page', async () => {
    profileState.data.value = buildProfile({
      reputation_ledger: [],
    })
    profileState.isError.value = true
    profileState.error.value = new Error('backend timeout raw details')

    const { wrapper } = await mountProfilePage()
    const text = wrapper.text()

    expect(wrapper.get('[data-testid="reputation-ledger-error"]').text()).toContain('Не удалось загрузить историю репутации')
    expect(text).toContain('Sergey')
    expect(text).toContain('Эксперт')
    expect(text).not.toContain('Не удалось загрузить профиль')
  })

  it('uses the route query to switch into the review workspace', async () => {
    const { wrapper, router } = await mountProfilePage({ tab: 'review' })

    expect(router.currentRoute.value.query.tab).toBe('review')
    expect(wrapper.text()).toContain('Здесь появится очередь правок к вашим решениям.')
    expect(wrapper.text()).toContain('Здесь появится очередь правок к вашим вопросам.')
  })

  it('updates the route when switching tabs from the shell', async () => {
    const { wrapper, router } = await mountProfilePage()

    await wrapper.get('[data-testid="profile-tab-history"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.tab).toBe('history')
    expect(wrapper.text()).toContain('Здесь будет история уже обработанных правок к вашим решениям.')
  })
})
