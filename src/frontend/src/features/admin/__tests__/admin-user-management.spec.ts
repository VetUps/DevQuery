import { DOMWrapper, mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchAdminUserActivityTimeline,
  fetchAdminUserDetail,
  fetchAdminUserReputationLedger,
  fetchAdminUsers,
  updateAdminUserManualOverride,
  type AdminUserActivityItem,
  type AdminUserActivityTimeline,
  type AdminUserDetail,
  type AdminUserListRow,
  type AdminUserReputationLedgerPage,
} from '@/features/admin/api/admin'
import type { ReputationLedgerEntry, ReputationSummary } from '@/features/users/api/reputation'
import AdminUserManagement from '@/features/admin/components/AdminUserManagement.vue'

vi.mock('@/features/admin/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/admin/api/admin')>()

  return {
    ...actual,
    fetchAdminUsers: vi.fn(),
    fetchAdminUserDetail: vi.fn(),
    fetchAdminUserReputationLedger: vi.fn(),
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
const mockedFetchAdminUserReputationLedger = vi.mocked(fetchAdminUserReputationLedger)
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
    page: 1,
    limit: 10,
    available_types: ['question', 'comment', 'reputation'],
    ...overrides,
  }
}

function buildLedgerPage(overrides: Partial<AdminUserReputationLedgerPage> = {}): AdminUserReputationLedgerPage {
  return {
    count: 1,
    next: null,
    previous: null,
    results: [buildLedgerEntry()],
    ...overrides,
  }
}

async function mountManagement() {
  cleanupDialogBody()
  const wrapper = mount(AdminUserManagement)
  await flushPromises()
  return wrapper
}

function cleanupDialogBody() {
  document.body.style.overflow = ''
  document.body.querySelectorAll('.app-dialog').forEach((element) => element.remove())
}

function queryDialog() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}

function getDialog() {
  const dialog = queryDialog()
  expect(dialog).not.toBeNull()
  return dialog as HTMLElement
}

function getByTestId(container: ParentNode, testId: string) {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  expect(element).not.toBeNull()
  return element as HTMLElement
}

function modalText(testId: string) {
  return getByTestId(getDialog(), testId).textContent ?? ''
}

function modalWrapper(testId: string) {
  return new DOMWrapper(getByTestId(getDialog(), testId))
}

function modalControl(selector: string) {
  const element = getDialog().querySelector<HTMLElement>(selector)
  expect(element).not.toBeNull()
  return new DOMWrapper(element as HTMLElement)
}

function pageText(wrapper: any) {
  return `${wrapper.text()} ${document.body.textContent ?? ''}`
}

async function openUserManagement(wrapper: any, userId = 'user-1') {
  const row = wrapper.get(`[data-testid="admin-user-row-${userId}"]`)
  expect(row.text()).toContain('Управление')

  const action = row.get(`[data-testid="admin-user-manage-${userId}"]`)
  expect(action.text()).toContain('Управление')
  await action.trigger('click')

  return getDialog()
}


