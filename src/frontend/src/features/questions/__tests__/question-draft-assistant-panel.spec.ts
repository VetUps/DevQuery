import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { DraftAssistantResponse } from '@/features/questions/api/questionDraftAssistant'
import QuestionDraftAssistantPanel from '@/features/questions/components/QuestionDraftAssistantPanel.vue'

const assistantResult: DraftAssistantResponse = {
  status: 'ok',
  mode: 'create',
  summary: 'Черновик понятен, но заголовок можно сделать конкретнее.',
  findings: [
    {
      code: 'title_too_generic',
      message: 'Добавьте технологию и симптом в заголовок.',
      severity: 'warning',
      field: 'question_title',
    },
    {
      code: 'body_context',
      message: 'Опишите ожидаемое поведение рядом с фактическим.',
      severity: 'info',
      field: 'question_body',
    },
  ],
  suggested_title: 'Как исправить ошибку Vue Router при переходе после публикации?',
  suggested_body: 'Опишите маршрут, ожидаемый переход и фактическую ошибку после публикации вопроса.',
  suggested_tags: ['vue', 'vue-router', 'django'],
  warnings: [],
}

function mountPanel(props: Partial<InstanceType<typeof QuestionDraftAssistantPanel>['$props']> = {}) {
  return mount(QuestionDraftAssistantPanel, {
    props: {
      result: null,
      isPending: false,
      ...props,
    },
  })
}

describe('QuestionDraftAssistantPanel', () => {
  it('renders an idle request CTA without wrapping controls in a form', async () => {
    const wrapper = mountPanel()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Запустите проверку')

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('request')).toHaveLength(1)
  })

  it('disables request and apply controls while pending', async () => {
    const wrapper = mountPanel({ result: assistantResult, isPending: true })
    const buttons = wrapper.findAll('button')

    expect(wrapper.get('[role="status"]').text()).toContain('Помощник анализирует черновик')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('disabled')).not.toBeUndefined()
    expect(wrapper.text()).not.toContain('Применить заголовок')
    expect(wrapper.text()).not.toContain('Применить текст')
    expect(wrapper.text()).not.toContain('Применить теги')

    await buttons[0].trigger('click')

    expect(wrapper.emitted('request')).toBeUndefined()
    expect(wrapper.emitted('apply-title')).toBeUndefined()
    expect(wrapper.emitted('apply-body')).toBeUndefined()
    expect(wrapper.emitted('apply-tags')).toBeUndefined()
  })

  it('renders safe generic error copy without leaking raw exception details and allows retry', async () => {
    const rawSecret = 'provider stack trace token sk-live-secret internal timeout payload'
    const wrapper = mountPanel({ error: new Error(rawSecret) })

    expect(wrapper.get('[role="alert"]').text()).toContain('Не удалось получить рекомендации')
    expect(wrapper.text()).not.toContain(rawSecret)
    expect(wrapper.text()).not.toContain('sk-live-secret')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('request')).toHaveLength(1)
  })

  it('displays assistant_unavailable warnings as a non-blocking result', () => {
    const wrapper = mountPanel({
      result: {
        ...assistantResult,
        status: 'assistant_unavailable',
        summary: 'Автоматические рекомендации временно недоступны.',
        warnings: [{ code: 'provider_unavailable', message: 'Сервис помощника недоступен, можно продолжить вручную.' }],
      },
    })

    expect(wrapper.get('[role="status"]').text()).toContain('Сервис помощника недоступен')
    expect(wrapper.text()).toContain('Автоматические рекомендации временно недоступны.')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('renders summary, findings, and suggestion cards', () => {
    const wrapper = mountPanel({ result: assistantResult })

    expect(wrapper.text()).toContain('Черновик понятен')
    expect(wrapper.text()).toContain('Добавьте технологию и симптом')
    expect(wrapper.text()).toContain('ожидаемое поведение')
    expect(wrapper.text()).toContain('Как исправить ошибку Vue Router')
    expect(wrapper.text()).toContain('#vue-router')
  })

  it('emits exact selective-apply payloads for title, body, and tags', async () => {
    const wrapper = mountPanel({ result: assistantResult })

    await wrapper.findAll('button').find((button) => button.text() === 'Применить заголовок')?.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === 'Применить текст')?.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === 'Применить теги')?.trigger('click')

    expect(wrapper.emitted('apply-title')?.[0]).toEqual([assistantResult.suggested_title])
    expect(wrapper.emitted('apply-body')?.[0]).toEqual([assistantResult.suggested_body])
    expect(wrapper.emitted('apply-tags')?.[0]).toEqual([assistantResult.suggested_tags])
  })

  it('hides apply controls for empty title, body, and tag suggestions', () => {
    const wrapper = mountPanel({
      result: {
        ...assistantResult,
        suggested_title: null,
        suggested_body: null,
        suggested_tags: [],
      },
    })

    expect(wrapper.text()).not.toContain('Применить заголовок')
    expect(wrapper.text()).not.toContain('Применить текст')
    expect(wrapper.text()).not.toContain('Применить теги')
  })
})
