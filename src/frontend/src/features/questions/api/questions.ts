import { http } from '@/shared/api/http'
import type { ReputationSummary } from '@/features/users/api/reputation'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface QuestionTag {
  name: string
  questions_count: number
}

export interface QuestionProtectionSnapshot {
  is_protected: boolean
  protection_reason_code: string
  protected_until: string | null
  author_level: string | null
  author_points_to_next_level: number | null
  author_next_level: string | null
  author_next_level_label: string | null
  viewer_can_answer: boolean
  viewer_answer_reason_code: string | null
  viewer_answer_reason_message: string
  viewer_answer_required_level: string | null
  viewer_answer_required_level_label: string | null
  viewer_level: string | null
  viewer_level_label: string | null
  viewer_points_to_next_level: number | null
  viewer_next_level: string | null
  viewer_next_level_label: string | null
  viewer_can_downvote: boolean
  viewer_downvote_reason_code: string | null
  viewer_downvote_reason_message: string
}

function parseDateValue(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function getProtectedQuestionWindowHours(
  question: Pick<QuestionListItem, 'question_created_at' | 'protected_until'>,
) {
  const createdAt = parseDateValue(question.question_created_at)
  const protectedUntil = parseDateValue(question.protected_until)

  if (createdAt === null || protectedUntil === null || protectedUntil <= createdAt) {
    return 12
  }

  const windowHours = Math.round((protectedUntil - createdAt) / (1000 * 60 * 60))

  return windowHours > 0 ? windowHours : 12
}

export function getProtectedQuestionWindowLabel(windowHours: number) {
  const suffix = windowHours % 100 >= 11 && windowHours % 100 <= 14
    ? 'часов'
    : windowHours % 10 === 1
      ? 'час'
      : windowHours % 10 >= 2 && windowHours % 10 <= 4
        ? 'часа'
        : 'часов'

  return `${windowHours} ${suffix}`
}

export function getProtectedQuestionWindowGenitiveLabel(windowHours: number) {
  const suffix = windowHours % 10 === 1 && windowHours % 100 !== 11 ? 'часа' : 'часов'

  return `${windowHours} ${suffix}`
}

export function getProtectedQuestionAnswerWindowLabel(
  question: Pick<QuestionListItem, 'question_created_at' | 'protected_until' | 'viewer_answer_required_level_label'>,
) {
  const requiredLabel = question.viewer_answer_required_level_label ?? 'Эксперт'
  const windowLabel = getProtectedQuestionWindowLabel(getProtectedQuestionWindowHours(question))

  return `${requiredLabel}+ отвечают первые ${windowLabel}`
}

export function getProtectedQuestionAnswerWindowSummary(
  question: Pick<QuestionListItem, 'question_created_at' | 'protected_until' | 'viewer_answer_required_level_label'>,
) {
  const requiredLabel = question.viewer_answer_required_level_label ?? 'Эксперт'
  const responderGroup = requiredLabel === 'Участник'
    ? 'участники и мастера'
    : `${requiredLabel.toLowerCase()}ы и мастера`
  const windowLabel = getProtectedQuestionWindowGenitiveLabel(getProtectedQuestionWindowHours(question))

  return `В течение первых ${windowLabel} после публикации отвечать могут только ${responderGroup}.`
}

export interface QuestionListItem extends QuestionProtectionSnapshot {
  question_id: string
  user: string
  user_name?: string
  user_reputation_score?: number | null
  reputation?: ReputationSummary | null
  question_title: string
  question_status: 'open' | 'closed' | 'solved' | string
  question_created_at: string
  question_updated_at: string
  favorites_count: number
  is_favorited: boolean
  tags: QuestionTag[]
}

export type QuestionOrdering = '-question_created_at' | 'question_created_at'

export interface QuestionListParams {
  page: number
  search?: string
  ordering?: QuestionOrdering
  tags?: string[]
}

export interface VoteContext {
  upvotes: number
  downvotes: number
  score: number
  user_vote: 'up' | 'down' | null | string
}

export interface QuestionDetail extends QuestionListItem, VoteContext {
  question_body: string
}

export interface TagSuggestion {
  name: string
  questions_count: number
}

export interface CreateQuestionPayload {
  question_title: string
  question_body: string
  tags?: string[]
}

export interface UpdateQuestionPayload {
  question_title: string
  question_body: string
  tags: string[]
}

export interface CreateQuestionResponse {
  question_id: string
  user: string
  question_title: string
  question_body: string
  question_status: 'open' | 'closed' | 'solved' | string
  question_created_at: string
  question_updated_at: string
  tags: QuestionTag[]
}

export interface QuestionFavoriteMutationResponse {
  question_id: string
  favorites_count: number
  is_favorited: boolean
}

const DEFAULT_QUESTION_PROTECTION_SNAPSHOT: QuestionProtectionSnapshot = {
  is_protected: false,
  protection_reason_code: 'question_not_protected',
  protected_until: null,
  author_level: null,
  author_points_to_next_level: null,
  author_next_level: null,
  author_next_level_label: null,
  viewer_can_answer: true,
  viewer_answer_reason_code: 'answer_allowed',
  viewer_answer_reason_message: '',
  viewer_answer_required_level: null,
  viewer_answer_required_level_label: null,
  viewer_level: null,
  viewer_level_label: null,
  viewer_points_to_next_level: null,
  viewer_next_level: null,
  viewer_next_level_label: null,
  viewer_can_downvote: true,
  viewer_downvote_reason_code: 'question_downvote_allowed',
  viewer_downvote_reason_message: '',
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isNullableNumber(value: unknown): value is number | null {
  return typeof value === 'number' || value === null
}

export function normalizeQuestionProtectionSnapshot(value: unknown): QuestionProtectionSnapshot {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_QUESTION_PROTECTION_SNAPSHOT }
  }

  const raw = value as Record<string, unknown>

  return {
    is_protected: typeof raw.is_protected === 'boolean' ? raw.is_protected : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.is_protected,
    protection_reason_code:
      typeof raw.protection_reason_code === 'string'
        ? raw.protection_reason_code
        : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.protection_reason_code,
    protected_until: isNullableString(raw.protected_until)
      ? raw.protected_until
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.protected_until,
    author_level: isNullableString(raw.author_level) ? raw.author_level : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.author_level,
    author_points_to_next_level: isNullableNumber(raw.author_points_to_next_level)
      ? raw.author_points_to_next_level
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.author_points_to_next_level,
    author_next_level: isNullableString(raw.author_next_level)
      ? raw.author_next_level
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.author_next_level,
    author_next_level_label: isNullableString(raw.author_next_level_label)
      ? raw.author_next_level_label
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.author_next_level_label,
    viewer_can_answer:
      typeof raw.viewer_can_answer === 'boolean'
        ? raw.viewer_can_answer
        : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_can_answer,
    viewer_answer_reason_code: isNullableString(raw.viewer_answer_reason_code)
      ? raw.viewer_answer_reason_code
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_answer_reason_code,
    viewer_answer_reason_message:
      typeof raw.viewer_answer_reason_message === 'string'
        ? raw.viewer_answer_reason_message
        : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_answer_reason_message,
    viewer_answer_required_level: isNullableString(raw.viewer_answer_required_level)
      ? raw.viewer_answer_required_level
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_answer_required_level,
    viewer_answer_required_level_label: isNullableString(raw.viewer_answer_required_level_label)
      ? raw.viewer_answer_required_level_label
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_answer_required_level_label,
    viewer_level: isNullableString(raw.viewer_level) ? raw.viewer_level : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_level,
    viewer_level_label: isNullableString(raw.viewer_level_label)
      ? raw.viewer_level_label
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_level_label,
    viewer_points_to_next_level: isNullableNumber(raw.viewer_points_to_next_level)
      ? raw.viewer_points_to_next_level
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_points_to_next_level,
    viewer_next_level: isNullableString(raw.viewer_next_level)
      ? raw.viewer_next_level
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_next_level,
    viewer_next_level_label: isNullableString(raw.viewer_next_level_label)
      ? raw.viewer_next_level_label
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_next_level_label,
    viewer_can_downvote:
      typeof raw.viewer_can_downvote === 'boolean'
        ? raw.viewer_can_downvote
        : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_can_downvote,
    viewer_downvote_reason_code: isNullableString(raw.viewer_downvote_reason_code)
      ? raw.viewer_downvote_reason_code
      : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_downvote_reason_code,
    viewer_downvote_reason_message:
      typeof raw.viewer_downvote_reason_message === 'string'
        ? raw.viewer_downvote_reason_message
        : DEFAULT_QUESTION_PROTECTION_SNAPSHOT.viewer_downvote_reason_message,
  }
}

