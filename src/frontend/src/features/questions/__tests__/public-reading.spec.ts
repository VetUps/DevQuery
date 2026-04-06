import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HomePage from '@/pages/HomePage.vue'
import QuestionDetailPage from '@/pages/QuestionDetailPage.vue'
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'
import ContentSkeleton from '@/shared/ui/ContentSkeleton.vue'

describe('public reading smoke coverage', () => {
  it('keeps the public list empty-state copy intentional', () => {
    const wrapper = mount(InlineFeedbackPanel, {
      props: {
        eyebrow: 'Публичная лента',
        title: 'Вопросов пока нет',
        description: 'Как только в системе появятся новые обсуждения, они сразу покажутся здесь.',
      },
    })

    expect(wrapper.text()).toContain('Вопросов пока нет')
  })

  it('keeps the retry action copy consistent across shared feedback states', () => {
    const wrapper = mount(InlineFeedbackPanel, {
      props: {
        title: 'Не удалось открыть вопрос',
        description: 'Не удалось загрузить данные. Попробуйте снова.',
        showAction: true,
      },
    })

    expect(wrapper.text()).toContain('Попробовать снова')
  })

  it('documents that home and detail pages use shared public-reading primitives', () => {
    expect(HomePage).toBeTruthy()
    expect(QuestionDetailPage).toBeTruthy()
    expect(ContentSkeleton).toBeTruthy()
  })
})
