import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QuestionRevisionHistoryButton from '@/features/questions/components/QuestionRevisionHistoryButton.vue'
import QuestionRevisionHistoryModal from '@/features/questions/components/QuestionRevisionHistoryModal.vue'
import type { QuestionRevisionRecord } from '@/features/questions/api/questionRevisions'

const revisionQueryState = {
  data: ref<{ count: number; next: string | null; previous: string | null; results: QuestionRevisionRecord[] } | undefined>(undefined),
  error: ref<unknown>(null),
  isPending: ref(false),
  isError: ref(false),
  refetch: vi.fn(),
}

vi.mock('@/features/questions/queries/useQuestionRevisionsQuery', () => ({
  useQuestionRevisionsQuery: vi.fn(() => revisionQueryState),
}))

function buildRevision(overrides: Partial<QuestionRevisionRecord> = {}): QuestionRevisionRecord {
  return {
    question_revision_id: 'revision-1',
    question: 'question-1',
    actor: 'user-1',
    actor_name: 'Author',
    source: 'direct_edit',
    question_edit: null,
    title_before: 'Old title',
    title_after: 'New title',
    body_before: 'Old body with mysql',
    body_after: 'New body with vue',
    tags_before: ['django', 'mysql'],
    tags_after: ['django', 'vue'],
    created_at: '2026-05-05T12:00:00Z',
    ...overrides,
  }
}

function setRevisionResults(results: QuestionRevisionRecord[]) {
  revisionQueryState.data.value = {
    count: results.length,
    next: null,
    previous: null,
    results,
  }
}

function mountModal() {
  return mount(QuestionRevisionHistoryModal, {
    attachTo: document.body,
    props: {
      open: true,
      questionId: 'question-1',
    },
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('question revision history UI', () => {
  beforeEach(() => {
    revisionQueryState.data.value = undefined
    revisionQueryState.error.value = null
    revisionQueryState.isPending.value = false
    revisionQueryState.isError.value = false
    revisionQueryState.refetch.mockReset()
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('renders an affordance that opens the revision history modal', async () => {
    setRevisionResults([])

    const wrapper = mount(QuestionRevisionHistoryButton, {
      attachTo: document.body,
      props: { questionId: 'question-1' },
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    expect(wrapper.text()).toContain('История изменений')
    expect(wrapper.find('[data-testid="question-revision-history-modal"]').exists()).toBe(false)

    await wrapper.get('[data-testid="question-revision-history-open"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="question-revision-history-modal"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('История пока пуста')
  })

  it('renders a localized loading state inside the modal', () => {
    revisionQueryState.isPending.value = true

    const wrapper = mountModal()

    expect(wrapper.text()).toContain('Загружаем историю изменений…')
  })

  it('renders an empty state when the backend returns no revisions', () => {
    setRevisionResults([])

    const wrapper = mountModal()

    expect(wrapper.get('[data-testid="question-revision-history-empty"]').text()).toContain('История пока пуста')
    expect(wrapper.text()).toContain('У этого вопроса ещё нет сохранённых правок')
  })

  it('renders an error state with retry without leaking raw backend details', async () => {
    revisionQueryState.isError.value = true
    revisionQueryState.error.value = new Error('Authorization: Bearer secret raw stack')

    const wrapper = mountModal()

    expect(wrapper.get('[data-testid="question-revision-history-error"]').text()).toContain(
      'Не удалось загрузить историю правок вопроса. Попробуйте ещё раз.',
    )
    expect(wrapper.text()).not.toContain('Bearer secret')

    await wrapper.get('[data-testid="question-revision-history-error"] button').trigger('click')

    expect(revisionQueryState.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders direct and backend-shaped proposal approval revisions with before and after comparisons', () => {
    setRevisionResults([
      buildRevision(),
      buildRevision({
        question_revision_id: 'revision-2',
        actor: 'editor-1',
        actor_name: 'Community Editor',
        source: 'proposal_approval',
        question_edit: 'edit-9',
        title_before: 'New title',
        title_after: 'New title',
        body_before: 'New body with vue',
        body_after: 'New body with vue and tests',
        tags_before: ['django', 'vue'],
        tags_after: ['django', 'vue', 'testing'],
        created_at: '2026-05-06T12:00:00Z',
      }),
    ])

    const wrapper = mountModal()
    const text = wrapper.text()

    expect(text).toContain('Прямая правка автора')
    expect(text).toContain('Одобренная правка сообщества')
    expect(text).toContain('Author')
    expect(text).toContain('Community Editor')
    expect(text).toContain('Old title')
    expect(text).toContain('New title')
    expect(text).toContain('Old body with mysql')
    expect(text).toContain('New body with vue and tests')
    expect(text).toContain('#django, #mysql')
    expect(text).toContain('#django, #vue, #testing')
  })

  it('keeps the legacy approved_proposal fixture compatible while backend uses proposal_approval', () => {
    setRevisionResults([
      buildRevision({
        source: 'approved_proposal',
        question_edit: 'edit-legacy',
      }),
    ])

    const wrapper = mountModal()

    expect(wrapper.text()).toContain('Одобренная правка сообщества')
  })

  it('renders unknown future revision sources with a safe generic label without leaking the raw enum', () => {
    setRevisionResults([
      buildRevision({
        source: 'bulk_import_from_private_tool',
        question_edit: null,
      }),
    ])

    const wrapper = mountModal()
    const text = wrapper.text()

    expect(text).toContain('Правка вопроса')
    expect(text).not.toContain('bulk_import_from_private_tool')
  })

  it('renders only public revision fields and omits private backend internals', () => {
    setRevisionResults([
      {
        ...buildRevision(),
        user_email: 'author@example.com',
        password: 'secret',
      } as QuestionRevisionRecord,
    ])

    const wrapper = mountModal()

    expect(wrapper.text()).toContain('Author')
    expect(wrapper.text()).not.toContain('author@example.com')
    expect(wrapper.text()).not.toContain('password')
    expect(wrapper.text()).not.toContain('secret')
  })
})