function attachQuestionProtectionSnapshot<T extends Record<string, unknown>>(question: T, rawQuestion: Record<string, unknown> = question) {
  return {
    ...question,
    ...normalizeQuestionProtectionSnapshot(rawQuestion),
  }
}

export function normalizeQuestionListItem(value: unknown): QuestionListItem {
  const question = value as Record<string, unknown>

  return attachQuestionProtectionSnapshot({
    question_id: typeof question.question_id === 'string' ? question.question_id : '',
    user: typeof question.user === 'string' ? question.user : '',
    user_name: typeof question.user_name === 'string' ? question.user_name : undefined,
    user_reputation_score: typeof question.user_reputation_score === 'number' ? question.user_reputation_score : null,
    reputation: (question.reputation as ReputationSummary | null | undefined) ?? null,
    question_title: typeof question.question_title === 'string' ? question.question_title : '',
    question_status: typeof question.question_status === 'string' ? question.question_status : 'open',
    question_created_at: typeof question.question_created_at === 'string' ? question.question_created_at : '',
    question_updated_at: typeof question.question_updated_at === 'string' ? question.question_updated_at : '',
    favorites_count: typeof question.favorites_count === 'number' && Number.isFinite(question.favorites_count)
      ? Math.max(0, question.favorites_count)
      : 0,
    is_favorited: typeof question.is_favorited === 'boolean' ? question.is_favorited : false,
    tags: Array.isArray(question.tags) ? question.tags.filter(isQuestionTag) : [],
  }, question)
}

