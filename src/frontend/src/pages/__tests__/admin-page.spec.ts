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
    template: '<section data-testid="admin-user-management">Пользователи и репутация <button type="button" data-testid="admin-user-manage-user-1">Управление</button></section>',
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
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('renders localized loading copy while profile verification is pending', () => {
    currentUserState.isPending.value = true

    const wrapper = mountAdminPage()

    expect(wrapper.get('[data-testid="admin-shell-loading"]').text()).toContain('Проверяем доступ')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-shell"]').exists()).toBe(false)
  })

  it('renders safe unable-to-verify copy without raw backend details', () => {
    currentUserState.isError.value = true

    const wrapper = mountAdminPage()

    const panelText = wrapper.get('[data-testid="admin-shell-unable-to-verify"]').text()
    expect(panelText).toContain('Не удалось подтвердить доступ')
    expect(panelText).toContain('Подробности ошибки скрыты')
    expect(panelText).not.toContain('Malformed auth response')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-user-management"]').exists()).toBe(false)
  })

  it('renders forbidden copy for parsed ordinary users', () => {
    currentUserState.data.value = buildProfile({ user_role: 'user' })

    const wrapper = mountAdminPage()

    expect(wrapper.get('[data-testid="admin-shell-forbidden"]').text()).toContain('Недостаточно прав')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-shell"]').exists()).toBe(false)
  })

  it('renders the admin shell with the users tab active by default for parsed admins', () => {
    currentUserState.data.value = buildProfile({ user_role: 'admin' })
    window.localStorage.setItem('admin-active-tab', 'policy')
    window.history.pushState({}, '', '/admin?tab=policy')

    const wrapper = mountAdminPage()

    expect(wrapper.get('[data-testid="admin-shell"]').text()).toContain('Рабочая область администратора')
    expect(wrapper.get('[data-testid="admin-shell"]').text()).toContain('Управляйте пользователями')
    expect(wrapper.get('[role="tablist"]').text()).toContain('Пользователи')
    expect(wrapper.get('[role="tablist"]').text()).toContain('Политика репутации')
    expect(wrapper.get('[data-testid="admin-tab-users"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-testid="admin-tab-users"]').attributes('aria-controls')).toBe('admin-users-panel')
    expect(wrapper.get('[data-testid="admin-tab-policy"]').attributes('aria-selected')).toBe('false')
    expect(wrapper.get('[data-testid="admin-tab-policy"]').attributes('aria-controls')).toBe('admin-policy-tab-panel')
    expect(wrapper.get('[data-testid="admin-users-panel"]').attributes('role')).toBe('tabpanel')
    expect(wrapper.get('[data-testid="admin-users-panel"]').text()).toContain('Пользователи и репутация')
    expect(wrapper.get('[data-testid="admin-user-manage-user-1"]').text()).toContain('Управление')
    expect(wrapper.find('[data-testid="admin-user-detail-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-policy-tab-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-policy-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-section-activity"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-section-policy"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-section-users"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-api')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('debug')
    expect(wrapper.text()).not.toContain('будут собраны')
    expect(wrapper.text()).not.toContain('prototype')
  })

  it('switches to the policy tab with selected-state diagnostics and isolates the users panel', async () => {
    currentUserState.data.value = buildProfile({ user_role: 'admin' })

    const wrapper = mountAdminPage()

    await wrapper.get('[data-testid="admin-tab-policy"]').trigger('click')

    expect(wrapper.get('[data-testid="admin-tab-users"]').attributes('aria-selected')).toBe('false')
    expect(wrapper.get('[data-testid="admin-tab-policy"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-testid="admin-policy-tab-panel"]').attributes('role')).toBe('tabpanel')
    expect(wrapper.get('[data-testid="admin-policy-tab-panel"]').text()).toContain('Защитное окно для новичков')
    expect(wrapper.find('[data-testid="admin-user-management"]').exists()).toBe(false)

    await wrapper.get('[data-testid="admin-tab-users"]').trigger('click')

    expect(wrapper.get('[data-testid="admin-tab-users"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-testid="admin-users-panel"]').text()).toContain('Пользователи и репутация')
    expect(wrapper.find('[data-testid="admin-policy-tab-panel"]').exists()).toBe(false)
  })
})
