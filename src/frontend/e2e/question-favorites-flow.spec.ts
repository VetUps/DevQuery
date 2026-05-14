import { expect, test, type Page, type Route } from '@playwright/test'

const API_ORIGIN = 'http://127.0.0.1:8000'
const OWNER_USER_ID = '11111111-1111-4111-8111-111111111111'
const QUESTION_ID = '22222222-2222-4222-8222-222222222222'
const ACCESS_TOKEN = 'playwright-access-token'
const REFRESH_TOKEN = 'playwright-refresh-token'

const QUESTION_TITLE = 'Как проверить избранное вопроса через Playwright?'
const QUESTION_BODY = 'Публичное описание вопроса для smoke-проверки избранного.'

const profileFixture = {
  user_id: OWNER_USER_ID,
  user_name: 'Playwright Favorites Owner',
  user_email: 'owner-redacted@example.test',
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

const publicProfileFixture = {
  user_id: OWNER_USER_ID,
  user_name: 'Playwright Favorites Owner',
  user_reputation_score: 420,
  user_avatar_url: null,
  user_bio: null,
  user_created_at: '2024-01-10T09:30:00Z',
  reputation: profileFixture.reputation,
}

type FavoriteRequestCounts = {
  feed: number
  favoritesList: number
  detail: number
  add: number
  remove: number
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

function expectBearer(route: Route) {
  expect(route.request().headers().authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
}

function buildQuestion(favoriteState: { isFavorited: boolean; favoritesCount: number }) {
  return {
    question_id: QUESTION_ID,
    user: OWNER_USER_ID,
    user_name: 'Playwright Favorites Owner',
    user_reputation_score: 420,
    reputation: profileFixture.reputation,
    question_title: QUESTION_TITLE,
    question_status: 'open',
    question_created_at: '2024-06-09T10:00:00Z',
    question_updated_at: '2024-06-09T10:00:00Z',
    favorites_count: favoriteState.favoritesCount,
    is_favorited: favoriteState.isFavorited,
    tags: [{ name: 'playwright', questions_count: 1 }],
  }
}

function buildQuestionDetail(favoriteState: { isFavorited: boolean; favoritesCount: number }) {
  return {
    ...buildQuestion(favoriteState),
    question_body: QUESTION_BODY,
    upvotes: 3,
    downvotes: 0,
    score: 3,
    user_vote: null,
  }
}

function buildQuestionPage(results: unknown[], count = results.length) {
  return {
    count,
    next: null,
    previous: null,
    results,
  }
}

async function routeCommonApi(page: Page) {
  await page.route(`${API_ORIGIN}/user/profile/`, async (route) => {
    expectBearer(route)
    await json(route, 200, profileFixture)
  })

  await page.route(`${API_ORIGIN}/user/${OWNER_USER_ID}/public-profile/`, async (route) => {
    await json(route, 200, publicProfileFixture)
  })

  await page.route(`${API_ORIGIN}/notifications/summary/`, async (route) => {
    await json(route, 200, { unread_count: 0, latest: [] })
  })

  await page.route(new RegExp(`^${API_ORIGIN.replaceAll('.', '\\.')}\/notifications\/(?:\\?.*)?$`), async (route) => {
    await json(route, 200, { count: 0, next: null, previous: null, results: [] })
  })

  await page.route(new RegExp(`^${API_ORIGIN.replaceAll('.', '\\.')}\/solution\/(?:\\?.*)?$`), async (route) => {
    await json(route, 200, { count: 0, next: null, previous: null, results: [] })
  })

  await page.route(new RegExp(`^${API_ORIGIN.replaceAll('.', '\\.')}\/comment\/(?:\\?.*)?$`), async (route) => {
    await json(route, 200, { count: 0, next: null, previous: null, results: [] })
  })
}

async function routeFavoriteJourneyApi(page: Page, favoriteState: { isFavorited: boolean; favoritesCount: number }) {
  const counts: FavoriteRequestCounts = {
    feed: 0,
    favoritesList: 0,
    detail: 0,
    add: 0,
    remove: 0,
  }

  await page.route(`${API_ORIGIN}/question/${QUESTION_ID}/favorite/`, async (route) => {
    expectBearer(route)
    const method = route.request().method()

    if (method === 'POST') {
      counts.add += 1
      favoriteState.isFavorited = true
      favoriteState.favoritesCount = 8
      await json(route, 200, {
        question_id: QUESTION_ID,
        is_favorited: true,
        favorites_count: favoriteState.favoritesCount,
      })
      return
    }

    if (method === 'DELETE') {
      counts.remove += 1
      favoriteState.isFavorited = false
      favoriteState.favoritesCount = 7
      await json(route, 200, {
        question_id: QUESTION_ID,
        is_favorited: false,
        favorites_count: favoriteState.favoritesCount,
      })
      return
    }

    await json(route, 405, { detail: 'Method not allowed' })
  })

  await page.route(new RegExp(`^${API_ORIGIN.replaceAll('.', '\\.')}\/question\/favorites\/(?:\\?.*)?$`), async (route) => {
    expectBearer(route)
    counts.favoritesList += 1
    const results = favoriteState.isFavorited ? [buildQuestion(favoriteState)] : []
    await json(route, 200, buildQuestionPage(results))
  })

  await page.route(`${API_ORIGIN}/question/${QUESTION_ID}/`, async (route) => {
    counts.detail += 1
    await json(route, 200, buildQuestionDetail(favoriteState))
  })

  await page.route(new RegExp(`^${API_ORIGIN.replaceAll('.', '\\.')}\/question\/(?:\\?.*)?$`), async (route) => {
    counts.feed += 1
    await json(route, 200, buildQuestionPage([buildQuestion(favoriteState)]))
  })

  return counts
}

test.describe('question favorites production smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedSession(page)
    await routeCommonApi(page)
  })

  test('favorites a feed question, opens profile favorites, removes from detail, and converges empty', async ({ page }) => {
    const favoriteState = { isFavorited: false, favoritesCount: 7 }
    const requests = await routeFavoriteJourneyApi(page, favoriteState)

    await page.goto('/')

    const feedCard = page.getByTestId('question-card').filter({ hasText: QUESTION_TITLE })
    await expect(feedCard).toBeVisible()

    const feedFavoriteAction = feedCard.getByTestId('question-favorite-action')
    const feedFavoriteButton = feedCard.getByTestId('question-favorite-button')
    await expect(feedFavoriteButton).toHaveAttribute('aria-pressed', 'false')
    await expect(feedFavoriteAction).toHaveAttribute('data-favorited', 'false')
    await expect(feedCard.getByTestId('question-favorite-count')).toHaveText('7')

    await feedFavoriteButton.click()

    await expect(feedFavoriteButton).toHaveAttribute('aria-pressed', 'true')
    await expect(feedFavoriteAction).toHaveAttribute('data-favorited', 'true')
    await expect(feedCard.getByTestId('question-favorite-count')).toHaveText('8')
    expect(requests.add).toBe(1)

    await page.goto('/profile?tab=favorites')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('profile-tab-favorites')).toHaveClass(/profile-page__tab--active/)
    await expect(page.getByTestId('profile-favorites-workspace')).toBeVisible()
    await expect(page.getByTestId('profile-favorites-count')).toContainText('1 сохранённых вопросов')

    const favoriteCard = page.getByTestId('profile-favorites-list').getByTestId('question-card').filter({ hasText: QUESTION_TITLE })
    await expect(favoriteCard).toBeVisible()
    await expect(favoriteCard.getByTestId('question-favorite-button')).toHaveAttribute('aria-pressed', 'true')
    await expect(favoriteCard.getByTestId('question-favorite-action')).toHaveAttribute('data-favorited', 'true')
    await expect(favoriteCard.getByTestId('question-favorite-count')).toHaveText('8')

    const detailLink = favoriteCard.getByRole('link', { name: QUESTION_TITLE })
    await expect(detailLink).toHaveAttribute('href', `/questions/${QUESTION_ID}`)
    await detailLink.click()

    await expect(page).toHaveURL(new RegExp(`/questions/${QUESTION_ID}$`))
    await expect(page.getByRole('heading', { level: 1, name: QUESTION_TITLE })).toBeVisible()
    await expect(page.getByText(QUESTION_BODY)).toBeVisible()

    const detailFavoriteAction = page.getByTestId('question-favorite-action').filter({ has: page.getByTestId('question-favorite-button') }).first()
    const detailFavoriteButton = detailFavoriteAction.getByTestId('question-favorite-button')
    await expect(detailFavoriteButton).toHaveAttribute('aria-pressed', 'true')
    await expect(detailFavoriteAction).toHaveAttribute('data-favorited', 'true')
    await expect(detailFavoriteAction.getByTestId('question-favorite-count')).toHaveText('8')

    await detailFavoriteButton.click()

    await expect(detailFavoriteButton).toHaveAttribute('aria-pressed', 'false')
    await expect(detailFavoriteAction).toHaveAttribute('data-favorited', 'false')
    await expect(detailFavoriteAction.getByTestId('question-favorite-count')).toHaveText('7')
    expect(requests.remove).toBe(1)

    await page.goto('/profile?tab=favorites')

    await expect(page.getByTestId('profile-page')).toBeVisible()
    await expect(page.getByTestId('profile-favorites-workspace')).toBeVisible()
    await expect(page.getByTestId('profile-favorites-state-empty')).toBeVisible()
    await expect(page.getByTestId('profile-favorites-count')).toContainText('0 сохранённых вопросов')
    await expect(page.getByTestId('profile-favorites-workspace').getByText(QUESTION_TITLE)).toHaveCount(0)

    expect(requests.feed).toBeGreaterThanOrEqual(1)
    expect(requests.favoritesList).toBeGreaterThanOrEqual(2)
    expect(requests.detail).toBeGreaterThanOrEqual(1)
  })
})
