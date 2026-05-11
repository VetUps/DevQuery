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
}

const publicGraphFixture = {
  ...staleGraphFixture,
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
    await expect(page.getByTestId('knowledge-graph-selection-empty')).toContainText('Выберите концепт')

    await page.getByTestId('knowledge-graph-concept-option-7').click()

    await expect(page.getByTestId('knowledge-graph-concept-option-7')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('knowledge-graph-selected-details')).toContainText('Vue Query')
    await expect(page.getByTestId('knowledge-graph-selected-details')).toContainText('Принятые ответы')

    await page.getByTestId('knowledge-graph-fullscreen-control').click()
    await expect(page.getByTestId('knowledge-graph-fullscreen-modal')).toContainText('Топология концептов на весь экран')
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

  test('keeps public/read-only copy and hides rebuild controls across graph and list modes', async ({ page }) => {
    let graphRequests = 0
    let rebuildRequests = 0

    await page.route(`${API_ORIGIN}/knowledge-graph/me/`, async (route) => {
      graphRequests += 1
      await json(route, 200, publicGraphFixture)
    })

    await page.route(`${API_ORIGIN}/knowledge-graph/me/rebuild/`, async (route) => {
      rebuildRequests += 1
      await json(route, 403, { detail: 'owner only provider exception source_object_id' })
    })

    await page.goto('/profile?tab=knowledge')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('knowledge-public-readonly')).toContainText('Публичный просмотр')
    await expect(page.getByTestId('knowledge-public-readonly')).toContainText('только владельцу')
    await expect(page.getByTestId('knowledge-rebuild-button')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Сбой перестроения')
    await expect(page.getByTestId('knowledge-state-banner')).toContainText('Технические детали скрыты')
    await expect(page.getByTestId('knowledge-graph-renderer-summary')).toHaveText('2 концептов · 1 связей')

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
