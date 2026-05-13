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

export type KnowledgeGraphSafeEvidenceValue =
  | string
  | number
  | boolean
  | null
  | KnowledgeGraphSafeEvidenceValue[]
  | { [key: string]: KnowledgeGraphSafeEvidenceValue }

export type KnowledgeGraphSafeEvidencePayload = Record<string, KnowledgeGraphSafeEvidenceValue>

export interface KnowledgeGraphSemanticEdge {
  id: string
  source_concept_id: number
  target_concept_id: number
  weight: string
  similarity_score: string
  confidence: string
  rank: number
  reason: 'semantic_neighbour'
  evidence: KnowledgeGraphSafeEvidencePayload
}

export interface KnowledgeGraphSemanticGroupMember {
  concept_id: number
  slug: string
  name: string
  rank: number
  confidence: string
  evidence: KnowledgeGraphSafeEvidencePayload
}

export interface KnowledgeGraphSemanticGroup {
  group_key: string
  label: string
  description: string
  rationale: string
  confidence: string
  generated_at: string
  evidence: KnowledgeGraphSafeEvidencePayload
  members: KnowledgeGraphSemanticGroupMember[]
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
  semantic_edges: KnowledgeGraphSemanticEdge[]
  semantic_groups: KnowledgeGraphSemanticGroup[]
  layout?: KnowledgeGraphLayout
}

export interface KnowledgeGraphInsightsState {
  status: string
  stale_reason: string
  last_failed_phase: string
  last_rebuild_started_at: string | null
  last_rebuild_finished_at: string | null
}

export const KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES = [
  'review_related_questions',
  'answer_question',
  'practice_foundation',
  'refresh_stale',
  'connect_concept',
] as const

export type KnowledgeGraphRecommendationActionType =
  (typeof KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES)[number]

export type KnowledgeGraphSafeActionPayload = {
  query?: string
  tag?: string | string[]
  search?: string
  order?: string
  page?: number | string
}

export interface KnowledgeGraphInsightAction {
  type: KnowledgeGraphRecommendationActionType
  payload: KnowledgeGraphSafeActionPayload
}

export interface KnowledgeGraphRecommendationTargetConcept {
  concept_id: number
  slug: string
  name: string
}

export interface KnowledgeGraphRecommendationTargetGroup {
  group_key: string
  label: string
}

export interface KnowledgeGraphRecommendationV2Target {
  concept: KnowledgeGraphRecommendationTargetConcept
  discovery: KnowledgeGraphSafeActionPayload
  neighbours: KnowledgeGraphRecommendationTargetConcept[]
  group: KnowledgeGraphRecommendationTargetGroup | null
}

export interface KnowledgeGraphRecommendationV2EvidenceEntry {
  code: string
  label: string
  value: string | number | boolean | null
  weight: number
}

export interface KnowledgeGraphInsightRecommendationV2 {
  rank: number
  id: string
  score: number
  confidence: number
  priority: string
  label: string
  reason_code: string
  target: KnowledgeGraphRecommendationV2Target
  action: KnowledgeGraphInsightAction
  evidence: KnowledgeGraphRecommendationV2EvidenceEntry[]
}

export interface KnowledgeGraphInsightRecommendation {
  id: string
  priority: string
  label: string
  reason_code: string
  action: KnowledgeGraphInsightAction
}

export interface KnowledgeGraphInsightConceptEntry {
  concept_id: number
  slug: string
  name: string
  total_weight: string
  source_count: number
  related_question_count: number
  semantic_state: string
  tone_token: string
  recommendations: KnowledgeGraphInsightRecommendation[]
}

export interface KnowledgeGraphInsightsSummary {
  concept_count: number
  recommendation_count: number
  states: Record<string, number>
}

