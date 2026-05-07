import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchAdminUserActivityTimeline,
  fetchAdminUserDetail,
  fetchAdminUsers,
  updateAdminUserManualOverride,
  type AdminUserActivityItem,
  type AdminUserActivityTimeline,
  type AdminUserDetail,
  type AdminUserListRow,
} from '@/features/admin/api/admin'
import type { ReputationLedgerEntry, ReputationSummary } from '@/features/users/api/reputation'
import AdminUserManagement from '@/features/admin/components/AdminUserManagement.vue'

vi.mock('@/features/admin/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/admin/api/admin')>()

  return {
    ...actual,
    fetchAdminUsers: vi.fn(),
    fetchAdminUserDetail: vi.fn(),
    fetchAdminUserActivityTimeline: vi.fn(),
    updateAdminUserManualOverride: vi.fn(),
  }
})

vi.mock('@/shared/ui/SurfacePanel.vue', () => ({
  default: {
    props: ['padding'],
    template: '<section data-testid="surface-panel"><slot /></section>',
  },
}))

const mockedFetchAdminUsers = vi.mocked(fetchAdminUsers)
const mockedFetchAdminUserDetail = vi.mocked(fetchAdminUserDetail)
const mockedFetchAdminUserActivityTimeline = vi.mocked(fetchAdminUserActivityTimeline)
const mockedUpdateAdminUserManualOverride = vi.mocked(updateAdminUserManualOverride)

function buildReputationSummary(overrides: Partial<ReputationSummary> = {}): ReputationSummary {
  return {
    score: 250,
    level: 'expert',
    level_label: 'Эксперт',
    level_minimum_score: 200,
    is_manual_override: false,
    manual_level: null,
    next_level: 'master',
    next_level_label: 'Мастер',
    next_level_minimum_score: 500,
    points_to_next_level: 250,
    ...overrides,
  }
}

