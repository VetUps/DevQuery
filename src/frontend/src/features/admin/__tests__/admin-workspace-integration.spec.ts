import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchAdminReputationPolicyConfig,
  fetchAdminUserActivityTimeline,
  fetchAdminUserDetail,
  fetchAdminUsers,
  updateAdminReputationPolicyConfig,
  updateAdminUserManualOverride,
  type AdminReputationPolicyConfig,
  type AdminUserActivityItem,
  type AdminUserActivityTimeline,
  type AdminUserDetail,
  type AdminUserListRow,
} from '@/features/admin/api/admin'
import type { UserProfile } from '@/features/auth/api/auth'
import type { ReputationLedgerEntry, ReputationSummary } from '@/features/users/api/reputation'
import AdminPage from '@/pages/AdminPage.vue'

const currentUserState = vi.hoisted(() => ({
  data: { value: null as UserProfile | null },
  isPending: { value: false },
  isError: { value: false },
}))

vi.mock('@/features/auth/queries/useCurrentUserQuery', () => ({
  useCurrentUserQuery: vi.fn(() => currentUserState),
}))

vi.mock('@/features/admin/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/admin/api/admin')>()

  return {
    ...actual,
    fetchAdminUsers: vi.fn(),
    fetchAdminUserDetail: vi.fn(),
    fetchAdminUserActivityTimeline: vi.fn(),
    updateAdminUserManualOverride: vi.fn(),
    fetchAdminReputationPolicyConfig: vi.fn(),
    updateAdminReputationPolicyConfig: vi.fn(),
  }
})

vi.mock('@/layouts/AppShellLayout.vue', () => ({
  default: {
    template: '<main data-testid="app-shell-layout"><slot /></main>',
  },
}))

const mockedFetchAdminUsers = vi.mocked(fetchAdminUsers)
const mockedFetchAdminUserDetail = vi.mocked(fetchAdminUserDetail)
const mockedFetchAdminUserActivityTimeline = vi.mocked(fetchAdminUserActivityTimeline)
const mockedUpdateAdminUserManualOverride = vi.mocked(updateAdminUserManualOverride)
const mockedFetchPolicy = vi.mocked(fetchAdminReputationPolicyConfig)
const mockedUpdatePolicy = vi.mocked(updateAdminReputationPolicyConfig)

function buildCurrentUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'admin-1',
    user_name: 'admin',
    user_email: 'admin@example.com',
    user_role: 'admin',
    user_reputation_score: 999,
    user_avatar_url: null,
    user_bio: null,
    user_created_at: '2026-05-06T10:00:00Z',
    reputation: buildReputationSummary({ score: 999, level_label: 'Мастер' }),
    reputation_ledger: [],
    ...overrides,
  }
}

function buildReputationSummary(overrides: Partial<ReputationSummary> = {}): ReputationSummary {
  return {
    score: 240,
    level: 'expert',
    level_label: 'Эксперт',
    level_minimum_score: 100,
    is_manual_override: false,
    manual_level: null,
    next_level: 'master',
    next_level_label: 'Мастер',
    next_level_minimum_score: 300,
    points_to_next_level: 60,
    ...overrides,
  }
}

function buildLedgerEntry(overrides: Partial<ReputationLedgerEntry> = {}): ReputationLedgerEntry {
  return {
    id: 'ledger-1',
    amount: 15,
    reason: 'admin_adjustment',
    note: 'Проверенная ручная корректировка.',
    actor_name: 'admin',
    created_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

function buildUser(overrides: Partial<AdminUserListRow> = {}): AdminUserListRow {
  return {
    user_id: 'user-1',
    user_name: 'alice',
    user_email: 'alice@example.com',
    user_role: 'user',
    user_reputation_score: 240,
    user_created_at: '2026-05-01T10:00:00Z',
    ...overrides,
  }
}

function buildDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    ...buildUser(),
    reputation: buildReputationSummary(),
    reputation_ledger: [buildLedgerEntry()],
    ...overrides,
  }
}

function buildActivityItem(overrides: Partial<AdminUserActivityItem> = {}): AdminUserActivityItem {
  return {
    id: 'activity-1',
    type: 'question',
    occurred_at: '2026-05-06T13:00:00Z',
    title: 'Вопрос опубликован',
    summary: 'Компактное описание активности без полного тела публикации.',
    target_label: 'Вопрос #42',
    route: { question_id: '42' },
    ...overrides,
  }
}