export interface UserKnowledgeGraphInsightsResponse {
  user_id: string
  viewer: KnowledgeGraphViewer
  state: KnowledgeGraphInsightsState
  summary: KnowledgeGraphInsightsSummary
  recommendations: KnowledgeGraphInsightRecommendationV2[]
  concepts: KnowledgeGraphInsightConceptEntry[]
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
const FORBIDDEN_SEMANTIC_EVIDENCE_TERMS = [
  `vec${'tor'}`,
  `embed${'ding'}`,
  'provider',
  'model',
  'source_id',
  'content_hash',
  'raw_output',
  'secret',
  'stack',
  'traceback',
  'source_object',
  'idempotency',
  'token',
] as const
const PRIVATE_LOOKING_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PRIVATE_LOOKING_SECRET_PATTERN = /(?:sk|pk|token|secret|password)[_-]?[a-z0-9]{6,}/i

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

function parseInsightsGraphState(value: unknown, path: string): KnowledgeGraphInsightsState {
  const record = assertRecord(value, path)

  return {
    status: assertString(record.status, `${path}.status`),
    stale_reason: assertString(record.stale_reason, `${path}.stale_reason`),
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

function assertSemanticNeighbourReason(value: unknown, path: string): 'semantic_neighbour' {
  const parsed = assertString(value, path)

  if (parsed !== 'semantic_neighbour') {
    throw new MalformedKnowledgeGraphResponseError(path, "'semantic_neighbour'")
  }

  return parsed
}

function evidenceContainerPath(path: string): string {
  const evidenceIndex = path.indexOf('.evidence')

  return evidenceIndex === -1 ? path : path.slice(0, evidenceIndex + '.evidence'.length)
}

function assertSafeEvidenceKey(key: string, path: string): void {
  const normalized = key.toLowerCase()

  if (FORBIDDEN_SEMANTIC_EVIDENCE_TERMS.some((term) => normalized.includes(term)) || PRIVATE_LOOKING_EMAIL_PATTERN.test(key) || PRIVATE_LOOKING_SECRET_PATTERN.test(key)) {
    throw new MalformedKnowledgeGraphResponseError(evidenceContainerPath(path), 'safe aggregate evidence')
  }
}

function assertSafeEvidenceString(value: string, path: string): string {
  const normalized = value.toLowerCase()

  if (FORBIDDEN_SEMANTIC_EVIDENCE_TERMS.some((term) => normalized.includes(term)) || PRIVATE_LOOKING_EMAIL_PATTERN.test(value) || PRIVATE_LOOKING_SECRET_PATTERN.test(value)) {
    throw new MalformedKnowledgeGraphResponseError(evidenceContainerPath(path), 'safe aggregate evidence')
  }

  return value
}

function parseSafeEvidenceValue(value: unknown, path: string): KnowledgeGraphSafeEvidenceValue {
  if (value === null || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return assertSafeEvidenceString(value, path)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new MalformedKnowledgeGraphResponseError(path, 'safe aggregate evidence')
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => parseSafeEvidenceValue(entry, `${path}[${index}]`))
  }

  const record = assertRecord(value, path)
  const parsed: KnowledgeGraphSafeEvidencePayload = {}

  Object.entries(record).forEach(([key, entryValue]) => {
    assertSafeEvidenceKey(key, `${path}.${key}`)
    parsed[key] = parseSafeEvidenceValue(entryValue, `${path}.${key}`)
  })

  return parsed
}

function parseSafeEvidencePayload(value: unknown, path: string): KnowledgeGraphSafeEvidencePayload {
  const parsed = parseSafeEvidenceValue(value, path)

  if (!isRecord(parsed)) {
    throw new MalformedKnowledgeGraphResponseError(path, 'safe aggregate evidence object')
  }

  return parsed
}

function parseSemanticEdge(value: unknown, path: string): KnowledgeGraphSemanticEdge {
  const record = assertRecord(value, path)

  return {
    id: assertNonEmptyString(record.id, `${path}.id`),
    source_concept_id: assertNonNegativeInteger(record.source_concept_id, `${path}.source_concept_id`),
    target_concept_id: assertNonNegativeInteger(record.target_concept_id, `${path}.target_concept_id`),
    weight: assertDecimalString(record.weight, `${path}.weight`),
    similarity_score: assertDecimalString(record.similarity_score, `${path}.similarity_score`),
    confidence: assertDecimalString(record.confidence, `${path}.confidence`),
    rank: assertNonNegativeInteger(record.rank, `${path}.rank`),
    reason: assertSemanticNeighbourReason(record.reason, `${path}.reason`),
    evidence: parseSafeEvidencePayload(record.evidence, `${path}.evidence`),
  }
}

function parseSemanticEdges(value: unknown, path: string): KnowledgeGraphSemanticEdge[] {
  return assertArray(value, path).map((entry, index) => parseSemanticEdge(entry, `${path}[${index}]`))
}

function parseSemanticGroupMember(value: unknown, path: string): KnowledgeGraphSemanticGroupMember {
  const record = assertRecord(value, path)

  return {
    concept_id: assertNonNegativeInteger(record.concept_id, `${path}.concept_id`),
    slug: assertNonEmptyString(record.slug, `${path}.slug`),
    name: assertString(record.name, `${path}.name`),
    rank: assertNonNegativeInteger(record.rank, `${path}.rank`),
    confidence: assertDecimalString(record.confidence, `${path}.confidence`),
    evidence: parseSafeEvidencePayload(record.evidence, `${path}.evidence`),
  }
}

function parseSemanticGroupMembers(value: unknown, path: string): KnowledgeGraphSemanticGroupMember[] {
  return assertArray(value, path)
    .map((entry, index) => parseSemanticGroupMember(entry, `${path}[${index}]`))
    .sort((left, right) => left.rank - right.rank || left.concept_id - right.concept_id)
}

function parseSemanticGroup(value: unknown, path: string): KnowledgeGraphSemanticGroup {
  const record = assertRecord(value, path)

  return {
    group_key: assertNonEmptyString(record.group_key, `${path}.group_key`),
    label: assertString(record.label, `${path}.label`),
    description: assertString(record.description, `${path}.description`),
    rationale: assertString(record.rationale, `${path}.rationale`),
    confidence: assertDecimalString(record.confidence, `${path}.confidence`),
    generated_at: assertNonEmptyString(record.generated_at, `${path}.generated_at`),
    evidence: parseSafeEvidencePayload(record.evidence, `${path}.evidence`),
    members: parseSemanticGroupMembers(record.members, `${path}.members`),
  }
}

function parseSemanticGroups(value: unknown, path: string): KnowledgeGraphSemanticGroup[] {
  return assertArray(value, path).map((entry, index) => parseSemanticGroup(entry, `${path}[${index}]`))
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

const FORBIDDEN_NAMED_LAYOUT_CONTRACT_KEYS = [
  'name',
  'layout_name',
  'layoutName',
  'saved_layouts',
  'savedLayouts',
  'layouts',
  'selected_layout',
  'selectedLayout',
] as const

export function parseKnowledgeGraphLayout(value: unknown): KnowledgeGraphLayout {
  const record = assertRecord(value, 'layout')

  FORBIDDEN_NAMED_LAYOUT_CONTRACT_KEYS.forEach((key) => {
    if (key in record) {
      throw new MalformedKnowledgeGraphResponseError(`layout.${key}`, 'absent from the single saved layout contract')
    }
  })

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

function validateSemanticReferences(
  semanticEdges: KnowledgeGraphSemanticEdge[],
  semanticGroups: KnowledgeGraphSemanticGroup[],
  nodes: KnowledgeGraphNode[],
): void {
  const nodeIds = new Set(nodes.map((node) => node.concept_id))

  semanticEdges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source_concept_id)) {
      throw new MalformedKnowledgeGraphResponseError(
        `semantic_edges[${index}].source_concept_id`,
        'a concept_id from nodes',
      )
    }

    if (!nodeIds.has(edge.target_concept_id)) {
      throw new MalformedKnowledgeGraphResponseError(
        `semantic_edges[${index}].target_concept_id`,
        'a concept_id from nodes',
      )
    }
  })

