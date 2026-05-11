import { http } from '@/shared/api/http'

export interface KnowledgeGraphState {
  status: string
  stale_reason: string
  last_error_message: string
  last_failed_phase: string
  last_rebuild_started_at: string | null
  last_rebuild_finished_at: string | null
}

export interface KnowledgeGraphViewer {
  is_owner: boolean
}

export interface KnowledgeGraphActivityBreakdownEntry {
  activity_type: string
  total_weight: string
  source_count: number
}

export interface KnowledgeGraphRelatedQuestion {
  question_id: string
  title: string
  status: string
}

export interface KnowledgeGraphConceptEntry {
  concept_id: number
  slug: string
  name: string
  source: string
  provider: string
  confidence: string
  total_weight: string
  source_count: number
  activity_breakdown: KnowledgeGraphActivityBreakdownEntry[]
  related_questions: KnowledgeGraphRelatedQuestion[]
}

export type KnowledgeGraphNode = KnowledgeGraphConceptEntry

export interface KnowledgeGraphEdge {
  id: string
  source_concept_id: number
  target_concept_id: number
  weight: string
  shared_question_count: number
  reason: 'shared_question'
  related_questions: KnowledgeGraphRelatedQuestion[]
}

export interface KnowledgeGraphLayoutPosition {
  x: number
  y: number
}

export interface KnowledgeGraphLayout {
  schema_version: 1
  positions: Record<string, KnowledgeGraphLayoutPosition>
  updated_at: string | null
}

export interface SaveKnowledgeGraphLayoutRequest {
  schema_version: 1
  positions: Record<string, KnowledgeGraphLayoutPosition>
}

export interface UserKnowledgeGraphResponse {
  user_id: string
  viewer: KnowledgeGraphViewer
  state: KnowledgeGraphState
  total_weight: string
  activity_breakdown: KnowledgeGraphActivityBreakdownEntry[]
  concepts: KnowledgeGraphConceptEntry[]
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  layout?: KnowledgeGraphLayout
}

export interface KnowledgeGraphRebuildSummary {
  [key: string]: number
}

export interface KnowledgeGraphRebuildResponse {
  user_id: string
  processed_questions: number
  processed_activity_sources: number
  structural_summary: KnowledgeGraphRebuildSummary
  activity_summary: KnowledgeGraphRebuildSummary
  state: KnowledgeGraphState
}

export interface KnowledgeGraphRebuildErrorResponse {
  error: {
    code: string
    message: string
  }
  state: KnowledgeGraphState
}

export class MalformedKnowledgeGraphResponseError extends Error {
  constructor(path: string, expected: string) {
    super(`Malformed knowledge graph response: ${path} must be ${expected}`)
    this.name = 'MalformedKnowledgeGraphResponseError'
  }
}

const DECIMAL_STRING_PATTERN = /^-?\d+(?:\.\d+)?$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new MalformedKnowledgeGraphResponseError(path, 'an object')
  }

  return value
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new MalformedKnowledgeGraphResponseError(path, 'a string')
  }

  return value
}

function assertNonEmptyString(value: unknown, path: string): string {
  const parsed = assertString(value, path)

  if (!parsed.trim()) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a non-empty string')
  }

  return parsed
}

function assertUuidString(value: unknown, path: string): string {
  const parsed = assertNonEmptyString(value, path)

  if (!UUID_PATTERN.test(parsed)) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a UUID string')
  }

  return parsed
}

function assertDecimalString(value: unknown, path: string): string {
  const parsed = assertString(value, path)

  if (!DECIMAL_STRING_PATTERN.test(parsed)) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a decimal string')
  }

  return parsed
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a finite number')
  }

  return value
}

function assertNonNegativeInteger(value: unknown, path: string): number {
  const parsed = assertNumber(value, path)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a non-negative integer')
  }

  return parsed
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new MalformedKnowledgeGraphResponseError(path, 'a boolean')
  }

  return value
}

function assertNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null
  }

  return assertString(value, path)
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new MalformedKnowledgeGraphResponseError(path, 'an array')
  }

  return value
}

function parseGraphState(value: unknown, path: string): KnowledgeGraphState {
  const record = assertRecord(value, path)

  return {
    status: assertString(record.status, `${path}.status`),
    stale_reason: assertString(record.stale_reason, `${path}.stale_reason`),
    last_error_message: assertString(record.last_error_message, `${path}.last_error_message`),
    last_failed_phase: assertString(record.last_failed_phase, `${path}.last_failed_phase`),
    last_rebuild_started_at: assertNullableString(record.last_rebuild_started_at, `${path}.last_rebuild_started_at`),
    last_rebuild_finished_at: assertNullableString(record.last_rebuild_finished_at, `${path}.last_rebuild_finished_at`),
  }
}

