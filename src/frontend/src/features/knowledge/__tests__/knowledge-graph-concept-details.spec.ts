import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/features/knowledge/api/knowledgeGraph'
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
      {
        question_id: '44444444-4444-4444-8444-444444444444',
        title: 'Как читать соседей графа?',
        status: 'answered',
      },
    ],
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
  it('renders accessible guidance without duplicated graph state context when no concept is selected', () => {
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode: null,
        neighbourNodes: [],
        neighbourEdges: [],
      },
    })

    expect(wrapper.get('[data-testid="knowledge-graph-selection-empty"]').text()).toContain('Выберите концепт')
    expect(wrapper.find('[data-testid="knowledge-graph-state-context"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Контекст состояния графа')
  })

  it('keeps selected concept details compact and opens related questions in a modal with navigation', async () => {
    const selectedNode = buildNode()
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode,
        neighbourNodes: [],
        neighbourEdges: [],
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
    expect(wrapper.find('a[href="/questions/22222222-2222-4222-8222-222222222222"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="knowledge-graph-state-context"]').exists()).toBe(false)

    await wrapper.get('[data-testid="knowledge-related-questions-open"]').trigger('click')

    const modal = wrapper.get('[data-testid="knowledge-related-questions-modal"]')
    expect(modal.attributes('role')).toBe('presentation')
    expect(modal.text()).toContain('1 из 2')
    expect(modal.get('a[href="/questions/22222222-2222-4222-8222-222222222222"]').text()).toBe('Как объяснить связи графа?')

    await wrapper.get('[data-testid="knowledge-related-questions-next"]').trigger('click')

    expect(wrapper.get('[data-testid="knowledge-related-questions-modal"]').text()).toContain('2 из 2')
    expect(wrapper.get('a[href="/questions/44444444-4444-4444-8444-444444444444"]').text()).toBe('Как читать соседей графа?')

    await wrapper.get('[data-testid="knowledge-related-questions-close"]').trigger('click')

    expect(wrapper.find('[data-testid="knowledge-related-questions-modal"]').exists()).toBe(false)
  })

  it('renders compact selectable neighbours and reveals shared questions only for the selected neighbour', async () => {
    const selectedNode = buildNode()
    const neighbourNode = buildNode({
      concept_id: 11,
      slug: 'vue',
      name: 'Vue',
      total_weight: '1.2500',
      related_questions: [],
    })
    const quietNeighbour = buildNode({
      concept_id: 12,
      slug: 'python',
      name: 'Python',
      total_weight: '0.5000',
      related_questions: [],
    })
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode,
        neighbourNodes: [neighbourNode, quietNeighbour],
        neighbourEdges: [
          buildEdge(),
          buildEdge({
            id: '10-12',
            source_concept_id: 10,
            target_concept_id: 12,
            weight: '0.5000',
            shared_question_count: 0,
            related_questions: [],
          }),
        ],
      },
    })

    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('Vue')
    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('Python')
    expect(wrapper.get('[data-testid="knowledge-selected-edge-explanation"]').text()).toContain('Нажмите соседний концепт')
    expect(wrapper.find('a[href="/questions/33333333-3333-4333-8333-333333333333"]').exists()).toBe(false)

    await wrapper.get('[data-testid="knowledge-neighbour-option-11"]').trigger('click')

    expect(wrapper.get('[data-testid="knowledge-neighbour-option-11"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="knowledge-selected-edge-explanation"]').text()).toContain('Django ↔ Vue')
    expect(wrapper.get('[data-testid="knowledge-selected-edge-explanation"]').text()).toContain('2 общих вопросов')
    expect(wrapper.get('a[href="/questions/33333333-3333-4333-8333-333333333333"]').text()).toBe('Почему Django связан с Vue?')

    await wrapper.get('[data-testid="knowledge-neighbour-option-12"]').trigger('click')

    expect(wrapper.get('[data-testid="knowledge-selected-edge-explanation"]').text()).toContain('Django ↔ Python')
    expect(wrapper.get('[data-testid="knowledge-selected-edge-explanation"]').text()).toContain('пока нет вопросов')
  })

  it('renders safe fallback copy for isolated concepts without raw backend errors', () => {
    const wrapper = mount(KnowledgeGraphConceptDetails, {
      props: {
        selectedNode: buildNode({ activity_breakdown: [], related_questions: [] }),
        neighbourNodes: [],
        neighbourEdges: [],
      },
    })

    expect(wrapper.text()).toContain('Разбивка активности для концепта пока пустая')
    expect(wrapper.text()).toContain('0 вопросов доступны')
    expect(wrapper.get('[data-testid="knowledge-related-questions-open"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="knowledge-graph-selected-neighbours"]').text()).toContain('пока нет соседей')
    expect(wrapper.find('[data-testid="knowledge-graph-state-context"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Traceback')
  })
})