  semanticGroups.forEach((group, groupIndex) => {
    group.members.forEach((member, memberIndex) => {
      if (!nodeIds.has(member.concept_id)) {
        throw new MalformedKnowledgeGraphResponseError(
          `semantic_groups[${groupIndex}].members[${memberIndex}].concept_id`,
          'a concept_id from nodes',
        )
      }
    })
  })
}

function parseOwnerSemanticEdges(record: Record<string, unknown>, viewer: KnowledgeGraphViewer): KnowledgeGraphSemanticEdge[] {
  if (!('semantic_edges' in record)) {
    return []
  }

  const semanticEdges = parseSemanticEdges(record.semantic_edges, 'semantic_edges')

  if (!viewer.is_owner && semanticEdges.length > 0) {
    throw new MalformedKnowledgeGraphResponseError('semantic_edges', 'absent from public graph responses')
  }

  return viewer.is_owner ? semanticEdges : []
}

function parseOwnerSemanticGroups(record: Record<string, unknown>, viewer: KnowledgeGraphViewer): KnowledgeGraphSemanticGroup[] {
  if (!('semantic_groups' in record)) {
    return []
  }

  const semanticGroups = parseSemanticGroups(record.semantic_groups, 'semantic_groups')

  if (!viewer.is_owner && semanticGroups.length > 0) {
    throw new MalformedKnowledgeGraphResponseError('semantic_groups', 'absent from public graph responses')
  }

  return viewer.is_owner ? semanticGroups : []
}

