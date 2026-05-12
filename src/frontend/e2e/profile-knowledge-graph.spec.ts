import { expect, test, type Page, type Route } from '@playwright/test'

const API_ORIGIN = 'http://127.0.0.1:8000'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const RELATED_QUESTION_ID = '22222222-2222-4222-8222-222222222222'
const SECOND_RELATED_QUESTION_ID = '33333333-3333-4333-8333-333333333333'
const ACCESS_TOKEN = 'playwright-access-token'
const REFRESH_TOKEN = 'playwright-refresh-token'

const PRIVATE_MARKERS = [
  'source_object_id',
  'idempotency_key',
  'raw_event',
  'provider exception',
  'Traceback',
  'stack trace',
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  'private@example.test',
  'question private body',
  'raw-source-id-must-not-render',
  'cache-provider-diagnostic',
  'embedding',
  'vector',
]

const FORBIDDEN_NAMED_LAYOUT_SELECTORS = [
  '[data-testid*="layout-name" i]',
  '[data-testid*="saved-layout" i]',
  '[data-testid*="select-layout" i]',
  '[data-testid*="create-layout" i]',
  '[data-testid*="delete-layout" i]',
  'input[name*="layout" i]',
  'select[name*="layout" i]',
]

const profileFixture = {
  user_id: USER_ID,
  user_name: 'Playwright Graph Owner',
  user_email: 'profile-contact-redacted',
  user_role: 'user',
  user_reputation_score: 420,
  user_avatar_url: null,
  user_bio: null,
  user_created_at: '2024-01-10T09:30:00Z',
  reputation: {
    score: 420,
    level: 'expert',
    level_label: 'Эксперт',
    level_minimum_score: 250,
    next_level: 'master',
    next_level_label: 'Мастер',
    next_level_minimum_score: 750,
    points_to_next_level: 330,
  },
  reputation_ledger: [],
}

const sharedQuestion = {
  question_id: RELATED_QUESTION_ID,
  title: 'Как обновлять кэш Vue Query после мутации?',
  status: 'published',
}

const piniaQuestion = {
  question_id: SECOND_RELATED_QUESTION_ID,
  title: 'Как хранить серверное состояние рядом с Pinia?',
  status: 'published',
}

const vueQueryConcept = {
  concept_id: 7,
  slug: 'vue-query',
  name: 'Vue Query',
  source: 'aggregate',
  provider: 'fake-ml',
  confidence: '0.91',
  total_weight: '42.50',
  source_count: 5,
  activity_breakdown: [
    { activity_type: 'authored_question', total_weight: '12.50', source_count: 2 },
    { activity_type: 'accepted_answer', total_weight: '30.00', source_count: 3 },
  ],
  related_questions: [sharedQuestion],
}

const piniaConcept = {
  concept_id: 8,
  slug: 'pinia',
  name: 'Pinia',
  source: 'aggregate',
  provider: 'fake-ml',
  confidence: '0.84',
  total_weight: '18.00',
  source_count: 2,
  activity_breakdown: [
    { activity_type: 'authored_answer', total_weight: '18.00', source_count: 2 },
  ],
  related_questions: [sharedQuestion, piniaQuestion],
}

const staleGraphFixture = {
  user_id: USER_ID,
  viewer: { is_owner: true },
  state: {
    status: 'stale',
    stale_reason: 'activity_changed',
    last_error_message: '',
    last_failed_phase: '',
    last_rebuild_started_at: null,
    last_rebuild_finished_at: '2024-06-10T12:00:00Z',
  },
  total_weight: '60.50',
  activity_breakdown: [
    { activity_type: 'authored_question', total_weight: '12.50', source_count: 2 },
    { activity_type: 'accepted_answer', total_weight: '30.00', source_count: 3 },
    { activity_type: 'authored_answer', total_weight: '18.00', source_count: 2 },
  ],
  concepts: [vueQueryConcept, piniaConcept],
  nodes: [vueQueryConcept, piniaConcept],
  edges: [
    {
      id: 'vue-query-pinia-shared-question',
      source_concept_id: vueQueryConcept.concept_id,
      target_concept_id: piniaConcept.concept_id,
      weight: '3.25',
      shared_question_count: 1,
      reason: 'shared_question',
      related_questions: [sharedQuestion],
    },
  ],
  layout: {
    schema_version: 1,
    positions: {},
    updated_at: null,
  },
}

