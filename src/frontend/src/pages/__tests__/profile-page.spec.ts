import { ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProfilePage from '@/pages/ProfilePage.vue'

const profileState = {
  data: ref<any>(null),
  isPending: ref(false),
  isError: ref(false),
  error: ref<unknown>(null),
}

const mountedWrappers: VueWrapper[] = []

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => profileState),
}))

vi.mock('@/features/solutions/components/ProfileEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="solution-review-workspace">Очередь правок к вашим решениям готова к проверке.</div>',
  },
}))

vi.mock('@/features/questions/components/ProfileQuestionEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="question-review-workspace">Очередь правок к вашим вопросам готова к проверке.</div>',
  },
}))

vi.mock('@/features/solutions/components/ProfileEditHistoryTab.vue', () => ({
  default: {
    template: '<div data-testid="history-workspace">История обработанных правок к вашим решениям доступна в профиле.</div>',
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

  mountedWrappers.push(wrapper)
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

function getDialog() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}

function getExplanationPanel() {
  return document.body.querySelector<HTMLElement>('[data-testid="reputation-explanation-panel"]')
}

async function openReputationDialog(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="reputation-explanation-trigger"]').trigger('click')
  await flushPromises()
}

async function expectReputationDialogClosed(
  routerQuery: Record<string, unknown>,
  expectedQuery: Record<string, unknown> = {},
) {
  await flushPromises()

  expect(getDialog()).toBeNull()
  expect(getExplanationPanel()).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(routerQuery).toEqual(expectedQuery)
}

describe('profile reputation surfaces', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    profileState.data.value = buildProfile()
    profileState.isPending.value = false
    profileState.isError.value = false
    profileState.error.value = null
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }

    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('renders the reputation summary trigger and ledger in overview without inline explanation content', async () => {
    const { wrapper } = await mountProfilePage()
    const text = wrapper.text()

    expect(text).toContain('Эксперт')
    expect(text).toContain('128')
    expect(text).toContain('Мастер')
    expect(text).toContain('172')
    expect(wrapper.get('[data-testid="reputation-explanation-trigger"]').text()).toContain('Как работает репутация')
    expect(wrapper.find('[data-testid="reputation-explanation-panel"]').exists()).toBe(false)
    expect(getDialog()).toBeNull()
    expect(getExplanationPanel()).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(text).not.toContain('За что начисляются очки')
    expect(text).not.toContain('Уровни доверия')
    expect(text).toContain('Лучшее решение')
    expect(text).toContain('+15')
    expect(text).toContain('Ваш ответ выбрали лучшим решением.')
  })

  it('opens the real AppDialog with scoring rules and backend-provided threshold bands', async () => {
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

    const { wrapper, router } = await mountProfilePage()

    expect(getDialog()).toBeNull()
    expect(getExplanationPanel()).toBeNull()

    await openReputationDialog(wrapper)

    const dialog = getDialog()
    const explanation = getExplanationPanel()

    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-label')).toBe('Как работает репутация')
    expect(explanation).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    expect(explanation?.textContent).toContain('Лучшее решение+15')
    expect(explanation?.textContent).toContain('Голос за решение+10')
    expect(explanation?.textContent).toContain('Голос за вопрос+5')
    expect(explanation?.textContent).toContain('Одобренная правка+2')
    expect(explanation?.textContent).toContain('Эксперт150–449')
    expect(explanation?.textContent).toContain('Мастер450+')
    expect(explanation?.textContent).not.toContain('Эксперт100–299')
    expect(explanation?.textContent).not.toContain('Мастер300+')
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('closes the reputation dialog with the AppDialog close button without disrupting the overview route', async () => {
    const { wrapper, router } = await mountProfilePage()

    await openReputationDialog(wrapper)
    expect(getDialog()).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    document.body.querySelector<HTMLButtonElement>('.app-dialog__close')?.click()

    await expectReputationDialogClosed(router.currentRoute.value.query)
    expect(wrapper.get('[data-testid="reputation-explanation-trigger"]').exists()).toBe(true)
  })

  it('closes the reputation dialog with an overlay self-click without disrupting the overview route', async () => {
    const { wrapper, router } = await mountProfilePage()

    await openReputationDialog(wrapper)
    expect(getDialog()).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    document.body.querySelector<HTMLElement>('.app-dialog')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await expectReputationDialogClosed(router.currentRoute.value.query)
  })

  it('closes the reputation dialog and clears the body lock when switching away from overview', async () => {
    const { wrapper, router } = await mountProfilePage()

    await openReputationDialog(wrapper)
    expect(getDialog()).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.get('[data-testid="profile-tab-review"]').trigger('click')
    await flushPromises()

    await expectReputationDialogClosed(router.currentRoute.value.query, { tab: 'review' })
    expect(wrapper.text()).toContain('Очередь правок к вашим решениям готова к проверке.')
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
    expect(wrapper.text()).toContain('Очередь правок к вашим решениям готова к проверке.')
    expect(wrapper.text()).toContain('Очередь правок к вашим вопросам готова к проверке.')
    expect(getDialog()).toBeNull()
    expect(getExplanationPanel()).toBeNull()
  })

  it('updates the route when switching tabs from the shell', async () => {
    const { wrapper, router } = await mountProfilePage()

    await wrapper.get('[data-testid="profile-tab-history"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.tab).toBe('history')
    expect(wrapper.text()).toContain('История обработанных правок к вашим решениям доступна в профиле.')
  })
})