function parseRebuildSummary(value: unknown, path: string): KnowledgeGraphRebuildSummary {
  const record = assertRecord(value, path)
  const summary: KnowledgeGraphRebuildSummary = {}

  Object.entries(record).forEach(([key, entryValue]) => {
    summary[key] = assertNonNegativeInteger(entryValue, `${path}.${key}`)
  })

  return summary
}

function parseInsightsSummaryStates(value: unknown, path: string): Record<string, number> {
  const record = assertRecord(value, path)
  const states: Record<string, number> = {}

  Object.entries(record).forEach(([key, entryValue]) => {
    states[key] = assertNonNegativeInteger(entryValue, `${path}.${key}`)
  })

  return states
}

function parseInsightsSummary(value: unknown, path: string): KnowledgeGraphInsightsSummary {
  const record = assertRecord(value, path)

  return {
    concept_count: assertNonNegativeInteger(record.concept_count, `${path}.concept_count`),
    recommendation_count: assertNonNegativeInteger(record.recommendation_count, `${path}.recommendation_count`),
    states: parseInsightsSummaryStates(record.states, `${path}.states`),
  }
}


function assertPositiveInteger(value: unknown, path: string): number {
  const parsed = assertNonNegativeInteger(value, path)

  if (parsed < 1) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a positive integer')
  }

  return parsed
}

function assertRatioNumber(value: unknown, path: string): number {
  const parsed = typeof value === 'string' && DECIMAL_STRING_PATTERN.test(value) ? Number.parseFloat(value) : assertNumber(value, path)

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new MalformedKnowledgeGraphResponseError(path, 'a number between 0 and 1')
  }

  return parsed
}

function assertSafeRecommendationPrimitive(value: unknown, path: string): string | number | boolean | null {
  if (value === null || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return assertSafeEvidenceString(value, path)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new MalformedKnowledgeGraphResponseError(path, 'safe aggregate evidence value')
    }
    return value
  }

  throw new MalformedKnowledgeGraphResponseError(path, 'a safe primitive evidence value')
}

function parseSafeActionPayload(value: unknown, path: string, options: { dropUnknown?: boolean } = {}): KnowledgeGraphSafeActionPayload {
  const record = assertRecord(value, path)
  const payload: KnowledgeGraphSafeActionPayload = {}
  const allowedKeys = new Set(['query', 'tag', 'search', 'order', 'page'])

  Object.entries(record).forEach(([key, entryValue]) => {
    if (!allowedKeys.has(key)) {
      if (options.dropUnknown) {
        return
      }
      throw new MalformedKnowledgeGraphResponseError(path + '.' + key, 'a safe discovery action payload field')
    }
    assertSafeEvidenceKey(key, path + '.' + key)

    if (key === 'tag') {
      if (Array.isArray(entryValue)) {
        payload.tag = entryValue.map((tag, index) => assertSafeEvidenceString(assertString(tag, path + '.tag[' + index + ']'), path + '.tag[' + index + ']'))
      } else {
        payload.tag = assertSafeEvidenceString(assertString(entryValue, path + '.tag'), path + '.tag')
      }
      return
    }

    if (key === 'page') {
      if (typeof entryValue !== 'number' && typeof entryValue !== 'string') {
        throw new MalformedKnowledgeGraphResponseError(path + '.page', 'a safe page value')
      }
      payload.page = entryValue
      return
    }

    payload[key as 'query' | 'search' | 'order'] = assertSafeEvidenceString(
      assertString(entryValue, path + '.' + key),
      path + '.' + key,
    )
  })

  return payload
}

function assertRecommendationActionType(value: unknown, path: string): KnowledgeGraphRecommendationActionType {
  const parsed = assertNonEmptyString(value, path)

  if (!KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES.includes(parsed as KnowledgeGraphRecommendationActionType)) {
    throw new MalformedKnowledgeGraphResponseError(
      path,
      'one of ' + KNOWLEDGE_GRAPH_RECOMMENDATION_ACTION_TYPES.join(', '),
    )
  }

  return parsed as KnowledgeGraphRecommendationActionType
}

function parseInsightAction(value: unknown, path: string): KnowledgeGraphInsightAction {
  const record = assertRecord(value, path)

  return {
    type: assertRecommendationActionType(record.type, path + '.type'),
    payload: parseSafeActionPayload(record.payload, path + '.payload', { dropUnknown: true }),
  }
}