function buildActivityTimeline(overrides: Partial<AdminUserActivityTimeline> = {}): AdminUserActivityTimeline {
  return {
    items: [buildActivityItem()],
    count: 1,
    limit: 25,
    available_types: ['question', 'comment', 'reputation'],
    ...overrides,
  }
}

function buildPolicy(overrides: Partial<AdminReputationPolicyConfig> = {}): AdminReputationPolicyConfig {
  return {
    protected_newcomer_window_hours: 24,
    max_protected_newcomer_window_hours: 72,
    updated_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

async function settle() {
  await flushPromises()
  await flushPromises()
}

async function mountWorkspace() {
  const wrapper = mount(AdminPage)
  await settle()
  return wrapper
}

function expectNoSensitiveShellCopy(text: string) {
  expect(text).not.toContain('admin-api')
  expect(text).not.toContain('token')
  expect(text).not.toContain('debug')
  expect(text).not.toContain('raw_body')
  expect(text).not.toContain('object_id')
  expect(text).not.toContain('prototype')
  expect(text).not.toContain('будут собраны')
}

describe('Admin workspace integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUserState.data.value = buildCurrentUser()
    currentUserState.isPending.value = false
    currentUserState.isError.value = false
    mockedFetchAdminUsers.mockResolvedValue([buildUser()])
    mockedFetchAdminUserDetail.mockResolvedValue(buildDetail())
    mockedFetchAdminUserActivityTimeline.mockResolvedValue(buildActivityTimeline())
    mockedUpdateAdminUserManualOverride.mockResolvedValue(buildDetail({
      reputation: buildReputationSummary({
        level: 'master',
        level_label: 'Мастер',
        is_manual_override: true,
        manual_level: 'master',
        next_level: null,
        next_level_label: null,
        points_to_next_level: 0,
      }),
      reputation_ledger: [buildLedgerEntry({
        id: 'ledger-override',
        amount: 0,
        reason: 'manual_level_override',
        note: 'Интеграционная проверка ручного уровня.',
      })],
    }))
    mockedFetchPolicy.mockResolvedValue(buildPolicy())
    mockedUpdatePolicy.mockResolvedValue(buildPolicy({ protected_newcomer_window_hours: 72 }))
  })

  it('walks the assembled admin workspace with real user, activity, override, and policy sections', async () => {
    mockedFetchAdminUserActivityTimeline
      .mockResolvedValueOnce(buildActivityTimeline())
      .mockResolvedValueOnce(buildActivityTimeline({
        items: [buildActivityItem({ id: 'comment-1', type: 'comment', title: 'Комментарий добавлен' })],
        count: 1,
      }))

    const wrapper = await mountWorkspace()

    expect(wrapper.get('[data-testid="admin-shell"]').text()).toContain('Рабочая область администратора')
    expect(wrapper.get('[data-testid="admin-shell"]').text()).toContain('Управляйте пользователями')
    expect(mockedFetchAdminUsers).toHaveBeenCalledWith({ search: '', limit: 25 })
    expect(mockedFetchPolicy).toHaveBeenCalledTimes(1)

    await wrapper.get('#admin-user-search-input').setValue('alice@example.com')
    await wrapper.get('[data-testid="admin-user-search"] form').trigger('submit')
    await settle()

    expect(mockedFetchAdminUsers).toHaveBeenLastCalledWith({ search: 'alice@example.com', limit: 25 })

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await settle()

    expect(mockedFetchAdminUserDetail).toHaveBeenCalledWith('user-1')
    expect(mockedFetchAdminUserActivityTimeline).toHaveBeenCalledWith({ userId: 'user-1', types: [], limit: 25 })
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('Эксперт')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('Проверенная ручная корректировка')
    expect(wrapper.get('[data-testid="admin-user-activity-count"]').text()).toContain('Найдено событий: 1')

    await wrapper.get('[data-testid="admin-user-activity-filter-comment"]').trigger('click')
    await settle()

    expect(mockedFetchAdminUserActivityTimeline).toHaveBeenLastCalledWith({ userId: 'user-1', types: ['comment'], limit: 25 })
    expect(wrapper.get('[data-testid="admin-user-activity-filter-comment"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="admin-user-activity-item-comment-comment-1"]').text()).toContain('Комментарий добавлен')

    await wrapper.get('#admin-manual-override-level').setValue('master')
    await wrapper.get('#admin-manual-override-note').setValue('Интеграционная проверка ручного уровня.')
    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await settle()

    expect(mockedUpdateAdminUserManualOverride).toHaveBeenCalledWith({
      userId: 'user-1',
      manual_reputation_level: 'master',
      note: 'Интеграционная проверка ручного уровня.',
    })
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('Мастер')
    expect(wrapper.get('[data-testid="admin-manual-override-feedback"]').text()).toContain('Ручной уровень сохранён')

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue('72')
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await settle()

    expect(mockedUpdatePolicy).toHaveBeenCalledWith({ protected_newcomer_window_hours: 72 })
    expect(wrapper.get('[data-testid="admin-policy-current-value"]').text()).toContain('72 ч')
    expect(wrapper.get('[data-testid="admin-policy-save-success"]').text()).toContain('Настройки политики сохранены')
    expectNoSensitiveShellCopy(wrapper.text())
  })

  it('keeps ordinary, missing, and unverifiable users out of the assembled admin sections', async () => {
    currentUserState.data.value = buildCurrentUser({ user_role: 'user' })
    let wrapper = await mountWorkspace()

    expect(wrapper.get('[data-testid="admin-shell-forbidden"]').text()).toContain('Недостаточно прав')
    expect(wrapper.find('[data-testid="admin-user-management"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-policy-panel"]').exists()).toBe(false)

    currentUserState.data.value = null
    wrapper = await mountWorkspace()

    expect(wrapper.get('[data-testid="admin-shell-forbidden"]').text()).toContain('Недостаточно прав')
    expect(wrapper.find('[data-testid="admin-user-management"]').exists()).toBe(false)

    currentUserState.isError.value = true
    wrapper = await mountWorkspace()

    expect(wrapper.get('[data-testid="admin-shell-unable-to-verify"]').text()).toContain('Подробности ошибки скрыты')
    expect(wrapper.find('[data-testid="admin-user-management"]').exists()).toBe(false)
    expect(mockedFetchAdminUsers).not.toHaveBeenCalled()
    expect(mockedFetchPolicy).not.toHaveBeenCalled()
    expectNoSensitiveShellCopy(wrapper.text())
  })

  it('surfaces local override and policy validation without sending malformed admin payloads', async () => {
    const wrapper = await mountWorkspace()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await settle()

    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await settle()

    expect(wrapper.get('[data-testid="admin-manual-override-feedback"]').text()).toContain('Добавьте заметку')
    expect(mockedUpdateAdminUserManualOverride).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue('73')
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await settle()

    expect(wrapper.get('[data-testid="admin-policy-field-error"]').text()).toContain('Максимальное значение — 72 ч')
    expect(wrapper.get('[data-testid="admin-policy-hours-input"]').attributes('aria-invalid')).toBe('true')
    expect(mockedUpdatePolicy).not.toHaveBeenCalled()
  })

  it('keeps admin API failures section-local and redacted while empty ledgers and activity render safely', async () => {
    mockedFetchAdminUsers.mockRejectedValueOnce(new Error('Malformed admin API response: object_id token debug'))
    mockedFetchPolicy.mockRejectedValueOnce(new Error('500 raw_body token debug'))

    const failedWrapper = await mountWorkspace()

    expect(failedWrapper.get('[data-testid="admin-shell"]').text()).toContain('Рабочая область администратора')
    expect(failedWrapper.get('[data-testid="admin-user-search-error"]').text()).toContain('Не удалось загрузить пользователей')
    expect(failedWrapper.get('[data-testid="admin-policy-load-error"]').text()).toContain('Не удалось загрузить политику')
    expectNoSensitiveShellCopy(failedWrapper.text())

    mockedFetchAdminUsers.mockResolvedValue([buildUser()])
    mockedFetchPolicy.mockResolvedValue(buildPolicy())
    mockedFetchAdminUserDetail.mockResolvedValue(buildDetail({ reputation_ledger: [] }))
    mockedFetchAdminUserActivityTimeline.mockResolvedValue(buildActivityTimeline({ items: [], count: 0 }))

    const emptyWrapper = await mountWorkspace()

    await emptyWrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await settle()

    expect(emptyWrapper.get('[data-testid="admin-reputation-ledger-empty"]').text()).toContain('Журнал репутации пуст')
    expect(emptyWrapper.get('[data-testid="admin-user-activity-empty"]').text()).toContain('Активность не найдена')
    expect(emptyWrapper.text()).not.toContain('Полное тело')
    expect(emptyWrapper.text()).not.toContain('Удалить')
    expect(emptyWrapper.text()).not.toContain('Заблокировать')
    expectNoSensitiveShellCopy(emptyWrapper.text())
  })
})