const publicGraphFixture = (() => {
  const { layout: _layout, ...graphWithoutLayout } = staleGraphFixture

  return {
    ...graphWithoutLayout,
    viewer: { is_owner: false },
    state: {
      status: 'failed',
      stale_reason: '',
      last_error_message: 'provider exception private@example.test source_object_id=abc Traceback token=secret',
      last_failed_phase: 'question_authoring',
      last_rebuild_started_at: '2024-06-10T12:05:00Z',
      last_rebuild_finished_at: null,
    },
  }
})()

const rebuildFixture = {
  user_id: USER_ID,
  processed_questions: 3,
  processed_activity_sources: 7,
  structural_summary: { concepts: 2, edges: 1 },
  activity_summary: { sources: 7 },
  state: {
    status: 'rebuilding',
    stale_reason: '',
    last_error_message: '',
    last_failed_phase: '',
    last_rebuild_started_at: '2024-06-10T12:05:00Z',
    last_rebuild_finished_at: null,
  },
}

const ownerInsightsFixture = {
  user_id: USER_ID,
  viewer: { is_owner: true },
  state: {
    status: 'fresh',
    stale_reason: '',
    last_failed_phase: '',
    last_rebuild_started_at: null,
    last_rebuild_finished_at: '2024-06-10T12:10:00Z',
  },
  summary: { concept_count: 2, recommendation_count: 1, states: { weak: 1, strong: 1 } },
  concepts: [
    {
      concept_id: vueQueryConcept.concept_id,
      slug: vueQueryConcept.slug,
      name: vueQueryConcept.name,
      total_weight: vueQueryConcept.total_weight,
      source_count: vueQueryConcept.source_count,
      related_question_count: vueQueryConcept.related_questions.length,
      semantic_state: 'weak',
      tone_token: 'weak',
      recommendations: [
        {
          id: 'rec-vue-query-private-redaction',
          priority: 'high',
          label: 'Найдите вопросы по безопасной фильтрации кэша',
          reason_code: 'concept_needs_practice',
          action: {
            type: 'answer_question',
            payload: {
              tag: ['vue-query', 'pinia', 'vue-query'],
              search: 'cache invalidation',
              source_object_id: 'raw-source-id-must-not-render',
              email: 'private@example.test',
              token: ACCESS_TOKEN,
              traceback: 'Traceback provider exception stack trace',
              vector: [0.1, 0.2],
              embedding: [0.3, 0.4],
              question_body: 'question private body',
            },
          },
        },
      ],
    },
    {
      concept_id: piniaConcept.concept_id,
      slug: piniaConcept.slug,
      name: piniaConcept.name,
      total_weight: piniaConcept.total_weight,
      source_count: piniaConcept.source_count,
      related_question_count: piniaConcept.related_questions.length,
      semantic_state: 'strong',
      tone_token: 'strong',
      recommendations: [],
    },
  ],
}


const largeSemanticStates = ['strong', 'growing', 'weak', 'stale', 'isolated', 'unknown'] as const

const largeConceptNames = [
  'GraphQL Pagination Needle',
  'Vue Query Cache',
  'Pinia Stores',
  'Django ORM',
  'PostgreSQL Indexes',
  'Playwright Routes',
  'TypeScript Narrowing',
  'Vite Build Pipeline',
  'Accessibility Landmarks',
  'REST Error Handling',
  'JWT Refresh Flow',
  'WebSocket Backpressure',
  'Search Ranking',
  'Tag Autocomplete',
  'Moderation Queue',
  'Reputation Thresholds',
  'Question Drafts',
  'Answer Review',
  'Notification Digest',
  'Profile Privacy',
  'Knowledge Layout',
  'Semantic State Legend',
  'Recommendation Safety',
  'Question Discovery',
  'Large Graph Filtering',
  'Edge Explanation',
  'Related Question Modal',
  'Layout Persistence',
  'Owner Rebuild',
  'Public Aggregate View',
  'Safe Diagnostics',
  'Smoke Harness',
]