function parseInsightActionV2(value: unknown, path: string): KnowledgeGraphInsightAction {
  const record = assertRecord(value, path)

  return {
    type: assertRecommendationActionType(record.type, path + '.type'),
    payload: parseSafeActionPayload(record.payload, path + '.payload'),
  }
}

function parseInsightRecommendation(value: unknown, path: string): KnowledgeGraphInsightRecommendation {
  const record = assertRecord(value, path)

  return {
    id: assertNonEmptyString(record.id, path + '.id'),
    priority: assertString(record.priority, path + '.priority'),
    label: assertString(record.label, path + '.label'),
    reason_code: assertString(record.reason_code, path + '.reason_code'),
    action: parseInsightAction(record.action, path + '.action'),
  }
}

function parseInsightRecommendations(value: unknown, path: string): KnowledgeGraphInsightRecommendation[] {
  return assertArray(value, path).map((entry, index) => parseInsightRecommendation(entry, path + '[' + index + ']'))
}

function parseRecommendationTargetConcept(value: unknown, path: string): KnowledgeGraphRecommendationTargetConcept {
  const record = assertRecord(value, path)

  return {
    concept_id: assertNonNegativeInteger(record.concept_id, path + '.concept_id'),
    slug: assertNonEmptyString(record.slug, path + '.slug'),
    name: assertString(record.name, path + '.name'),
  }
}

function parseRecommendationTarget(value: unknown, path: string): KnowledgeGraphRecommendationV2Target {
  const record = assertRecord(value, path)
  const allowedTargetKeys = new Set(['concept', 'discovery', 'neighbours', 'group'])

  Object.keys(record).forEach((key) => {
    if (!allowedTargetKeys.has(key)) {
      throw new MalformedKnowledgeGraphResponseError(path + '.' + key, 'a safe recommendation target field')
    }
  })

  const parsed: KnowledgeGraphRecommendationV2Target = {
    concept: parseRecommendationTargetConcept(record.concept, path + '.concept'),
    discovery: parseSafeActionPayload(record.discovery, path + '.discovery'),
    neighbours: [],
    group: null,
  }

  if ('neighbours' in record) {
    parsed.neighbours = assertArray(record.neighbours, path + '.neighbours').map((entry, index) => (
      parseRecommendationTargetConcept(entry, path + '.neighbours[' + index + ']')
    ))
  }

  if ('group' in record) {
    if (record.group === null) {
      parsed.group = null
    } else {
      const group = assertRecord(record.group, path + '.group')
      parsed.group = {
        group_key: assertNonEmptyString(group.group_key, path + '.group.group_key'),
        label: assertString(group.label, path + '.group.label'),
      }
    }
  }

  return parsed
}

function parseRecommendationEvidenceEntry(value: unknown, path: string): KnowledgeGraphRecommendationV2EvidenceEntry {
  const record = assertRecord(value, path)

  return {
    code: assertSafeEvidenceString(assertNonEmptyString(record.code, path + '.code'), path + '.code'),
    label: assertSafeEvidenceString(assertString(record.label, path + '.label'), path + '.label'),
    value: assertSafeRecommendationPrimitive(record.value, path + '.value'),
    weight: assertRatioNumber(record.weight, path + '.weight'),
  }
}

function parseRecommendationEvidence(value: unknown, path: string): KnowledgeGraphRecommendationV2EvidenceEntry[] {
  return assertArray(value, path).map((entry, index) => parseRecommendationEvidenceEntry(entry, path + '[' + index + ']'))
}

function parseInsightRecommendationV2(value: unknown, path: string): KnowledgeGraphInsightRecommendationV2 {
  const record = assertRecord(value, path)

  return {
    rank: assertPositiveInteger(record.rank, path + '.rank'),
    id: assertNonEmptyString(record.id, path + '.id'),
    score: assertRatioNumber(record.score, path + '.score'),
    confidence: assertRatioNumber(record.confidence, path + '.confidence'),
    priority: assertString(record.priority, path + '.priority'),
    label: assertString(record.label, path + '.label'),
    reason_code: assertString(record.reason_code, path + '.reason_code'),
    target: parseRecommendationTarget(record.target, path + '.target'),
    action: parseInsightActionV2(record.action, path + '.action'),
    evidence: parseRecommendationEvidence(record.evidence, path + '.evidence'),
  }
}

