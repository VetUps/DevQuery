import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ProtectedQuestionChip from '@/features/questions/components/ProtectedQuestionChip.vue'
import type { QuestionListItem } from '@/features/questions/api/questions'

type ProtectedQuestionFixture = Pick<
  QuestionListItem,
  'question_created_at' | 'protected_until' | 'viewer_answer_required_level_label'
>

function buildProtectedQuestion(overrides: Partial<ProtectedQuestionFixture> = {}): ProtectedQuestionFixture {
  return {
    question_created_at: '2026-04-01T12:00:00Z',
    protected_until: '2026-04-02T00:00:00Z',
    viewer_answer_required_level_label: 'Эксперт',
    ...overrides,
  }
}

function mountChip(question: ProtectedQuestionFixture) {
  return mount(ProtectedQuestionChip, {
    attachTo: document.body,
    props: { question },
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('ProtectedQuestionChip', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('renders only the compact protection label before the chip is opened', () => {
    const wrapper = mountChip(buildProtectedQuestion())

    expect(wrapper.get('[data-testid="protected-question-chip"]').text()).toBe('Защита 12 часов')
    expect(wrapper.find('[data-testid="protected-question-info-dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Как работает защита вопроса')
    expect(wrapper.text()).not.toContain('Даунвоуты на защищённый вопрос временно отключены')
  })

  it('opens the shared policy dialog and closes it through AppDialog close action', async () => {
    const wrapper = mountChip(buildProtectedQuestion())

    await wrapper.get('[data-testid="protected-question-chip"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-dialog"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 12 часов после публикации')
    expect(wrapper.get('[data-testid="protected-question-info-policy"]').text()).toContain('Эксперт и выше')
    expect(wrapper.get('[data-testid="protected-question-info-policy"]').text()).not.toContain('Эксперт и Мастер')
    expect(wrapper.get('[data-testid="protected-question-info-votes"]').text()).toContain('Даунвоуты на защищённый вопрос временно отключены')

    await wrapper.get('[data-testid="protected-question-info-dialog"] .app-dialog__close').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="protected-question-info-dialog"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="protected-question-chip"]').text()).toBe('Защита 12 часов')
  })

  it('falls back to the default 12-hour label and safe copy for missing or malformed timestamps', async () => {
    const wrapper = mountChip(buildProtectedQuestion({
      question_created_at: 'not-a-date',
      protected_until: null,
      viewer_answer_required_level_label: null,
    }))

    expect(wrapper.get('[data-testid="protected-question-chip"]').text()).toBe('Защита 12 часов')

    await wrapper.get('[data-testid="protected-question-chip"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 12 часов после публикации')
    expect(wrapper.get('[data-testid="protected-question-info-policy"]').text()).toContain('Эксперт и выше')
    expect(wrapper.get('[data-testid="protected-question-info-policy"]').text()).not.toContain('Эксперт и Мастер')
    expect(wrapper.find('[data-testid="protected-question-info-deadline"]').exists()).toBe(false)
  })

  it('renders a 24-hour protected window with correct Russian pluralization', async () => {
    const wrapper = mountChip(buildProtectedQuestion({
      protected_until: '2026-04-02T12:00:00Z',
    }))

    expect(wrapper.get('[data-testid="protected-question-chip"]').text()).toBe('Защита 24 часа')

    await wrapper.get('[data-testid="protected-question-chip"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('Защита 24 часов')
    expect(wrapper.get('[data-testid="protected-question-info-body"]').text()).toContain('В течение первых 24 часов после публикации')
  })
})
