import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/auth/api/auth'
import AdminPage from '@/pages/AdminPage.vue'

const currentUserState = vi.hoisted(() => ({
  data: { value: null as UserProfile | null },
  isPending: { value: false },
  isError: { value: false },
}))

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/layouts/AppShellLayout.vue', () => ({
  default: {
    template: '<main data-testid="app-shell-layout"><slot /></main>',
  },
}))

vi.mock('@/features/admin/components/AdminUserManagement.vue', () => ({
  default: {
    template: '<section data-testid="admin-user-management">Пользователи и репутация</section>',
  },
}))

vi.mock('@/features/admin/components/AdminReputationPolicyPanel.vue', () => ({
  default: {
    template: '<section data-testid="admin-policy-panel">Защитное окно для новичков</section>',
  },
}))

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'user-1',
    user_name: 'Sergey',
    user_email: 'sergey@example.com',
    user_role: 'user',
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
    reputation_ledger: [],
    ...overrides,
  }
}

function mountAdminPage() {
  return mount(AdminPage)
}

describe('AdminPage', () => {
  beforeEach(() => {
    currentUserState.data.value = null
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
  })

  it('renders localized loading copy while profile verification is pending', () => {
    currentUserState.isPending.value = true

    const wrapper = mountAdminPage()

    expect(wrapper.get('[data-testid="admin-shell-loading"]').text()).toContain('Проверяем доступ')
    expect(wrapper.find('[data-testid="admin-shell"]').exists()).toBe(false)
  })

  it('renders safe unable-to-verify copy without raw backend details', () => {
    currentUserState.isError.value = true

    const wrapper = mountAdminPage()

    const panelText = wrapper.get('[data-testid="admin-shell-unable-to-verify"]').text()
    expect(panelText).toContain('Не удалось подтвердить доступ')
    expect(panelText).toContain('Подробности ошибки скрыты')
    expect(panelText).not.toContain('Malformed auth response')
  })

  it('renders forbidden copy for parsed ordinary users', () => {
    currentUserState.data.value = buildProfile({ user_role: 'user' })

    const wrapper = mountAdminPage()

    expect(wrapper.get('[data-testid="admin-shell-forbidden"]').text()).toContain('Недостаточно прав')
    expect(wrapper.find('[data-testid="admin-shell"]').exists()).toBe(false)
  })

  it('renders the admin shell and mounts management only for parsed admins', () => {
    currentUserState.data.value = buildProfile({ user_role: 'admin' })

    const wrapper = mountAdminPage()

    expect(wrapper.get('[data-testid="admin-shell"]').text()).toContain('Рабочая область администратора')
    expect(wrapper.get('[data-testid="admin-shell"]').text()).toContain('Управляйте пользователями')
    expect(wrapper.get('[data-testid="admin-user-management"]').text()).toContain('Пользователи и репутация')
    expect(wrapper.get('[data-testid="admin-policy-panel"]').text()).toContain('Защитное окно для новичков')
    expect(wrapper.find('[data-testid="admin-section-activity"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-section-policy"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-section-users"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-api')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('debug')
    expect(wrapper.text()).not.toContain('будут собраны')
    expect(wrapper.text()).not.toContain('prototype')
  })
})