function largeQuestionId(index: number) {
  const hex = index.toString(16).padStart(3, '0')
  const tail = index.toString(16).padStart(4, '0')

  return `44444444-4444-4${hex}-8${hex}-44444444${tail}`
}

function slugifyLargeConcept(name: string) {
  return name.toLowerCase().replaceAll(' ', '-').replaceAll(/[^a-z0-9-]/g, '')
}

function buildLargeQuestion(index: number, conceptName: string, status = 'published') {
  return {
    question_id: largeQuestionId(index),
    title: `Как применить ${conceptName} в большом графе знаний?`,
    status,
  }
}

function buildLargeGraphFixture({ isOwner = true, includePrivateDiagnostics = false } = {}) {
  const concepts = largeConceptNames.map((name, index) => {
    const conceptId = 100 + index
    const primaryQuestion = buildLargeQuestion(index + 1, name)
    const related_questions = index % 4 === 0
      ? [primaryQuestion, buildLargeQuestion(index + 101, `${name} соседний сценарий`, 'open')]
      : [primaryQuestion]

    return {
      concept_id: conceptId,
      slug: slugifyLargeConcept(name),
      name,
      source: 'aggregate',
      provider: 'large-smoke-fixture',
      confidence: (0.55 + (index % 9) * 0.04).toFixed(2),
      total_weight: (96 - index * 1.75).toFixed(2),
      source_count: 3 + (index % 7),
      activity_breakdown: [
        {
          activity_type: index % 2 === 0 ? 'authored_answer' : 'authored_question',
          total_weight: (12 + (index % 5) * 2.5).toFixed(2),
          source_count: 1 + (index % 4),
        },
        {
          activity_type: index % 3 === 0 ? 'accepted_answer' : 'question_upvote',
          total_weight: (4 + (index % 6) * 1.25).toFixed(2),
          source_count: 1 + (index % 3),
        },
      ],
      related_questions,
    }
  })

  const edges = concepts.slice(0, -1).map((concept, index) => {
    const target = concepts[index + 1]

    return {
      id: `large-edge-${concept.concept_id}-${target.concept_id}`,
      source_concept_id: concept.concept_id,
      target_concept_id: target.concept_id,
      weight: (2.5 + (index % 6) * 0.5).toFixed(2),
      shared_question_count: 1 + (index % 2),
      reason: 'shared_question' as const,
      related_questions: [concept.related_questions[0]],
    }
  })

  return {
    user_id: USER_ID,
    viewer: { is_owner: isOwner },
    state: {
      status: includePrivateDiagnostics ? 'failed' : 'fresh',
      stale_reason: includePrivateDiagnostics ? 'cache-provider-diagnostic source_object_id' : '',
      last_error_message: includePrivateDiagnostics
        ? 'provider exception private@example.test source_object_id=large-private Traceback stack trace embedding vector token=secret'
        : '',
      last_failed_phase: includePrivateDiagnostics ? 'private_owner_insight_rebuild' : '',
      last_rebuild_started_at: includePrivateDiagnostics ? '2024-06-10T12:05:00Z' : null,
      last_rebuild_finished_at: includePrivateDiagnostics ? null : '2024-06-10T12:30:00Z',
    },
    total_weight: concepts.reduce((sum, concept) => sum + Number.parseFloat(concept.total_weight), 0).toFixed(2),
    activity_breakdown: [
      { activity_type: 'authored_answer', total_weight: '412.50', source_count: 64 },
      { activity_type: 'authored_question', total_weight: '216.25', source_count: 38 },
      { activity_type: 'accepted_answer', total_weight: '188.75', source_count: 21 },
      { activity_type: 'question_upvote', total_weight: '97.50', source_count: 44 },
    ],
    concepts,
    nodes: concepts.map((concept) => ({ ...concept })),
    edges,
    layout: isOwner
      ? {
          schema_version: 1 as const,
          positions: Object.fromEntries(concepts.map((concept, index) => [
            String(concept.concept_id),
            { x: 120 + (index % 8) * 140, y: 120 + Math.floor(index / 8) * 120 },
          ])),
          updated_at: '2024-06-10T12:30:00Z',
        }
      : undefined,
  }
}