export function normalizeQuestionTags(tags: readonly unknown[] = []) {
  const normalizedTags = tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)

  return [...new Set(normalizedTags)]
}

export async function fetchQuestionList(params: QuestionListParams) {
  const normalizedTags = normalizeQuestionTags(params.tags)
  const response = await http.get<PaginatedResponse<unknown>>('/question/', {
    params: {
      page: params.page,
      search: params.search || undefined,
      ordering: params.ordering,
      tag: normalizedTags.length > 0 ? normalizedTags : undefined,
    },
    paramsSerializer: {
      indexes: null,
    },
  })

  return {
    ...response.data,
    results: Array.isArray(response.data.results)
      ? response.data.results.map((item) => normalizeQuestionListItem(item))
      : [],
  } satisfies PaginatedResponse<QuestionListItem>
}

export async function fetchQuestionDetail(questionId: string) {
  const response = await http.get<unknown>(`/question/${questionId}/`)

  return normalizeQuestionDetail(response.data)
}

export function normalizeTagSearch(search: string) {
  return search.trim().toLowerCase()
}

export async function fetchTagAutocomplete(search: string) {
  const normalizedSearch = normalizeTagSearch(search)

  if (!normalizedSearch) {
    return []
  }

  const response = await http.get<TagSuggestion[]>('/tag/', {
    params: { search: normalizedSearch },
  })

  return response.data
}

export async function createQuestion(payload: CreateQuestionPayload) {
  const response = await http.post<CreateQuestionResponse>('/question/', payload)

  return response.data
}

function isQuestionTag(value: unknown): value is QuestionTag {
  if (!value || typeof value !== 'object') {
    return false
  }

  const tag = value as Record<string, unknown>

  return typeof tag.name === 'string' && typeof tag.questions_count === 'number'
}

function isQuestionDetail(value: unknown): value is QuestionDetail {
  if (!value || typeof value !== 'object') {
    return false
  }

  const question = value as Record<string, unknown>

  return (
    typeof question.question_id === 'string' &&
    typeof question.user === 'string' &&
    typeof question.question_title === 'string' &&
    typeof question.question_body === 'string' &&
    typeof question.question_status === 'string' &&
    typeof question.question_created_at === 'string' &&
    typeof question.question_updated_at === 'string' &&
    typeof question.upvotes === 'number' &&
    typeof question.downvotes === 'number' &&
    typeof question.score === 'number' &&
    Array.isArray(question.tags) &&
    question.tags.every(isQuestionTag)
  )
}

function normalizeQuestionDetail(value: unknown): QuestionDetail {
  const question = value as Record<string, unknown>
  const listItem = normalizeQuestionListItem(value)

  return {
    ...listItem,
    question_body: typeof question.question_body === 'string' ? question.question_body : '',
    upvotes: typeof question.upvotes === 'number' ? question.upvotes : 0,
    downvotes: typeof question.downvotes === 'number' ? question.downvotes : 0,
    score: typeof question.score === 'number' ? question.score : 0,
    user_vote:
      question.user_vote === 'up' || question.user_vote === 'down' || question.user_vote === null
        ? question.user_vote
        : null,
  }
}

export function normalizeQuestionFavoriteMutationResponse(value: unknown): QuestionFavoriteMutationResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Malformed question favorite response')
  }

  const response = value as Record<string, unknown>

  if (
    typeof response.question_id !== 'string' ||
    typeof response.favorites_count !== 'number' ||
    !Number.isFinite(response.favorites_count) ||
    typeof response.is_favorited !== 'boolean'
  ) {
    throw new Error('Malformed question favorite response')
  }

  return {
    question_id: response.question_id,
    favorites_count: Math.max(0, response.favorites_count),
    is_favorited: response.is_favorited,
  }
}

export async function addQuestionFavorite(questionId: string) {
  const response = await http.post<unknown>(`/question/${questionId}/favorite/`)

  return normalizeQuestionFavoriteMutationResponse(response.data)
}

export async function removeQuestionFavorite(questionId: string) {
  const response = await http.delete<unknown>(`/question/${questionId}/favorite/`)

  return normalizeQuestionFavoriteMutationResponse(response.data)
}

export async function updateQuestion(questionId: string, payload: UpdateQuestionPayload) {
  const response = await http.patch<unknown>(`/question/${questionId}/`, payload)

  if (!isQuestionDetail(response.data)) {
    throw new Error('Malformed question update response')
  }

  return normalizeQuestionDetail(response.data)
}
