// Кратко: выполняет запросы к backend и нормализует ответ.
import { http } from '@/shared/api/http'

export type QuestionEditApprovalState = boolean | null

export interface CreateQuestionEditPayload {
  question: string
  question_edit_title_after: string
  question_edit_body_after: string
  tags: string[]
}

export interface QuestionEditRecord {
  question_edit_id: string
  question: string
  question_title: string
  question_author_id: string | null
  question_author_name: string
  user: string | null
  edit_author_id: string | null
  edit_author_name: string
  question_edit_title_before: string
  question_edit_title_after: string
  question_edit_body_before: string
  question_edit_body_after: string
  question_edit_tags_before: string[]
  question_edit_tags_after: string[]
  question_edit_is_approved: QuestionEditApprovalState
  question_edit_edited_at: string
}

export interface ModerateQuestionEditResponse {
  approved: boolean
}

export class MalformedQuestionEditResponseError extends Error {
  constructor(message = 'Malformed question edit API response') {
    super(message)
    this.name = 'MalformedQuestionEditResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new MalformedQuestionEditResponseError(`Malformed question edit response: ${fieldName}`)
  }

  return value
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null
  }

  return assertString(value, fieldName)
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new MalformedQuestionEditResponseError(`Malformed question edit response: ${fieldName}`)
  }

  return value
}

function assertApprovalState(value: unknown): QuestionEditApprovalState {
  if (value === null || typeof value === 'boolean') {
    return value
  }

  throw new MalformedQuestionEditResponseError('Malformed question edit response: question_edit_is_approved')
}

export function parseQuestionEditRecord(value: unknown): QuestionEditRecord {
  if (!isRecord(value)) {
    throw new MalformedQuestionEditResponseError('Malformed question edit response: expected object')
  }

  return {
    question_edit_id: assertString(value.question_edit_id, 'question_edit_id'),
    question: assertString(value.question, 'question'),
    question_title: assertString(value.question_title, 'question_title'),
    question_author_id: assertNullableString(value.question_author_id, 'question_author_id'),
    question_author_name: assertString(value.question_author_name, 'question_author_name'),
    user: assertNullableString(value.user, 'user'),
    edit_author_id: assertNullableString(value.edit_author_id, 'edit_author_id'),
    edit_author_name: assertString(value.edit_author_name, 'edit_author_name'),
    question_edit_title_before: assertString(value.question_edit_title_before, 'question_edit_title_before'),
    question_edit_title_after: assertString(value.question_edit_title_after, 'question_edit_title_after'),
    question_edit_body_before: assertString(value.question_edit_body_before, 'question_edit_body_before'),
    question_edit_body_after: assertString(value.question_edit_body_after, 'question_edit_body_after'),
    question_edit_tags_before: assertStringArray(value.question_edit_tags_before, 'question_edit_tags_before'),
    question_edit_tags_after: assertStringArray(value.question_edit_tags_after, 'question_edit_tags_after'),
    question_edit_is_approved: assertApprovalState(value.question_edit_is_approved),
    question_edit_edited_at: assertString(value.question_edit_edited_at, 'question_edit_edited_at'),
  }
}

function parseQuestionEditRecordList(value: unknown): QuestionEditRecord[] {
  if (!Array.isArray(value)) {
    throw new MalformedQuestionEditResponseError('Malformed question edit review queue response: expected array')
  }

  return value.map(parseQuestionEditRecord)
}

function parseModerationResponse(value: unknown): ModerateQuestionEditResponse {
  if (!isRecord(value) || typeof value.approved !== 'boolean') {
    throw new MalformedQuestionEditResponseError('Malformed question edit moderation response: approved')
  }

  return { approved: value.approved }
}

export async function createQuestionEdit(payload: CreateQuestionEditPayload) {
  const response = await http.post<unknown>('/question_edits/', payload)

  return parseQuestionEditRecord(response.data)
}

export async function fetchQuestionReviewQueue() {
  const response = await http.get<unknown>('/question_edits/review_queue/')

  return parseQuestionEditRecordList(response.data)
}

export async function approveQuestionEdit(questionEditId: string) {
  const response = await http.patch<unknown>(`/question_edits/approve/${questionEditId}/`)

  return parseModerationResponse(response.data)
}

export async function disapproveQuestionEdit(questionEditId: string) {
  const response = await http.patch<unknown>(`/question_edits/disapprove/${questionEditId}/`)

  return parseModerationResponse(response.data)
}