function parseTopLevelInsightRecommendations(record: Record<string, unknown>, viewer: KnowledgeGraphViewer): KnowledgeGraphInsightRecommendationV2[] {
  if (!('recommendations' in record)) {
    return []
  }

  const recommendations = assertArray(record.recommendations, 'recommendations')
    .map((entry, index) => parseInsightRecommendationV2(entry, 'recommendations[' + index + ']'))

  if (!viewer.is_owner && recommendations.length > 0) {
    throw new MalformedKnowledgeGraphResponseError('recommendations', 'absent from public insights responses')
  }

  return viewer.is_owner ? recommendations : []
}

function parseInsightConceptEntry(value: unknown, path: string): KnowledgeGraphInsightConceptEntry {
  const record = assertRecord(value, path)

  return {
    concept_id: assertNonNegativeInteger(record.concept_id, `${path}.concept_id`),
    slug: assertNonEmptyString(record.slug, `${path}.slug`),
    name: assertString(record.name, `${path}.name`),
    total_weight: assertDecimalString(record.total_weight, `${path}.total_weight`),
    source_count: assertNonNegativeInteger(record.source_count, `${path}.source_count`),
    related_question_count: assertNonNegativeInteger(record.related_question_count, `${path}.related_question_count`),
    semantic_state: assertString(record.semantic_state, `${path}.semantic_state`),
    tone_token: assertString(record.tone_token, `${path}.tone_token`),
    recommendations: parseInsightRecommendations(record.recommendations, `${path}.recommendations`),
  }
}

function parseInsightConcepts(value: unknown, path: string): KnowledgeGraphInsightConceptEntry[] {
  return assertArray(value, path).map((entry, index) => parseInsightConceptEntry(entry, `${path}[${index}]`))
}

export function parseUserKnowledgeGraphResponse(value: unknown): UserKnowledgeGraphResponse {
  const record = assertRecord(value, 'root')
  const viewer = parseViewer(record.viewer, 'viewer')

  if (!viewer.is_owner && 'recommendations' in record) {
    throw new MalformedKnowledgeGraphResponseError('recommendations', 'absent from public graph responses')
  }
  const nodes = parseNodes(record.nodes, 'nodes')
  const edges = parseEdges(record.edges, 'edges')
  const semanticEdges = parseOwnerSemanticEdges(record, viewer)
  const semanticGroups = parseOwnerSemanticGroups(record, viewer)

  validateEdgeEndpoints(edges, nodes)
  validateSemanticReferences(semanticEdges, semanticGroups, nodes)

  const parsed: UserKnowledgeGraphResponse = {
    user_id: assertUuidString(record.user_id, 'user_id'),
    viewer,
    state: parseGraphState(record.state, 'state'),
    total_weight: assertDecimalString(record.total_weight, 'total_weight'),
    activity_breakdown: parseActivityBreakdown(record.activity_breakdown, 'activity_breakdown'),
    concepts: parseConcepts(record.concepts, 'concepts'),
    nodes,
    edges,
    semantic_edges: semanticEdges,
    semantic_groups: semanticGroups,
  }

  if ('layout' in record) {
    parsed.layout = parseKnowledgeGraphLayout(record.layout)
  }

  return parsed
}

export function parseUserKnowledgeGraphInsightsResponse(value: unknown): UserKnowledgeGraphInsightsResponse {
  const record = assertRecord(value, 'root')
  const viewer = parseViewer(record.viewer, 'viewer')

  return {
    user_id: assertUuidString(record.user_id, 'user_id'),
    viewer,
    state: parseInsightsGraphState(record.state, 'state'),
    summary: parseInsightsSummary(record.summary, 'summary'),
    recommendations: parseTopLevelInsightRecommendations(record, viewer),
    concepts: parseInsightConcepts(record.concepts, 'concepts'),
  }
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

export async function fetchOwnKnowledgeGraphInsights(): Promise<UserKnowledgeGraphInsightsResponse> {
  const response = await http.get<unknown>('/knowledge-graph/me/insights/')

  return parseUserKnowledgeGraphInsightsResponse(response.data)
}

export const KNOWLEDGE_GRAPH_REBUILD_REQUEST_TIMEOUT_MS = 120_000

export async function rebuildOwnKnowledgeGraph(): Promise<KnowledgeGraphRebuildResponse> {
  const response = await http.post<unknown>('/knowledge-graph/me/rebuild/', undefined, {
    timeout: KNOWLEDGE_GRAPH_REBUILD_REQUEST_TIMEOUT_MS,
  })

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
