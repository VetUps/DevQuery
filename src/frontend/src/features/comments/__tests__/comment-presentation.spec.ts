import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { queryClient } from '@/app/query-client'
import CommentComposer from '@/features/comments/components/CommentComposer.vue'
import CommentContextBlock from '@/features/comments/components/CommentContextBlock.vue'
import DiscussionThreadModal from '@/features/comments/components/DiscussionThreadModal.vue'
import CommentThreadItem from '@/features/comments/components/CommentThreadItem.vue'

const threadState = {
  data: ref<any[]>([]),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/comments/queries/useCommentThreadQuery', async () => {
  const actual = await vi.importActual<typeof import('@/features/comments/queries/useCommentThreadQuery')>('@/features/comments/queries/useCommentThreadQuery')

  return {
    ...actual,
    useCommentThreadQuery: vi.fn(() => threadState),
  }
})

function buildComment(body: string) {
  return {
    comment_id: 'comment-1',
    user: 'user-1',
    user_name: 'Комментатор',
    user_avatar_url: null,
    target_type: 'question' as const,
    target_id: 'question-1',
    parent_id: null,
    body,
    created_at: '2026-04-09T14:32:00',
    replies: [],
  }
}

describe('comment presentation polish', () => {
  beforeEach(() => {
    queryClient.clear()
    threadState.data.value = [buildComment('Полная дискуссия в модалке')]
    threadState.isPending.value = false
    threadState.isError.value = false
    threadState.refetch.mockReset()
  })

  it('renders a compact count-only entry trigger instead of inline comment previews', () => {
    const wrapper = mount(CommentContextBlock, {
      props: {
        title: 'Комментарии к вопросу',
        targetType: 'question',
        targetId: 'question-1',
        comments: [buildComment('Скрытый комментарий')],
        count: 4,
        composerKeyPrefix: 'question',
      },
    })

    expect(wrapper.get('[data-testid="comment-entry-trigger"]').text()).toContain('4')
    expect(wrapper.text()).not.toContain('Скрытый комментарий')
  })

  it('keeps the full discussion modal read-only for guests', async () => {
    const wrapper = mount(DiscussionThreadModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Комментарии к вопросу',
        targetType: 'question',
        targetId: 'question-1',
        contextEyebrow: 'Контекст вопроса',
        contextTitle: 'Как открыть модалку?',
        contextBody: 'Через компактный триггер.',
        canComment: false,
      },
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
        stubs: {
          teleport: true,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Как открыть модалку?')
    expect(wrapper.text()).not.toContain('Комментировать')
  })

  it('shows the 800-character composer limit to the user', async () => {
    const wrapper = mount(CommentComposer)
    const textarea = wrapper.get('textarea')
    const longBody = 'а'.repeat(800)

    await textarea.setValue(longBody)

    expect(textarea.attributes('maxlength')).toBe('800')
    expect(wrapper.text()).toContain('800 / 800')
  })

  it('renders full date and time and allows long comments to expand and collapse', async () => {
    const wrapper = mount(CommentThreadItem, {
      props: {
        comment: buildComment('Очень длинный комментарий '.repeat(20)),
        targetType: 'question',
        targetId: 'question-1',
      },
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    const body = wrapper.get('.comment-thread-item__body')

    expect(wrapper.text()).toContain('09.04.2026, 14:32')
    expect(body.classes()).toContain('comment-thread-item__body--clamped')
    expect(wrapper.text()).toContain('Развернуть')

    await wrapper.get('button').trigger('click')

    expect(body.classes()).not.toContain('comment-thread-item__body--clamped')
    expect(wrapper.text()).toContain('Свернуть')
  })
})
