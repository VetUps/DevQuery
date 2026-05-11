import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphState } from '@/features/knowledge/api/knowledgeGraph'
import KnowledgeGraphConceptDetails from '@/features/knowledge/components/KnowledgeGraphConceptDetails.vue'

function buildNode(overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    concept_id: 10,
    slug: 'django',
    name: 'Django',
    source: 'tag',
    provider: 'tag-sync',
    confidence: '0.9500',
    total_weight: '3.5000',
    source_count: 6,
    activity_breakdown: [
      { activity_type: 'authored_answer', total_weight: '2.2500', source_count: 4 },
      { activity_type: 'question_upvote', total_weight: '1.2500', source_count: 2 },
    ],
    related_questions: [
      {
        question_id: '22222222-2222-4222-8222-222222222222',
        title: 'Как объяснить связи графа?',
        status: 'open',
      },
    ],
    ...overrides,
  }
}

function buildState(overrides: Partial<KnowledgeGraphState> = {}): KnowledgeGraphState {
  return {
    status: 'fresh',
    stale_reason: '',
    last_error_message: '',
    last_failed_phase: '',
    last_rebuild_started_at: '2026-05-06T11:30:00Z',
    last_rebuild_finished_at: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

function buildEdge(overrides: Partial<KnowledgeGraphEdge> = {}): KnowledgeGraphEdge {
  return {
    id: '10-11',
    source_concept_id: 10,
    target_concept_id: 11,
    weight: '1.7500',
    shared_question_count: 2,
    reason: 'shared_question',
    related_questions: [
      {
        question_id: '33333333-3333-4333-8333-333333333333',
        title: 'Почему Django связан с Vue?',
        status: 'answered',
      },
    ],
    ...overrides,
  }
}

describe('KnowledgeGraphConceptDetails', () => {
  it('renders accessible guidance and graph state context when no concept is selected', () => {
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode: null,
        neighbourNodes: [],
        neighbourEdges: [],
        graphState: buildState({ status: 'mystery', last_error_message: 'provider stack token leaked' }),
      },
    })

    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')
    expect(wrapper.get('[data-testid="knowledge-graph-state-context"]').text()).toContain('Статус графа не распознан')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })

  it('renders selected aggregate concept details, neighbours, shared questions, and safe links', () => {
    const selectedNode = buildNode()
    const neighbourNode = buildNode({
      concept_id: 11,
      slug: 'vue',
      name: 'Vue',
      total_weight: '1.2500',
      related_questions: [],
    })
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode,
        neighbourNodes: [neighbourNode],
        neighbourEdges: [buildEdge()],
        graphState: buildState(),
      },
    })

    expect(wrapper.get('[data-testid="knowledge-graph-selected-details"]').text()).toContain('Django')
    expect(wrapper.text()).toContain('Вес')
    expect(wrapper.text()).toContain('3,5')
    expect(wrapper.text()).toContain('Уверенность')
    expect(wrapper.text()).toContain('0,95')
    expect(wrapper.text()).toContain('tag · tag-sync · 6 агрегированных сигналов')
    expect(wrapper.text()).toContain('Ответы')
    expect(wrapper.text()).toContain('Оценки вопросов')
    expect(wrapper.get('a[href="/questions/22222222-2222-4222-8222-222222222222"]').text()).toBe('Как объяснить связи графа?')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('Vue')
    expect(wrapper.text()).toContain('2 общих вопросов')
    expect(wrapper.get('a[href="/questions/33333333-3333-4333-8333-333333333333"]').text()).toBe('Почему Django связан с Vue?')
    expect(wrapper.get('[data-testid="knowledge-graph-state-context"]').text()).toContain('Граф актуален')
  })

  it('renders safe fallback copy for isolated concepts and failed graph state without raw backend errors', () => {
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode: buildNode({ activity_breakdown: [], related_questions: [] }),
        neighbourNodes: [],
        neighbourEdges: [],
        graphState: buildState({
          status: 'failed',
          last_failed_phase: 'question_authoring',
          last_error_message: 'Traceback provider stack token leaked',
        }),
      },
    })

    expect(wrapper.text()).toContain('Разбивка активности для концепта пока пустая')
    expect(wrapper.text()).toContain('Связанных вопросов пока нет')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('пока нет соседей')
    expect(wrapper.get('[data-testid="knowledge-graph-state-context"]').text()).toContain('question_authoring')
    expect(wrapper.get('[data-testid="knowledge-graph-state-context"]').text()).toContain('Технические детали скрыты')
    expect(wrapper.text()).not.toContain('provider stack token leaked')
    expect(wrapper.text()).not.toContain('Traceback')
  })
})
