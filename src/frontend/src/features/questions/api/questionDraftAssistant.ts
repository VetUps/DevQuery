// Кратко: выполняет запросы к backend и нормализует ответ.
import { http } from '@/shared/api/http'

export type DraftAssistantMode = 'create' | 'edit'
export type DraftAssistantStatus = 'ok' | 'assistant_unavailable'
export type DraftAssistantFindingSeverity = 'info' | 'warning' | 'error'

export interface QuestionDraftAssistPayload {
  question_title: string
  question_body: string
  tags: string[]
  mode: DraftAssistantMode
}

export interface DraftAssistantFinding {
  code: string
  message: string
  severity: DraftAssistantFindingSeverity
  field?: string | null
}

export interface DraftAssistantWarning {
  code: string
  message: string
}

export interface DraftAssistantResponse {
  status: DraftAssistantStatus
  mode: DraftAssistantMode
  summary: string
  findings: DraftAssistantFinding[]
  suggested_title: string | null
  suggested_body: string | null
  suggested_tags: string[]
  warnings: DraftAssistantWarning[]
}

export class MalformedDraftAssistantResponseError extends Error {
  constructor(message = 'Malformed draft assistant response') {
    super(message)
    this.name = 'MalformedDraftAssistantResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDraftAssistantStatus(value: unknown): value is DraftAssistantStatus {
  return value === 'ok' || value === 'assistant_unavailable'
}

function isDraftAssistantMode(value: unknown): value is DraftAssistantMode {
  return value === 'create' || value === 'edit'
}

function isDraftAssistantFindingSeverity(value: unknown): value is DraftAssistantFindingSeverity {
  return value === 'info' || value === 'warning' || value === 'error'
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new MalformedDraftAssistantResponseError(`Malformed draft assistant response: ${fieldName} must be a string array`)
  }

  return [...value]
}

function parseFindings(value: unknown): DraftAssistantFinding[] {
  if (!Array.isArray(value)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: findings must be an array')
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: finding must be an object')
    }

    if (typeof item.code !== 'string' || typeof item.message !== 'string' || !isDraftAssistantFindingSeverity(item.severity)) {
      throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: finding fields are invalid')
    }

    if (item.field !== undefined && !isNullableString(item.field)) {
      throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: finding field must be a string or null')
    }

    const finding: DraftAssistantFinding = {
      code: item.code,
      message: item.message,
      severity: item.severity,
    }

    if (item.field !== undefined) {
      finding.field = item.field
    }

    return finding
  })
}

function parseWarnings(value: unknown): DraftAssistantWarning[] {
  if (!Array.isArray(value)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: warnings must be an array')
  }

  return value.map((item) => {
    if (!isRecord(item) || typeof item.code !== 'string' || typeof item.message !== 'string') {
      throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: warning fields are invalid')
    }

    return {
      code: item.code,
      message: item.message,
    }
  })
}

export function parseQuestionDraftAssistantResponse(value: unknown): DraftAssistantResponse {
  if (!isRecord(value)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: root must be an object')
  }

  if (!isDraftAssistantStatus(value.status)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: invalid status')
  }

  if (!isDraftAssistantMode(value.mode)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: invalid mode')
  }

  if (typeof value.summary !== 'string') {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: summary must be a string')
  }

  if (!isNullableString(value.suggested_title)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: suggested_title must be a string or null')
  }

  if (!isNullableString(value.suggested_body)) {
    throw new MalformedDraftAssistantResponseError('Malformed draft assistant response: suggested_body must be a string or null')
  }

  return {
    status: value.status,
    mode: value.mode,
    summary: value.summary,
    findings: parseFindings(value.findings),
    suggested_title: value.suggested_title,
    suggested_body: value.suggested_body,
    suggested_tags: parseStringArray(value.suggested_tags, 'suggested_tags'),
    warnings: parseWarnings(value.warnings),
  }
}

export const QUESTION_DRAFT_ASSISTANT_REQUEST_TIMEOUT_MS = 30000

export async function requestQuestionDraftAssist(payload: QuestionDraftAssistPayload): Promise<DraftAssistantResponse> {
  const response = await http.post<unknown>('/question/draft-assist/', payload, {
    timeout: QUESTION_DRAFT_ASSISTANT_REQUEST_TIMEOUT_MS,
  })

  return parseQuestionDraftAssistantResponse(response.data)
}