describe('AdminUserManagement', () => {
  beforeEach(() => {
    cleanupDialogBody()
    vi.clearAllMocks()
    mockedFetchAdminUsers.mockResolvedValue([buildUser()])
    mockedFetchAdminUserDetail.mockResolvedValue(buildDetail())
    mockedFetchAdminUserReputationLedger.mockResolvedValue(buildLedgerPage())
    mockedFetchAdminUserActivityTimeline.mockResolvedValue(buildActivityTimeline())
    mockedUpdateAdminUserManualOverride.mockResolvedValue(buildDetail())
  })

  afterEach(() => {
    cleanupDialogBody()
  })

  it('loads the bounded default list on mount and keeps admin markers stable', async () => {
    const wrapper = await mountManagement()

    expect(mockedFetchAdminUsers).toHaveBeenCalledWith({ search: '', limit: 25 })
    expect(wrapper.get('[data-testid="admin-user-search"]').text()).toContain('Поиск пользователя')
    const rowText = wrapper.get('[data-testid="admin-user-row-user-1"]').text()
    expect(rowText).toContain('alice@example.com')
    expect(rowText).toContain('Управление')
    expect(wrapper.get('[data-testid="admin-user-manage-user-1"]').text()).toContain('Управление')
    expect(wrapper.find('[data-testid="admin-user-detail-empty"]').exists()).toBe(false)
    expect(queryDialog()).toBeNull()
    expect(pageText(wrapper)).not.toContain('admin-api')
    expect(pageText(wrapper)).not.toContain('token')
    expect(pageText(wrapper)).not.toContain('password')
    expect(pageText(wrapper)).not.toContain('content type')
    expect(pageText(wrapper)).not.toContain('object id')
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

  it('opens the management modal immediately with selected context while detail is still loading', async () => {
    let resolveDetail!: (detail: AdminUserDetail) => void
    mockedFetchAdminUserDetail.mockReturnValueOnce(new Promise((resolve) => {
      resolveDetail = resolve
    }))

    const wrapper = await mountManagement()

    const dialog = await openUserManagement(wrapper)

    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(document.body.style.overflow).toBe('hidden')
    expect(mockedFetchAdminUserDetail).toHaveBeenCalledWith('user-1')
    expect(modalText('admin-user-detail-selected-context')).toContain('alice@example.com')
    expect(modalText('admin-user-detail-loading')).toContain('Загружаем детали пользователя')
    expect(wrapper.find('[data-testid="admin-user-detail-empty"]').exists()).toBe(false)

    resolveDetail(buildDetail())
    await flushPromises()
  })

  it('opens with accessible local modal tabs and switches panels without closing the dialog', async () => {
    const wrapper = await mountManagement()

    const dialog = await openUserManagement(wrapper)
    await flushPromises()

    expect(getByTestId(dialog, 'admin-user-detail-tabs').getAttribute('role')).toBe('tablist')
    const detailsTab = getByTestId(dialog, 'admin-user-detail-tab-details')
    const ledgerTab = getByTestId(dialog, 'admin-user-detail-tab-ledger')
    const activityTab = getByTestId(dialog, 'admin-user-detail-tab-activity')

    expect(detailsTab.getAttribute('role')).toBe('tab')
    expect(detailsTab.getAttribute('aria-selected')).toBe('true')
    expect(detailsTab.textContent).toContain('Детали о пользователе')
    expect(ledgerTab.textContent).toContain('Журнал репутации')
    expect(activityTab.textContent).toContain('Журнал событий')
    expect(modalText('admin-user-detail-panel-details')).toContain('250')
    expect(getByTestId(dialog, 'admin-user-detail-panel-ledger').hidden).toBe(true)
    expect(getByTestId(dialog, 'admin-user-detail-panel-activity').hidden).toBe(true)

    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    await flushPromises()

    expect(queryDialog()).toBe(dialog)
    expect(detailsTab.getAttribute('aria-selected')).toBe('false')
    expect(ledgerTab.getAttribute('aria-selected')).toBe('true')
    expect(modalText('admin-user-detail-panel-ledger')).toContain('Ручная корректировка')
    expect(getByTestId(dialog, 'admin-user-detail-panel-details').hidden).toBe(true)

    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()

    expect(queryDialog()).toBe(dialog)
    expect(ledgerTab.getAttribute('aria-selected')).toBe('false')
    expect(activityTab.getAttribute('aria-selected')).toBe('true')
    expect(modalText('admin-user-detail-panel-activity')).toContain('Журнал действий пользователя')
  })

  it('keeps the manual override form collapsed in a native details disclosure inside only the details tab', async () => {
    const wrapper = await mountManagement()

    const dialog = await openUserManagement(wrapper)
    await flushPromises()

    const detailsPanel = getByTestId(dialog, 'admin-user-detail-panel-details')
    const ledgerPanel = getByTestId(dialog, 'admin-user-detail-panel-ledger')
    const activityPanel = getByTestId(dialog, 'admin-user-detail-panel-activity')
    const expander = getByTestId(detailsPanel, 'admin-manual-override-expander') as HTMLDetailsElement
    const summary = getByTestId(expander, 'admin-manual-override-summary')

    expect(expander.tagName).toBe('DETAILS')
    expect(summary.tagName).toBe('SUMMARY')
    expect(summary.textContent).toContain('Изменить ручной уровень репутации')
    expect(expander.open).toBe(false)
    expect(getByTestId(expander, 'admin-manual-override-form')).toBeInstanceOf(HTMLFormElement)
    expect(ledgerPanel.querySelector('[data-testid="admin-manual-override-form"]')).toBeNull()
    expect(activityPanel.querySelector('[data-testid="admin-manual-override-form"]')).toBeNull()

    await new DOMWrapper(summary).trigger('click')
    await flushPromises()

    expect(expander.open).toBe(true)

    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    await flushPromises()

    expect(detailsPanel.hidden).toBe(true)
    expect(ledgerPanel.hidden).toBe(false)
    expect(ledgerPanel.querySelector('[data-testid="admin-manual-override-expander"]')).toBeNull()
  })

  it('resets details context and the native override disclosure when switching users in an open modal', async () => {
    mockedFetchAdminUsers.mockResolvedValueOnce([
      buildUser({ user_id: 'user-1', user_name: 'alice', user_email: 'alice@example.com' }),
      buildUser({ user_id: 'user-2', user_name: 'bob', user_email: 'bob@example.com' }),
    ])
    mockedFetchAdminUserDetail
      .mockResolvedValueOnce(buildDetail({
        user_id: 'user-1',
        user_name: 'alice',
        user_email: 'alice@example.com',
        reputation: buildReputationSummary({ score: 250, level_label: 'Эксперт' }),
      }))
      .mockResolvedValueOnce(buildDetail({
        user_id: 'user-2',
        user_name: 'bob',
        user_email: 'bob@example.com',
        reputation: buildReputationSummary({ score: 640, level_label: 'Мастер' }),
      }))

    const wrapper = await mountManagement()

    await openUserManagement(wrapper, 'user-1')
    await flushPromises()

    expect(modalText('admin-user-detail-selected-context')).toContain('alice@example.com')
    expect(modalText('admin-user-reputation-summary')).toContain('Эксперт')
    const firstExpander = getByTestId(getDialog(), 'admin-manual-override-expander') as HTMLDetailsElement
    await modalWrapper('admin-manual-override-summary').trigger('click')
    await flushPromises()
    expect(firstExpander.open).toBe(true)

    await openUserManagement(wrapper, 'user-2')
    await flushPromises()

    expect(queryDialog()).not.toBeNull()
    expect(mockedFetchAdminUserDetail).toHaveBeenLastCalledWith('user-2')
    expect(modalText('admin-user-detail-selected-context')).toContain('bob@example.com')
    expect(modalText('admin-user-detail-selected-context')).not.toContain('alice@example.com')
    expect(modalText('admin-user-reputation-summary')).toContain('Мастер')
    expect(modalText('admin-user-reputation-summary')).not.toContain('Эксперт')
    expect(modalWrapper('admin-user-detail-tab-details').attributes('aria-selected')).toBe('true')
    expect((getByTestId(getDialog(), 'admin-manual-override-expander') as HTMLDetailsElement).open).toBe(false)
  })

  it('resets the local modal tab to details when the same user is reopened', async () => {
    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()
    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()

    expect(modalWrapper('admin-user-detail-tab-activity').attributes('aria-selected')).toBe('true')

    await modalControl('.app-dialog__close').trigger('click')
    await flushPromises()
    expect(queryDialog()).toBeNull()

    await openUserManagement(wrapper)
    await flushPromises()

    expect(modalWrapper('admin-user-detail-tab-details').attributes('aria-selected')).toBe('true')
    expect(modalWrapper('admin-user-detail-tab-activity').attributes('aria-selected')).toBe('false')
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

    await openUserManagement(wrapper)
    await flushPromises()

    expect(mockedFetchAdminUserDetail).toHaveBeenCalledWith('user-1')
    expect(modalText('admin-user-reputation-summary')).toContain('250')
    expect(modalText('admin-user-reputation-summary')).toContain('Мастер')

    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    await flushPromises()

    expect(modalText('admin-reputation-ledger')).toContain('Ручная корректировка')
    expect(modalText('admin-reputation-ledger')).toContain('Администратор уточнил репутацию')
  })

  it('renders safe list retry state for rejected or malformed admin list responses', async () => {
    mockedFetchAdminUsers.mockRejectedValueOnce(new Error('Malformed admin API response: object_id token'))

    const wrapper = await mountManagement()

    expect(wrapper.get('[data-testid="admin-user-search-error"]').text()).toContain('Не удалось загрузить пользователей')
    expect(pageText(wrapper)).not.toContain('object_id')
    expect(pageText(wrapper)).not.toContain('token')

    mockedFetchAdminUsers.mockResolvedValueOnce([buildUser({ user_name: 'recovered' })])
    await wrapper.get('[data-testid="admin-user-search-error"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-user-row-user-1"]').text()).toContain('recovered')
  })

  it('keeps selected row context visible while selected detail load fails and retries', async () => {
    mockedFetchAdminUserDetail.mockRejectedValueOnce(new Error('raw exception with password'))
    mockedFetchAdminUserReputationLedger.mockResolvedValue(buildLedgerPage({ count: 0, results: [] }))

    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()

    expect(modalText('admin-user-detail-selected-context')).toContain('alice@example.com')
    expect(modalText('admin-user-detail-error')).toContain('Не удалось загрузить детали пользователя')
    expect(pageText(wrapper)).not.toContain('raw exception')
    expect(pageText(wrapper)).not.toContain('password')

    mockedFetchAdminUserDetail.mockResolvedValueOnce(buildDetail({ reputation_ledger: [] }))
    await modalControl('[data-testid="admin-user-detail-error"] button').trigger('click')
    await flushPromises()
    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    await flushPromises()

    expect(modalText('admin-reputation-ledger-empty')).toContain('Журнал репутации пуст')
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
    mockedFetchAdminUserReputationLedger
      .mockResolvedValueOnce(buildLedgerPage({ results: initialDetail.reputation_ledger }))
      .mockResolvedValueOnce(buildLedgerPage({ results: refreshedDetail.reputation_ledger }))

    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()
    expect(modalText('admin-user-reputation-summary')).toContain('250')
    expect(modalText('admin-user-reputation-summary')).toContain('Эксперт')

    await modalControl('#admin-manual-override-level').setValue('master')
    await modalControl('#admin-manual-override-note').setValue('Повышение по итогам модерации.')
    await modalWrapper('admin-manual-override-form').trigger('submit')
    await flushPromises()

    expect(mockedUpdateAdminUserManualOverride).toHaveBeenCalledWith({
      userId: 'user-1',
      manual_reputation_level: 'master',
      note: 'Повышение по итогам модерации.',
    })
    expect(modalText('admin-user-reputation-summary')).toContain('250')
    expect(modalText('admin-user-reputation-summary')).toContain('Мастер')
    expect(modalText('admin-manual-override-feedback')).toContain('Ручной уровень сохранён')

    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    mockedFetchAdminUserReputationLedger.mockResolvedValue(buildLedgerPage({ results: refreshedDetail.reputation_ledger }))
    await modalControl('[data-testid="admin-reputation-ledger"] button').trigger('click')
    await flushPromises()

    expect(modalText('admin-reputation-ledger')).toContain('0')
    expect(modalText('admin-reputation-ledger')).toContain('Ручное изменение уровня')
    expect(modalText('admin-reputation-ledger')).toContain('Повышение по итогам модерации')
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

    await openUserManagement(wrapper)
    await flushPromises()

    await modalWrapper('admin-manual-override-form').trigger('submit')
    await flushPromises()

    expect(mockedUpdateAdminUserManualOverride).not.toHaveBeenCalled()
    expect(modalText('admin-manual-override-feedback')).toContain('Добавьте заметку')

    await modalControl('#admin-manual-override-level').setValue('__clear__')
    await modalControl('#admin-manual-override-note').setValue('Снятие ручного уровня.')
    await modalWrapper('admin-manual-override-form').trigger('submit')
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

    await openUserManagement(wrapper)
    await flushPromises()
    await modalControl('#admin-manual-override-level').setValue('master')
    await modalControl('#admin-manual-override-note').setValue('Duplicate guard.')
    await modalWrapper('admin-manual-override-form').trigger('submit')
    await modalWrapper('admin-manual-override-form').trigger('submit')

    expect(mockedUpdateAdminUserManualOverride).toHaveBeenCalledTimes(1)
    expect(modalWrapper('admin-manual-override-submit').attributes('disabled')).toBeDefined()

    resolveOverride(buildDetail())
    await flushPromises()
  })

  it('keeps prior selected detail visible and redacts raw backend override failures', async () => {
    mockedFetchAdminUserDetail.mockResolvedValueOnce(buildDetail({
      reputation: buildReputationSummary({ score: 250, level_label: 'Эксперт' }),
      reputation_ledger: [buildLedgerEntry({ note: 'Старое значение.' })],
    }))
    mockedFetchAdminUserReputationLedger.mockResolvedValueOnce(buildLedgerPage({
      results: [buildLedgerEntry({ note: 'Старое значение.' })],
    }))
    mockedUpdateAdminUserManualOverride.mockRejectedValueOnce(new Error('403 token password object_id'))

    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()
    await modalControl('#admin-manual-override-level').setValue('master')
    await modalControl('#admin-manual-override-note').setValue('Попытка изменения.')
    await modalWrapper('admin-manual-override-form').trigger('submit')
    await flushPromises()

    expect(modalText('admin-user-reputation-summary')).toContain('Эксперт')
    expect(modalText('admin-manual-override-feedback')).toContain('Не удалось сохранить ручной уровень')

    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    await flushPromises()

    expect(modalText('admin-reputation-ledger')).toContain('Старое значение')
    expect(pageText(wrapper)).not.toContain('object_id')
    expect(pageText(wrapper)).not.toContain('token')
    expect(pageText(wrapper)).not.toContain('password')
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

    expect(wrapper.find('[data-testid="admin-user-activity-no-selection"]').exists()).toBe(false)
    expect(queryDialog()).toBeNull()

    await openUserManagement(wrapper)
    await flushPromises()
    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()

    expect(mockedFetchAdminUserActivityTimeline).toHaveBeenCalledWith({ userId: 'user-1', types: [], limit: 10, page: 1 })
    expect(modalText('admin-user-activity-selected-context')).toContain('alice@example.com')
    expect(modalText('admin-user-activity-count')).toContain('Найдено событий: 3')
    expect(modalText('admin-user-activity-item-question-q-1')).toContain('Краткое описание вопроса')
    expect(modalText('admin-user-activity-item-comment-comment-1')).toContain('Комментарий #9')
    expect(modalText('admin-user-activity-item-reputation-rep-1')).toContain('Репутация изменилась')
    expect(pageText(wrapper)).not.toContain('Полное тело')
    expect(pageText(wrapper)).not.toContain('Удалить')
    expect(pageText(wrapper)).not.toContain('Заблокировать')
  })

  it('reloads only the activity section when filters are toggled', async () => {
    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()
    mockedFetchAdminUserDetail.mockClear()

    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()

    await modalWrapper('admin-user-activity-filter-comment').trigger('click')
    await flushPromises()
    await modalWrapper('admin-user-activity-filter-reputation').trigger('click')
    await flushPromises()

    expect(mockedFetchAdminUserActivityTimeline).toHaveBeenLastCalledWith({
      userId: 'user-1',
      types: ['comment', 'reputation'],
      limit: 10,
      page: 1,
    })
    expect(modalWrapper('admin-user-activity-filter-comment').attributes('aria-pressed')).toBe('true')
    expect(modalWrapper('admin-user-activity-filter-reputation').attributes('aria-pressed')).toBe('true')
    expect(mockedFetchAdminUserDetail).not.toHaveBeenCalled()
  })

  it('renders an explicit empty activity state from a bounded empty timeline', async () => {
    mockedFetchAdminUserActivityTimeline.mockResolvedValueOnce(buildActivityTimeline({ items: [], count: 0 }))

    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()
    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()

    expect(modalText('admin-user-activity-empty')).toContain('Активность не найдена')
  })

  it('keeps reputation controls visible and retries activity after safe fetch failures', async () => {
    mockedFetchAdminUserActivityTimeline
      .mockRejectedValueOnce(new Error('Malformed admin API response: raw_body password object_id'))
      .mockResolvedValueOnce(buildActivityTimeline({
        items: [buildActivityItem({ id: 'recovered', type: 'solution', title: 'Решение добавлено' })],
      }))

    const wrapper = await mountManagement()

    await openUserManagement(wrapper)
    await flushPromises()

    expect(modalText('admin-user-reputation-summary')).toContain('250')
    expect(modalWrapper('admin-manual-override-form').exists()).toBe(true)

    await modalWrapper('admin-user-detail-tab-ledger').trigger('click')
    await flushPromises()
    expect(modalWrapper('admin-reputation-ledger').exists()).toBe(true)

    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()
    expect(modalText('admin-user-activity-error')).toContain('Не удалось загрузить активность пользователя')
    expect(pageText(wrapper)).not.toContain('raw_body')
    expect(pageText(wrapper)).not.toContain('password')
    expect(pageText(wrapper)).not.toContain('object_id')

    await modalControl('[data-testid="admin-user-activity-error"] button').trigger('click')
    await flushPromises()

    expect(modalText('admin-user-activity-item-solution-recovered')).toContain('Решение добавлено')
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

    await openUserManagement(wrapper)
    await flushPromises()
    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()
    expect(pageText(wrapper)).toContain('Старая активность')

    await openUserManagement(wrapper, 'user-2')
    await flushPromises()
    await modalWrapper('admin-user-detail-tab-activity').trigger('click')
    await flushPromises()

    expect(modalText('admin-user-activity-loading')).toContain('Загружаем')
    expect(pageText(wrapper)).not.toContain('Старая активность')

    resolveSecondActivity(buildActivityTimeline({ items: [buildActivityItem({ id: 'new', title: 'Новая активность' })] }))
    await flushPromises()

    expect(modalText('admin-user-activity-item-question-new')).toContain('Новая активность')
  })

})