function buildLargeInsightsFixture() {
  const graph = buildLargeGraphFixture()
  const concepts = graph.concepts.map((concept, index) => {
    const semantic_state = largeSemanticStates[index % largeSemanticStates.length]

    return {
      concept_id: concept.concept_id,
      slug: concept.slug,
      name: concept.name,
      total_weight: concept.total_weight,
      source_count: concept.source_count,
      related_question_count: concept.related_questions.length,
      semantic_state,
      tone_token: semantic_state,
      recommendations: index === 0
        ? [
            {
              id: 'rec-large-private-redaction',
              priority: 'high',
              label: 'Найдите публичные вопросы по GraphQL pagination без приватных диагностик',
              reason_code: 'concept_needs_practice',
              action: {
                type: 'answer_question' as const,
                payload: {
                  tag: ['graphql-pagination-needle', 'playwright-routes', 'graphql-pagination-needle'],
                  search: 'cursor pagination duplicate tags',
                  query: 'private fallback query must not override search',
                  page: '1',
                  order: '-question_created_at',
                  source_object_id: 'raw-source-id-must-not-render',
                  idempotency_key: 'idempotency_key',
                  raw_event: 'raw_event',
                  email: 'private@example.test',
                  token: ACCESS_TOKEN,
                  traceback: 'Traceback provider exception stack trace',
                  cache: 'cache-provider-diagnostic',
                  vector: [0.1, 0.2, 0.3],
                  embedding: [0.4, 0.5, 0.6],
                  question_body: 'question private body',
                },
              },
            },
          ]
        : [],
    }
  })
  const states = concepts.reduce<Record<string, number>>((counts, concept) => {
    counts[concept.semantic_state] = (counts[concept.semantic_state] ?? 0) + 1
    return counts
  }, {})

  return {
    user_id: USER_ID,
    viewer: { is_owner: true },
    state: {
      status: 'fresh',
      stale_reason: '',
      last_failed_phase: '',
      last_rebuild_started_at: null,
      last_rebuild_finished_at: '2024-06-10T12:30:00Z',
    },
    summary: { concept_count: concepts.length, recommendation_count: 1, states },
    concepts,
  }
}

const largeOwnerGraphFixture = buildLargeGraphFixture()
const largeOwnerInsightsFixture = buildLargeInsightsFixture()
const largePublicGraphFixture = buildLargeGraphFixture({ isOwner: false, includePrivateDiagnostics: true })

const discoveryQuestionListFixture = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      question_id: RELATED_QUESTION_ID,
      user: USER_ID,
      user_name: 'Playwright Graph Owner',
      question_title: 'Как обновлять кэш Vue Query после мутации?',
      question_status: 'open',
      question_created_at: '2024-06-09T10:00:00Z',
      question_updated_at: '2024-06-09T10:00:00Z',
      tags: [{ name: 'vue-query', questions_count: 1 }],
    },
  ],
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(
    ({ accessToken, refreshToken }) => {
      window.localStorage.setItem('so2.accessToken', accessToken)
      window.localStorage.setItem('so2.refreshToken', refreshToken)
    },
    { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN },
  )
}

async function routeCommonApi(page: Page) {
  await page.route(`${API_ORIGIN}/user/profile/`, async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    await json(route, 200, profileFixture)
  })

  await page.route(`${API_ORIGIN}/notifications/summary/`, async (route) => {
    await json(route, 200, { unread_count: 0, latest: [] })
  })
}

