import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchAdminReputationPolicyConfig,
  updateAdminReputationPolicyConfig,
  type AdminReputationPolicyConfig,
} from '@/features/admin/api/admin'
import AdminReputationPolicyPanel from '@/features/admin/components/AdminReputationPolicyPanel.vue'

vi.mock('@/features/admin/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/admin/api/admin')>()

  return {
    ...actual,
    fetchAdminReputationPolicyConfig: vi.fn(),
    updateAdminReputationPolicyConfig: vi.fn(),
  }
})

vi.mock('@/shared/ui/SurfacePanel.vue', () => ({
  default: {
    props: ['padding'],
    template: '<section v-bind="$attrs"><slot /></section>',
  },
}))

vi.mock('@/shared/ui/InlineFeedbackPanel.vue', () => ({
  default: {
    props: {
      title: { type: String, required: true },
      description: { type: String, default: '' },
      actionLabel: { type: String, default: 'Попробовать снова' },
      showAction: { type: Boolean, default: false },
      tone: { type: String, default: 'default' },
    },
    emits: ['action'],
    template: `
      <section>
        <h2>{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
        <button v-if="showAction" type="button" @click="$emit('action')">{{ actionLabel }}</button>
      </section>
    `,
  },
}))

const mockedFetchPolicy = vi.mocked(fetchAdminReputationPolicyConfig)
const mockedUpdatePolicy = vi.mocked(updateAdminReputationPolicyConfig)

function buildPolicy(overrides: Partial<AdminReputationPolicyConfig> = {}): AdminReputationPolicyConfig {
  return {
    protected_newcomer_window_hours: 24,
    max_protected_newcomer_window_hours: 72,
    updated_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

async function mountPanel() {
  const wrapper = mount(AdminReputationPolicyPanel)
  await flushPromises()
  return wrapper
}

describe('AdminReputationPolicyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchPolicy.mockResolvedValue(buildPolicy())
    mockedUpdatePolicy.mockResolvedValue(buildPolicy())
  })

  it('loads policy config on mount and renders stable localized policy controls', async () => {
    const wrapper = await mountPanel()

    expect(mockedFetchPolicy).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="admin-policy-panel"]').text()).toContain('Защитное окно для новичков')
    expect(wrapper.get('[data-testid="admin-policy-current-value"]').text()).toContain('24 ч')
    expect((wrapper.get('[data-testid="admin-policy-hours-input"]').element as HTMLInputElement).value).toBe('24')
    expect(wrapper.get('[data-testid="admin-policy-unchanged"]').text()).toContain('Значение совпадает')
    expect(wrapper.text()).not.toContain('admin-api')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('password')
  })

  it('shows a safe retryable load error and recovers without leaking raw failure details', async () => {
    mockedFetchPolicy
      .mockRejectedValueOnce(new Error('Malformed admin API response: object_id token password'))
      .mockResolvedValueOnce(buildPolicy({ protected_newcomer_window_hours: 48 }))

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Не удалось загрузить политику')
    expect(wrapper.text()).toContain('Не удалось загрузить настройки политики')
    expect(wrapper.text()).not.toContain('object_id')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('password')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(mockedFetchPolicy).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="admin-policy-current-value"]').text()).toContain('48 ч')
  })

  it.each([
    ['', 'Укажите длительность'],
    ['1.5', 'Введите целое число'],
    ['0', 'Минимальное значение'],
    ['-1', 'Введите целое число'],
    ['169', 'Максимальное значение'],
  ])('rejects malformed local input %s without sending a transport call', async (value, message) => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue(value)
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-policy-field-error"]').text()).toContain(message)
    expect(wrapper.get('[data-testid="admin-policy-hours-input"]').attributes('aria-invalid')).toBe('true')
    expect(mockedUpdatePolicy).not.toHaveBeenCalled()
  })

  it.each([1, 72])('saves valid boundary value %i and renders the server-confirmed value', async (hours) => {
    mockedUpdatePolicy.mockResolvedValueOnce(buildPolicy({ protected_newcomer_window_hours: hours }))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue(String(hours))
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await flushPromises()

    expect(mockedUpdatePolicy).toHaveBeenCalledWith({ protected_newcomer_window_hours: hours })
    expect(wrapper.get('[data-testid="admin-policy-current-value"]').text()).toContain(`${hours} ч`)
    expect(wrapper.get('[data-testid="admin-policy-save-success"]').text()).toContain('Настройки политики сохранены')
  })

  it('keeps the previous loaded value visible and shows a safe save error for rejected saves', async () => {
    mockedUpdatePolicy.mockRejectedValueOnce(new Error('500 stack trace token password'))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue('72')
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-policy-current-value"]').text()).toContain('24 ч')
    expect(wrapper.get('[data-testid="admin-policy-save-error"]').text()).toContain('Не удалось сохранить настройки политики')
    expect(wrapper.text()).not.toContain('stack trace')
    expect(wrapper.text()).not.toContain('token')
    expect(wrapper.text()).not.toContain('password')
  })

  it('maps backend field validation to the inline hours error', async () => {
    mockedUpdatePolicy.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          protected_newcomer_window_hours: ['Защитное окно не может превышать системный максимум.'],
        },
      },
    })
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue('72')
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-policy-field-error"]').text()).toContain(
      'Защитное окно не может превышать системный максимум',
    )
    expect(wrapper.find('[data-testid="admin-policy-save-error"]').exists()).toBe(false)
  })

  it('guards duplicate save clicks while a save is pending', async () => {
    let resolveSave!: (config: AdminReputationPolicyConfig) => void
    mockedUpdatePolicy.mockReturnValueOnce(new Promise((resolve) => {
      resolveSave = resolve
    }))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="admin-policy-hours-input"]').setValue('72')
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')
    await wrapper.get('[data-testid="admin-policy-form"]').trigger('submit')

    expect(mockedUpdatePolicy).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="admin-policy-save"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="admin-policy-saving"]').text()).toContain('Сохранение выполняется')

    resolveSave(buildPolicy({ protected_newcomer_window_hours: 72 }))
    await flushPromises()
  })
})