function buildLedgerEntry(overrides: Partial<ReputationLedgerEntry> = {}): ReputationLedgerEntry {
  return {
    id: 'ledger-1',
    amount: 25,
    reason: 'admin_adjustment',
    note: 'Администратор уточнил репутацию.',
    actor_name: 'admin-user',
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
    user_reputation_score: 250,
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
    title: 'Создан вопрос',
    summary: 'Компактное событие без полного тела публикации.',
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

async function mountManagement() {
  const wrapper = mount(AdminUserManagement)
  await flushPromises()
  return wrapper
}

describe('AdminUserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchAdminUsers.mockResolvedValue([buildUser()])
    mockedFetchAdminUserDetail.mockResolvedValue(buildDetail())
    mockedFetchAdminUserActivityTimeline.mockResolvedValue(buildActivityTimeline())
    mockedUpdateAdminUserManualOverride.mockResolvedValue(buildDetail())
  })

  it('loads the bounded default list on mount and keeps admin markers stable', async () => {
    const wrapper = await mountManagement()

    expect(mockedFetchAdminUsers).toHaveBeenCalledWith({ search: '', limit: 25 })
    expect(wrapper.get('[data-testid="admin-user-search"]').text()).toContain('Поиск пользователя')
    expect(wrapper.get('[data-testid="admin-user-row-user-1"]').text()).toContain('alice@example.com')
    expect(wrapper.get('[data-testid="admin-user-detail-empty"]').text()).toContain('Выберите пользователя')
    expect(wrapper.text()).not.toContain('admin-api')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('password')
    expect(wrapper.text()).not.toContain('content type')
    expect(wrapper.text()).not.toContain('object id')
  })

  it('submits explicit search text and renders empty results without throwing', async () => {
    mockedFetchAdminUsers.mockResolvedValueOnce([buildUser()]).mockResolvedValueOnce([])

    const wrapper = await mountManagement()

    await wrapper.get('#admin-user-search-input').setValue('  missing  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mockedFetchAdminUsers).toHaveBeenLastCalledWith({ search: '  missing  ', limit: 25 })
    expect(wrapper.get('[data-testid="admin-user-search-empty"]').text()).toContain('Пользователи не найдены')
  })

  it('selects a user, renders reputation detail, and shows a read-only ledger', async () => {
    const detail = buildDetail({
      reputation: buildReputationSummary({
        score: 250,
        level_label: 'Мастер',
        is_manual_override: true,
        manual_level: 'master',
        points_to_next_level: 0,
        next_level: null,
        next_level_label: null,
      }),
    })
    mockedFetchAdminUserDetail.mockResolvedValueOnce(detail)

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()

    expect(mockedFetchAdminUserDetail).toHaveBeenCalledWith('user-1')
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('250')
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('Мастер')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('Ручная корректировка')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('Администратор уточнил репутацию')
  })

  it('renders safe list retry state for rejected or malformed admin list responses', async () => {
    mockedFetchAdminUsers.mockRejectedValueOnce(new Error('Malformed admin API response: object_id token'))

    const wrapper = await mountManagement()

    expect(wrapper.get('[data-testid="admin-user-search-error"]').text()).toContain('Не удалось загрузить пользователей')
    expect(wrapper.text()).not.toContain('object_id')
    expect(wrapper.text()).not.toContain('token')

    mockedFetchAdminUsers.mockResolvedValueOnce([buildUser({ user_name: 'recovered' })])
    await wrapper.get('[data-testid="admin-user-search-error"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-row-user-1"]').text()).toContain('recovered')
  })

  it('keeps selected row context visible while selected detail load fails and retries', async () => {
    mockedFetchAdminUserDetail.mockRejectedValueOnce(new Error('raw exception with password'))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-detail-selected-context"]').text()).toContain('alice@example.com')
    expect(wrapper.get('[data-testid="admin-user-detail-error"]').text()).toContain('Не удалось загрузить детали пользователя')
    expect(wrapper.text()).not.toContain('raw exception')
    expect(wrapper.text()).not.toContain('password')

    mockedFetchAdminUserDetail.mockResolvedValueOnce(buildDetail({ reputation_ledger: [] }))
    await wrapper.get('[data-testid="admin-user-detail-error"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-reputation-ledger-empty"]').text()).toContain('Журнал репутации пуст')
  })

  it('applies a manual override with a required note and renders the server-refreshed ledger without optimistic score changes', async () => {
    const initialDetail = buildDetail({
      reputation: buildReputationSummary({ score: 250, level_label: 'Эксперт' }),
      reputation_ledger: [buildLedgerEntry({ id: 'ledger-old', amount: 25, reason: 'admin_adjustment' })],
    })
    const refreshedDetail = buildDetail({
      reputation: buildReputationSummary({
        score: 250,
        level: 'master',
        level_label: 'Мастер',
        is_manual_override: true,
        manual_level: 'master',
        points_to_next_level: 0,
        next_level: null,
        next_level_label: null,
      }),
      reputation_ledger: [
        buildLedgerEntry({
          id: 'ledger-new',
          amount: 0,
          reason: 'manual_level_override',
          note: 'Повышение по итогам модерации.',
        }),
      ],
    })
    mockedFetchAdminUserDetail.mockResolvedValueOnce(initialDetail)
    mockedUpdateAdminUserManualOverride.mockResolvedValueOnce(refreshedDetail)

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('250')
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('Эксперт')

    await wrapper.get('#admin-manual-override-level').setValue('master')
    await wrapper.get('#admin-manual-override-note').setValue('Повышение по итогам модерации.')
    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await flushPromises()

    expect(mockedUpdateAdminUserManualOverride).toHaveBeenCalledWith({
      userId: 'user-1',
      manual_reputation_level: 'master',
      note: 'Повышение по итогам модерации.',
    })
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('250')
    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('Мастер')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('0')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('Ручное изменение уровня')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('Повышение по итогам модерации')
    expect(wrapper.get('[data-testid="admin-manual-override-feedback"]').text()).toContain('Ручной уровень сохранён')
  })

  it('clears a manual override by sending null and requires an audit note before submit', async () => {
    mockedFetchAdminUserDetail.mockResolvedValueOnce(buildDetail({
      reputation: buildReputationSummary({
        is_manual_override: true,
        manual_level: 'expert',
      }),
    }))
    mockedUpdateAdminUserManualOverride.mockResolvedValueOnce(buildDetail({
      reputation: buildReputationSummary({ is_manual_override: false, manual_level: null }),
      reputation_ledger: [buildLedgerEntry({ amount: 0, reason: 'manual_level_override', note: 'Снятие ручного уровня.' })],
    }))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await flushPromises()

    expect(mockedUpdateAdminUserManualOverride).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="admin-manual-override-feedback"]').text()).toContain('Добавьте заметку')

    await wrapper.get('#admin-manual-override-level').setValue('__clear__')
    await wrapper.get('#admin-manual-override-note').setValue('Снятие ручного уровня.')
    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await flushPromises()

    expect(mockedUpdateAdminUserManualOverride).toHaveBeenCalledWith({
      userId: 'user-1',
      manual_reputation_level: null,
      note: 'Снятие ручного уровня.',
    })
  })

  it('disables duplicate override submits while saving', async () => {
    let resolveOverride!: (detail: AdminUserDetail) => void
    mockedUpdateAdminUserManualOverride.mockReturnValueOnce(new Promise((resolve) => {
      resolveOverride = resolve
    }))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()
    await wrapper.get('#admin-manual-override-level').setValue('master')
    await wrapper.get('#admin-manual-override-note').setValue('Duplicate guard.')
    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')

    expect(mockedUpdateAdminUserManualOverride).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="admin-manual-override-submit"]').attributes('disabled')).toBeDefined()

    resolveOverride(buildDetail())
    await flushPromises()
  })

  it('keeps prior selected detail visible and redacts raw backend override failures', async () => {
    mockedFetchAdminUserDetail.mockResolvedValueOnce(buildDetail({
      reputation: buildReputationSummary({ score: 250, level_label: 'Эксперт' }),
      reputation_ledger: [buildLedgerEntry({ note: 'Старое значение.' })],
    }))
    mockedUpdateAdminUserManualOverride.mockRejectedValueOnce(new Error('403 token password object_id'))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()
    await wrapper.get('#admin-manual-override-level').setValue('master')
    await wrapper.get('#admin-manual-override-note').setValue('Попытка изменения.')
    await wrapper.get('[data-testid="admin-manual-override-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('Эксперт')
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').text()).toContain('Старое значение')
    expect(wrapper.get('[data-testid="admin-manual-override-feedback"]').text()).toContain('Не удалось сохранить ручной уровень')
    expect(wrapper.text()).not.toContain('object_id')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('password')
  })

  it('renders selected-user activity with compact cards and no moderation controls or raw body', async () => {
    mockedFetchAdminUserActivityTimeline.mockResolvedValueOnce(buildActivityTimeline({
      items: [
        buildActivityItem({
          id: 'q-1',
          type: 'question',
          title: 'Вопрос опубликован',
          summary: 'Краткое описание вопроса.',
          target_label: 'Вопрос #1',
        }),
        buildActivityItem({
          id: 'comment-1',
          type: 'comment',
          title: 'Комментарий добавлен',
          summary: 'Краткое описание комментария.',
          target_label: 'Комментарий #9',
        }),
        buildActivityItem({
          id: 'rep-1',
          type: 'reputation',
          title: 'Репутация изменилась',
          summary: 'Краткое событие репутации.',
          target_label: 'Журнал репутации',
        }),
      ],
      count: 3,
    }))

    const wrapper = await mountManagement()

    expect(wrapper.get('[data-testid="admin-user-activity-no-selection"]').text()).toContain('Активность появится')

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()

    expect(mockedFetchAdminUserActivityTimeline).toHaveBeenCalledWith({ userId: 'user-1', types: [], limit: 25 })
    expect(wrapper.get('[data-testid="admin-user-activity-selected-context"]').text()).toContain('alice@example.com')
    expect(wrapper.get('[data-testid="admin-user-activity-count"]').text()).toContain('Найдено событий: 3')
    expect(wrapper.get('[data-testid="admin-user-activity-item-question-q-1"]').text()).toContain('Краткое описание вопроса')
    expect(wrapper.get('[data-testid="admin-user-activity-item-comment-comment-1"]').text()).toContain('Комментарий #9')
    expect(wrapper.get('[data-testid="admin-user-activity-item-reputation-rep-1"]').text()).toContain('Репутация изменилась')
    expect(wrapper.text()).not.toContain('Полное тело')
    expect(wrapper.text()).not.toContain('Удалить')
    expect(wrapper.text()).not.toContain('Заблокировать')
  })

  it('reloads only the activity section when filters are toggled', async () => {
    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()
    mockedFetchAdminUserDetail.mockClear()

    await wrapper.get('[data-testid="admin-user-activity-filter-comment"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="admin-user-activity-filter-reputation"]').trigger('click')
    await flushPromises()

    expect(mockedFetchAdminUserActivityTimeline).toHaveBeenLastCalledWith({
      userId: 'user-1',
      types: ['comment', 'reputation'],
      limit: 25,
    })
    expect(wrapper.get('[data-testid="admin-user-activity-filter-comment"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="admin-user-activity-filter-reputation"]').attributes('aria-pressed')).toBe('true')
    expect(mockedFetchAdminUserDetail).not.toHaveBeenCalled()
  })

  it('renders an explicit empty activity state from a bounded empty timeline', async () => {
    mockedFetchAdminUserActivityTimeline.mockResolvedValueOnce(buildActivityTimeline({ items: [], count: 0 }))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-activity-empty"]').text()).toContain('Активность не найдена')
  })

  it('keeps reputation controls visible and retries activity after safe fetch failures', async () => {
    mockedFetchAdminUserActivityTimeline
      .mockRejectedValueOnce(new Error('Malformed admin API response: raw_body password object_id'))
      .mockResolvedValueOnce(buildActivityTimeline({
        items: [buildActivityItem({ id: 'recovered', type: 'solution', title: 'Решение добавлено' })],
      }))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-reputation-summary"]').text()).toContain('250')
    expect(wrapper.get('[data-testid="admin-manual-override-form"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="admin-reputation-ledger"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="admin-user-activity-error"]').text()).toContain('Не удалось загрузить активность пользователя')
    expect(wrapper.text()).not.toContain('raw_body')
    expect(wrapper.text()).not.toContain('password')
    expect(wrapper.text()).not.toContain('object_id')

    await wrapper.get('[data-testid="admin-user-activity-error"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-activity-item-solution-recovered"]').text()).toContain('Решение добавлено')
  })

  it('clears stale activity before loading a newly selected user', async () => {
    let resolveSecondActivity!: (timeline: AdminUserActivityTimeline) => void
    mockedFetchAdminUsers.mockResolvedValueOnce([
      buildUser({ user_id: 'user-1', user_name: 'alice', user_email: 'alice@example.com' }),
      buildUser({ user_id: 'user-2', user_name: 'bob', user_email: 'bob@example.com' }),
    ])
    mockedFetchAdminUserDetail
      .mockResolvedValueOnce(buildDetail({ user_id: 'user-1', user_name: 'alice', user_email: 'alice@example.com' }))
      .mockResolvedValueOnce(buildDetail({ user_id: 'user-2', user_name: 'bob', user_email: 'bob@example.com' }))
    mockedFetchAdminUserActivityTimeline
      .mockResolvedValueOnce(buildActivityTimeline({ items: [buildActivityItem({ id: 'old', title: 'Старая активность' })] }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecondActivity = resolve
      }))

    const wrapper = await mountManagement()

    await wrapper.get('[data-testid="admin-user-row-user-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Старая активность')

    await wrapper.get('[data-testid="admin-user-row-user-2"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-activity-loading"]').text()).toContain('Загружаем')
    expect(wrapper.text()).not.toContain('Старая активность')

    resolveSecondActivity(buildActivityTimeline({ items: [buildActivityItem({ id: 'new', title: 'Новая активность' })] }))
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-activity-item-question-new"]').text()).toContain('Новая активность')
  })

})