function parseViewer(value: unknown, path: string): KnowledgeGraphViewer {
  const record = assertRecord(value, path)

  return {
    is_owner: assertBoolean(record.is_owner, `${path}.is_owner`),
  }
}

function parseActivityBreakdownEntry(value: unknown, path: string): KnowledgeGraphActivityBreakdownEntry {
  const record = assertRecord(value, path)

  return {
    activity_type: assertNonEmptyString(record.activity_type, `${path}.activity_type`),
    total_weight: assertDecimalString(record.total_weight, `${path}.total_weight`),
    source_count: assertNonNegativeInteger(record.source_count, `${path}.source_count`),
  }
}

function parseActivityBreakdown(value: unknown, path: string): KnowledgeGraphActivityBreakdownEntry[] {
  return assertArray(value, path).map((entry, index) => parseActivityBreakdownEntry(entry, `${path}[${index}]`))
}

function parseRelatedQuestion(value: unknown, path: string): KnowledgeGraphRelatedQuestion {
  const record = assertRecord(value, path)

  return {
    question_id: assertUuidString(record.question_id, `${path}.question_id`),
    title: assertString(record.title, `${path}.title`),
    status: assertString(record.status, `${path}.status`),
  }
}

function parseRelatedQuestions(value: unknown, path: string): KnowledgeGraphRelatedQuestion[] {
  return assertArray(value, path).map((entry, index) => parseRelatedQuestion(entry, `${path}[${index}]`))
}

function parseConceptEntry(value: unknown, path: string): KnowledgeGraphConceptEntry {
  const record = assertRecord(value, path)

  return {
    concept_id: assertNonNegativeInteger(record.concept_id, `${path}.concept_id`),
    slug: assertNonEmptyString(record.slug, `${path}.slug`),
    name: assertString(record.name, `${path}.name`),
    source: assertString(record.source, `${path}.source`),
    provider: assertString(record.provider, `${path}.provider`),
    confidence: assertDecimalString(record.confidence, `${path}.confidence`),
    total_weight: assertDecimalString(record.total_weight, `${path}.total_weight`),
    source_count: assertNonNegativeInteger(record.source_count, `${path}.source_count`),
    activity_breakdown: parseActivityBreakdown(record.activity_breakdown, `${path}.activity_breakdown`),
    related_questions: parseRelatedQuestions(record.related_questions, `${path}.related_questions`),
  }
}

function parseConcepts(value: unknown, path: string): KnowledgeGraphConceptEntry[] {
  return assertArray(value, path).map((entry, index) => parseConceptEntry(entry, `${path}[${index}]`))
}

function parseNodes(value: unknown, path: string): KnowledgeGraphNode[] {
  return assertArray(value, path).map((entry, index) => parseConceptEntry(entry, `${path}[${index}]`))
}

function assertSharedQuestionReason(value: unknown, path: string): 'shared_question' {
  const parsed = assertString(value, path)

  if (parsed !== 'shared_question') {
    throw new MalformedKnowledgeGraphResponseError(path, "'shared_question'")
  }

  return parsed
}

function parseEdge(value: unknown, path: string): KnowledgeGraphEdge {
  const record = assertRecord(value, path)

  return {
    id: assertNonEmptyString(record.id, `${path}.id`),
    source_concept_id: assertNonNegativeInteger(record.source_concept_id, `${path}.source_concept_id`),
    target_concept_id: assertNonNegativeInteger(record.target_concept_id, `${path}.target_concept_id`),
    weight: assertDecimalString(record.weight, `${path}.weight`),
    shared_question_count: assertNonNegativeInteger(record.shared_question_count, `${path}.shared_question_count`),
    reason: assertSharedQuestionReason(record.reason, `${path}.reason`),
    related_questions: parseRelatedQuestions(record.related_questions, `${path}.related_questions`),
  }
}

function parseEdges(value: unknown, path: string): KnowledgeGraphEdge[] {
  return assertArray(value, path).map((entry, index) => parseEdge(entry, `${path}[${index}]`))
}

function assertLayoutSchemaVersion(value: unknown, path: string): 1 {
  const parsed = assertNonNegativeInteger(value, path)

  if (parsed !== 1) {
    throw new MalformedKnowledgeGraphResponseError(path, 'layout schema version 1')
  }

  return 1
}

function parseLayoutPosition(value: unknown, path: string): KnowledgeGraphLayoutPosition {
  const record = assertRecord(value, path)

  return {
    x: assertNumber(record.x, `${path}.x`),
    y: assertNumber(record.y, `${path}.y`),
  }
}