async function routeQuestionDiscoveryApi(page: Page) {
  const requestedUrls: string[] = []

  await page.route(new RegExp(`^${API_ORIGIN.replaceAll('.', '\\.')}\\/question\\/(?:\\?.*)?$`), async (route) => {
    requestedUrls.push(route.request().url())
    await json(route, 200, discoveryQuestionListFixture)
  })

  return requestedUrls
}

function expectNoUnsafeDiscoveryParams(url: URL) {
  const serializedUrl = url.toString()

  for (const marker of PRIVATE_MARKERS) {
    expect(serializedUrl).not.toContain(marker)
  }

  for (const key of url.searchParams.keys()) {
    expect(['page', 'search', 'ordering', 'tag']).toContain(key)
  }
}

async function expectNoNamedLayoutControls(page: Page) {
  for (const selector of FORBIDDEN_NAMED_LAYOUT_SELECTORS) {
    await expect(page.locator(selector)).toHaveCount(0)
  }
}

async function expectNoPrivateMarkers(page: Page) {
  const bodyText = await page.locator('body').innerText()

  for (const marker of PRIVATE_MARKERS) {
    expect(bodyText).not.toContain(marker)
  }
}

test.describe('profile knowledge graph smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedSession(page)
    await routeCommonApi(page)
  })

  test('renders stale owner graph, selects nodes, preserves fallback mode, and posts owner rebuild', async ({ page }) => {
    let graphRequests = 0
    let rebuildRequests = 0

    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      graphRequests += 1
      await json(route, 200, staleGraphFixture)
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/rebuild/`, async (route) => {
      expect(route.request().method()).toBe('POST')
      expect(route.request().url()).toBe(`${API_ORIGIN}/knowledge-graph/me/rebuild/`)
      expect(route.request().postData()).toBeNull()
      rebuildRequests += 1
      await json(route, 200, rebuildFixture)
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/layout/`, async (route) => {
      throw new Error(`Layout endpoint should stay untouched before node drag: ${route.request().method()}`)
    })

    await page.goto('/profile?tab=knowledge')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('profile-tab-knowledge')).toHaveClass(/profile-page__tab--active/)
    await expect(page.getByTestId('knowledge-graph-tab')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Карта ваших сильных тем' })).toBeVisible()
    await expect(page.getByTestId('knowledge-total-weight')).toHaveText('60,5')
    await expect(page.getByText('2 концептов · 7 сигналов')).toBeVisible()
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Граф устарел')
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Перестройте граф')

    await expect(page.getByTestId('knowledge-view-mode-graph')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('knowledge-view-mode-list')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('knowledge-view-mode-help')).toContainText('Граф показывает связи между концептами')
    await expect(page.getByTestId('knowledge-graph-renderer-summary')).toHaveText('2 концептов · 1 связей')
    await expect(page.getByTestId('knowledge-graph-canvas')).toBeVisible()
    await expect(page.getByTestId('knowledge-graph-layout-save-control')).toBeDisabled()
    await expect(page.getByTestId('knowledge-graph-layout-reset-control')).toBeDisabled()
    await expectNoNamedLayoutControls(page)
    await expect(page.getByTestId('knowledge-graph-selection-empty')).toContainText('Выберите концепт')

    await page.getByTestId('knowledge-graph-concept-option-7').click()

    await expect(page.getByTestId('knowledge-graph-concept-option-7')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('knowledge-graph-selected-details')).toContainText('Vue Query')
    await expect(page.getByTestId('knowledge-graph-selected-details')).toContainText('Принятые ответы')

    await page.getByTestId('knowledge-graph-fullscreen-control').click()
    await expect(page.getByTestId('knowledge-graph-fullscreen-modal')).toContainText('Топология концептов на весь экран')
    await expect(page.getByTestId('knowledge-graph-modal-layout-save-control')).toBeDisabled()
    await expect(page.getByTestId('knowledge-graph-modal-layout-reset-control')).toBeDisabled()
    await expectNoNamedLayoutControls(page)
    await expect(page.getByTestId('knowledge-graph-fullscreen-modal')).not.toContainText('Перейти к концепту')
    await expect(page.getByTestId('knowledge-graph-fullscreen-selection')).toHaveCount(0)
    await page.getByTestId('knowledge-graph-fullscreen-close').click()
    await expect(page.getByTestId('knowledge-graph-fullscreen-modal')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-graph-selected-details')).toBeVisible()

    await expect(page.getByTestId('knowledge-graph-selected-neighbours')).toContainText('Pinia')
    await expect(page.getByText('Почему эти концепты рядом')).toBeVisible()
    await expect(page.getByTestId('knowledge-selected-edge-explanation')).toContainText('Нажмите соседний концепт')

    await page.getByTestId('knowledge-neighbour-option-8').click()
    await expect(page.getByTestId('knowledge-selected-edge-explanation')).toContainText('1 общих вопросов · вес 3,25')
    await expect(page.getByRole('link', { name: sharedQuestion.title }).first()).toHaveAttribute(
      'href',
      `/questions/${RELATED_QUESTION_ID}`,
    )

    await page.getByTestId('knowledge-related-questions-open').click()
    await expect(page.getByTestId('knowledge-related-questions-modal')).toContainText(sharedQuestion.title)
    await page.getByTestId('knowledge-related-questions-close').click()
    await expect(page.getByTestId('knowledge-related-questions-modal')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('activity_changed')

    await page.getByTestId('knowledge-view-mode-list').click()
    await expect(page.getByTestId('knowledge-view-mode-graph')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('knowledge-view-mode-list')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('knowledge-list-panel')).toBeVisible()
    await expect(page.getByTestId('knowledge-activity-breakdown')).toContainText('Вопросы')
    await expect(page.getByTestId('knowledge-activity-breakdown')).toContainText('Принятые ответы')
    await expect(page.getByTestId('knowledge-activity-breakdown')).toContainText('Ответы')
    await expect(page.getByTestId('knowledge-concepts')).toContainText('Vue Query')
    await expect(page.getByTestId('knowledge-concepts')).toContainText('Pinia')
    await expect(page.getByRole('link', { name: piniaQuestion.title })).toHaveAttribute(
      'href',
      `/questions/${SECOND_RELATED_QUESTION_ID}`,
    )
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Граф устарел')

    await page.getByTestId('knowledge-view-mode-graph').click()
    await expect(page.getByTestId('knowledge-view-mode-graph')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('knowledge-graph-concept-option-7')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('knowledge-graph-selected-details')).toContainText('Vue Query')

    await page.getByTestId('knowledge-rebuild-button').click()
    await expect.poll(() => rebuildRequests).toBe(1)
    expect(graphRequests).toBeGreaterThanOrEqual(1)
    await expectNoPrivateMarkers(page)
  })

  test('navigates owner recommendation and concept discovery actions into question discovery with safe query params', async ({ page }) => {
    const questionRequestUrls = await routeQuestionDiscoveryApi(page)
    let insightsRequests = 0

    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      await json(route, 200, staleGraphFixture)
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/insights/`, async (route) => {
      insightsRequests += 1
      await json(route, 200, ownerInsightsFixture)
    })

    await page.goto('/profile?tab=knowledge')

    await expect(page.getByTestId('knowledge-recommendation-action-rec-vue-query-private-redaction')).toBeVisible()
    await expectNoPrivateMarkers(page)

    await page.getByTestId('knowledge-recommendation-action-rec-vue-query-private-redaction').click()
    await expect(page).toHaveURL(/\/?/)

    const recommendationUrl = new URL(page.url())
    expect(recommendationUrl.pathname).toBe('/')
    expect(recommendationUrl.searchParams.getAll('tag')).toEqual(['vue-query', 'pinia'])
    expect(recommendationUrl.searchParams.get('search')).toBe('cache invalidation')
    expect(recommendationUrl.searchParams.has('ordering')).toBe(false)
    expect(recommendationUrl.searchParams.has('page')).toBe(false)
    expectNoUnsafeDiscoveryParams(recommendationUrl)

    await expect.poll(() => questionRequestUrls.length).toBeGreaterThan(0)
    const recommendationRequestUrl = new URL(questionRequestUrls.at(-1) ?? '')
    expect(recommendationRequestUrl.pathname).toBe('/question/')
    expect(recommendationRequestUrl.searchParams.getAll('tag')).toEqual(['vue-query', 'pinia'])
    expect(recommendationRequestUrl.searchParams.get('search')).toBe('cache invalidation')
    expect(recommendationRequestUrl.searchParams.get('ordering')).toBe('-question_created_at')
    expect(recommendationRequestUrl.searchParams.get('page')).toBe('1')
    expectNoUnsafeDiscoveryParams(recommendationRequestUrl)
    await expectNoPrivateMarkers(page)

    await page.goto('/profile?tab=knowledge')
    await expect(page.getByTestId('knowledge-graph-tab')).toBeVisible()
    await page.getByTestId('knowledge-graph-concept-option-7').click()
    await expect(page.getByTestId('knowledge-selected-concept-discovery')).toBeVisible()
    await page.getByTestId('knowledge-neighbour-option-8').click()
    await expect(page.getByRole('link', { name: sharedQuestion.title }).first()).toHaveAttribute(
      'href',
      `/questions/${RELATED_QUESTION_ID}`,
    )

    const requestCountBeforeConceptNavigation = questionRequestUrls.length
    await page.getByTestId('knowledge-selected-concept-discovery').click()

    const conceptUrl = new URL(page.url())
    expect(conceptUrl.pathname).toBe('/')
    expect(conceptUrl.searchParams.getAll('tag')).toEqual(['vue-query'])
    expect(conceptUrl.searchParams.has('search')).toBe(false)
    expectNoUnsafeDiscoveryParams(conceptUrl)

    await expect.poll(() => questionRequestUrls.length).toBeGreaterThan(requestCountBeforeConceptNavigation)
    const conceptRequestUrl = new URL(questionRequestUrls.at(-1) ?? '')
    expect(conceptRequestUrl.pathname).toBe('/question/')
    expect(conceptRequestUrl.searchParams.getAll('tag')).toEqual(['vue-query'])
    expect(conceptRequestUrl.searchParams.get('ordering')).toBe('-question_created_at')
    expect(conceptRequestUrl.searchParams.get('page')).toBe('1')
    expectNoUnsafeDiscoveryParams(conceptRequestUrl)
    expect(insightsRequests).toBeGreaterThanOrEqual(1)
    await expectNoPrivateMarkers(page)
  })

  test('keeps public/read-only copy and hides rebuild controls across graph and list modes', async ({ page }) => {
    let graphRequests = 0
    let rebuildRequests = 0
    let insightsRequests = 0

    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      graphRequests += 1
      await json(route, 200, publicGraphFixture)
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/rebuild/`, async (route) => {
      rebuildRequests += 1
      await json(route, 403, { detail: 'owner only provider exception source_object_id' })
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/insights/`, async (route) => {
      insightsRequests += 1
      await json(route, 403, { detail: 'owner only provider exception source_object_id token=secret' })
    })

    await page.goto('/profile?tab=knowledge')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('knowledge-public-readonly')).toContainText('Публичный просмотр')
    await expect(page.getByTestId('knowledge-public-readonly')).toContainText('только владельцу')
    await expect(page.getByTestId('knowledge-rebuild-button')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Сбой перестроения')
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Технические детали скрыты')
    await expect(page.getByTestId('knowledge-graph-renderer-summary')).toHaveText('2 концептов · 1 связей')
    await expect(page.getByTestId('knowledge-graph-layout-save-control')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-graph-layout-reset-control')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-recommendations')).toHaveCount(0)
    await expect(page.locator('[data-testid^="knowledge-recommendation-action-"]')).toHaveCount(0)

    await page.getByTestId('knowledge-graph-concept-option-8').click()
    await expect(page.getByTestId('knowledge-graph-selected-details')).toContainText('Pinia')
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('question_authoring')
    await expect(page.getByTestId('knowledge-graph-state-context')).toHaveCount(0)

    await page.getByTestId('knowledge-view-mode-list').click()
    await expect(page.getByTestId('knowledge-list-panel')).toBeVisible()
    await expect(page.getByTestId('knowledge-public-readonly')).toContainText('только владельцу')
    await expect(page.getByTestId('knowledge-rebuild-button')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Сбой перестроения')

    await page.getByTestId('knowledge-view-mode-graph').click()
    await expect(page.getByTestId('knowledge-public-readonly')).toContainText('только владельцу')
    await expect(page.getByTestId('knowledge-rebuild-button')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-graph-concept-option-8')).toHaveAttribute('aria-pressed', 'true')

    expect(graphRequests).toBe(1)
    expect(rebuildRequests).toBe(0)
    expect(insightsRequests).toBe(0)
    await expectNoPrivateMarkers(page)
  })

  test('keeps the profile shell visible and shows safe graph load errors', async ({ page }) => {
    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      await json(route, 500, {
        detail: 'provider exception private@example.test source_object_id=abc Traceback token=secret',
      })
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/rebuild/`, async (route) => {
      throw new Error(`Unexpected rebuild call to ${route.request().url()}`)
    })

    await page.goto('/profile?tab=knowledge')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('profile-tab-knowledge')).toHaveClass(/profile-page__tab--active/)
    await expect(page.getByTestId('knowledge-graph-tab')).toBeVisible()
    await expect(page.getByTestId('knowledge-graph-error')).toContainText('Не удалось загрузить граф знаний')
    await expect(page.getByTestId('knowledge-graph-error')).toContainText(
      'Не удалось загрузить граф знаний. Попробуйте обновить вкладку.',
    )
    await expectNoPrivateMarkers(page)
  })

  test('rejects malformed graph DTOs without leaking parser details into the UI', async ({ page }) => {
    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      await json(route, 200, {
        user_id: USER_ID,
        viewer: { is_owner: true },
        state: staleGraphFixture.state,
        total_weight: '42.50',
        activity_breakdown: 'not-an-array',
        concepts: [],
        nodes: [],
        edges: [],
        source_object_id: 'raw-source-id-must-not-render',
      })
    })

    await page.goto('/profile?tab=knowledge')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('knowledge-graph-tab')).toBeVisible()
    await expect(page.getByTestId('knowledge-graph-error')).toContainText(
      'Не удалось загрузить граф знаний. Попробуйте обновить вкладку.',
    )
    await expect(page.locator('body')).not.toContainText('Malformed knowledge graph response')
    await expect(page.locator('body')).not.toContainText('raw-source-id-must-not-render')
    await expectNoPrivateMarkers(page)
  })

  test('shows safe rebuild failure copy while staying on the owner mutation path', async ({ page }) => {
    let rebuildRequests = 0

    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      await json(route, 200, staleGraphFixture)
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/rebuild/`, async (route) => {
      expect(route.request().method()).toBe('POST')
      rebuildRequests += 1
      await json(route, 500, {
        error: {
          code: 'provider_failed',
          message: 'provider exception private@example.test source_object_id=abc Traceback token=secret',
        },
        state: staleGraphFixture.state,
      })
    })

    await page.goto('/profile?tab=knowledge')
    await page.getByTestId('knowledge-rebuild-button').click()

    await expect.poll(() => rebuildRequests).toBe(1)
    await expect(page.getByTestId('knowledge-rebuild-error')).toContainText(
      'Не удалось запустить перестроение графа. Попробуйте ещё раз позже.',
    )
    await expect(page.getByTestId('knowledge-graph-tab')).toBeVisible()
    await expect(page.getByTestId('knowledge-graph-renderer-summary')).toHaveText('2 концептов · 1 связей')
    await page.getByTestId('knowledge-view-mode-list').click()
    await expect(page.getByTestId('knowledge-list-panel')).toBeVisible()
    await expectNoPrivateMarkers(page)
  })
})
