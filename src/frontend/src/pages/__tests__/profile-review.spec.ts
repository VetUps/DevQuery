import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProfilePage from '@/pages/ProfilePage.vue'

const profileState = {
  data: ref<any>(null),
  isPending: ref(false),
  error: ref<unknown>(null),
}

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => profileState),
}))

vi.mock('@/features/solutions/components/ProfileEditReviewQueue.vue', () => ({
  default: {
    template: '<div data-testid="review-workspace">Здесь появится очередь правок к вашим решениям.</div>',
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

describe('profile review shell', () => {
  beforeEach(() => {
    profileState.data.value = {
      user_id: 'user-1',
      user_name: 'Sergey',
      user_email: 'sergey@example.com',
      user_reputation_score: 128,
      user_avatar_url: null,
      user_bio: null,
      user_created_at: '2026-04-01T09:15:00Z',
    }
    profileState.isPending.value = false
    profileState.error.value = null
  })

  it('renders the compact profile shell with summary and tabs', async () => {
    const { wrapper } = await mountProfilePage()

    expect(wrapper.text()).toContain('Sergey')
    expect(wrapper.text()).toContain('sergey@example.com')
    expect(wrapper.text()).toContain('Репутация')
    expect(wrapper.text()).toContain('Обзор')
    expect(wrapper.text()).toContain('Проверка правок')
    expect(wrapper.text()).toContain('История правок')
  })

  it('uses the route query to switch into the review workspace', async () => {
    const { wrapper, router } = await mountProfilePage({ tab: 'review' })

    expect(router.currentRoute.value.query.tab).toBe('review')
    expect(wrapper.text()).toContain('Здесь появится очередь правок к вашим решениям.')
  })

  it('updates the route when switching tabs from the shell', async () => {
    const { wrapper, router } = await mountProfilePage()

    await wrapper.get('[data-testid="profile-tab-history"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.tab).toBe('history')
    expect(wrapper.text()).toContain('Здесь будет история уже обработанных правок к вашим решениям.')
  })
})