export function parseKnowledgeGraphLayout(value: unknown): KnowledgeGraphLayout {
  const record = assertRecord(value, 'layout')
  const rawPositions = assertRecord(record.positions, 'layout.positions')
  const positions: Record<string, KnowledgeGraphLayoutPosition> = {}

  Object.entries(rawPositions).forEach(([conceptId, position]) => {
    if (!/^\d+$/.test(conceptId)) {
      throw new MalformedKnowledgeGraphResponseError(`layout.positions.${conceptId}`, 'a numeric concept id key')
    }

    positions[conceptId] = parseLayoutPosition(position, `layout.positions.${conceptId}`)
  })

  return {
    schema_version: assertLayoutSchemaVersion(record.schema_version, 'layout.schema_version'),
    positions,
    updated_at: assertNullableString(record.updated_at, 'layout.updated_at'),
  }
}

function validateEdgeEndpoints(edges: KnowledgeGraphEdge[], nodes: KnowledgeGraphNode[]): void {
  const nodeIds = new Set(nodes.map((node) => node.concept_id))

  edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source_concept_id)) {
      throw new MalformedKnowledgeGraphResponseError(
        `edges[${index}].source_concept_id`,
        'a concept_id from nodes',
      )
    }

    if (!nodeIds.has(edge.target_concept_id)) {
      throw new MalformedKnowledgeGraphResponseError(
        `edges[${index}].target_concept_id`,
        'a concept_id from nodes',
      )
    }
  })
}

function parseRebuildSummary(value: unknown, path: string): KnowledgeGraphRebuildSummary {
  const record = assertRecord(value, path)
  const summary: KnowledgeGraphRebuildSummary = {}

  Object.entries(record).forEach(([key, entryValue]) => {
    summary[key] = assertNonNegativeInteger(entryValue, `${path}.${key}`)
  })

  return summary
}

export function parseUserKnowledgeGraphResponse(value: unknown): UserKnowledgeGraphResponse {
  const record = assertRecord(value, 'root')
  const nodes = parseNodes(record.nodes, 'nodes')
  const edges = parseEdges(record.edges, 'edges')

  validateEdgeEndpoints(edges, nodes)

  const parsed: UserKnowledgeGraphResponse = {
    user_id: assertUuidString(record.user_id, 'user_id'),
    viewer: parseViewer(record.viewer, 'viewer'),
    state: parseGraphState(record.state, 'state'),
    total_weight: assertDecimalString(record.total_weight, 'total_weight'),
    activity_breakdown: parseActivityBreakdown(record.activity_breakdown, 'activity_breakdown'),
    concepts: parseConcepts(record.concepts, 'concepts'),
    nodes,
    edges,
  }

  if ('layout' in record) {
    parsed.layout = parseKnowledgeGraphLayout(record.layout)
  }

  return parsed
}

export function parseKnowledgeGraphRebuildResponse(value: unknown): KnowledgeGraphRebuildResponse {
  const record = assertRecord(value, 'root')

  return {
    user_id: assertUuidString(record.user_id, 'user_id'),
    processed_questions: assertNonNegativeInteger(record.processed_questions, 'processed_questions'),
    processed_activity_sources: assertNonNegativeInteger(record.processed_activity_sources, 'processed_activity_sources'),
    structural_summary: parseRebuildSummary(record.structural_summary, 'structural_summary'),
    activity_summary: parseRebuildSummary(record.activity_summary, 'activity_summary'),
    state: parseGraphState(record.state, 'state'),
  }
}

export function parseKnowledgeGraphRebuildErrorResponse(value: unknown): KnowledgeGraphRebuildErrorResponse {
  const record = assertRecord(value, 'root')
  const error = assertRecord(record.error, 'error')

  return {
    error: {
      code: assertNonEmptyString(error.code, 'error.code'),
      message: assertNonEmptyString(error.message, 'error.message'),
    },
    state: parseGraphState(record.state, 'state'),
  }
}

export async function fetchOwnKnowledgeGraph(): Promise<UserKnowledgeGraphResponse> {
  const response = await http.get<unknown>('/knowledge-graph/me/')

  return parseUserKnowledgeGraphResponse(response.data)
}

export async function fetchPublicUserKnowledgeGraph(userId: string): Promise<UserKnowledgeGraphResponse> {
  const response = await http.get<unknown>(`/knowledge-graph/users/${userId}/`)

  return parseUserKnowledgeGraphResponse(response.data)
}

export async function rebuildOwnKnowledgeGraph(): Promise<KnowledgeGraphRebuildResponse> {
  const response = await http.post<unknown>('/knowledge-graph/me/rebuild/')

  return parseKnowledgeGraphRebuildResponse(response.data)
}

export async function saveOwnKnowledgeGraphLayout(
  payload: SaveKnowledgeGraphLayoutRequest,
): Promise<KnowledgeGraphLayout> {
  const response = await http.put<unknown>('/knowledge-graph/me/layout/', payload)

  return parseKnowledgeGraphLayout(response.data)
}

export async function resetOwnKnowledgeGraphLayout(): Promise<KnowledgeGraphLayout> {
  const response = await http.delete<unknown>('/knowledge-graph/me/layout/')

  return parseKnowledgeGraphLayout(response.data)
}
