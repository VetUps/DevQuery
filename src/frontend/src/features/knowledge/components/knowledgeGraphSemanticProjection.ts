import type {
  KnowledgeGraphNode,
  KnowledgeGraphSemanticGraphMetadata,
  KnowledgeGraphSemanticGroup,
  KnowledgeGraphSemanticGroupMember,
  KnowledgeGraphSemanticLifecycleCounts,
  KnowledgeGraphSemanticLifecycleStatus,
} from '@/features/knowledge/api/knowledgeGraph'

export type KnowledgeGraphProjectionMode = 'structural' | 'semantic'

export interface KnowledgeGraphSemanticProjectionMember {
  conceptId: number
  label: string
  rank: number
  visible: boolean
}

export interface KnowledgeGraphSemanticProjectionArea {
  key: string
  label: string
  description: string
  lifecycleStatus: KnowledgeGraphSemanticLifecycleStatus
  lifecycleLabel: string
  lifecycleReasonCode: string
  memberCount: number
  visibleMemberCount: number
  hiddenMemberCount: number
  members: KnowledgeGraphSemanticProjectionMember[]
  ariaLabel: string
}

export interface KnowledgeGraphSemanticProjectionSummary {
  available: boolean
  status: string
  reasonCode: string
  phase: string
  visibleGroupCount: number
  visibleMemberCount: number
  lifecycleCounts: Required<KnowledgeGraphSemanticLifecycleCounts>
  areas: KnowledgeGraphSemanticProjectionArea[]
  state: 'available' | 'degraded' | 'empty' | 'unavailable'
  stateCopy: string
}

const LIFECYCLE_LABELS: Record<KnowledgeGraphSemanticLifecycleStatus, string> = {
  active: 'Активная',
  stale: 'Устаревшая',
  archived: 'Архивная',
}

const FALLBACK_LIFECYCLE_COUNTS: Required<KnowledgeGraphSemanticLifecycleCounts> = {
  active: 0,
  stale: 0,
  archived: 0,
}

function safeText(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim()

  return trimmed.length > 0 ? trimmed : fallback
}

function conceptLabel(node: KnowledgeGraphNode | undefined, member: KnowledgeGraphSemanticGroupMember): string {
  return safeText(node?.name, safeText(member.name, safeText(node?.slug, safeText(member.slug, `Концепт ${member.concept_id}`))))
}

function buildLifecycleCounts(
  metadata: KnowledgeGraphSemanticGraphMetadata | undefined,
  groups: KnowledgeGraphSemanticGroup[],
): Required<KnowledgeGraphSemanticLifecycleCounts> {
  if (metadata) {
    return {
      active: metadata.lifecycle_counts.active,
      stale: metadata.lifecycle_counts.stale,
      archived: metadata.lifecycle_counts.archived ?? 0,
    }
  }

  return groups.reduce<Required<KnowledgeGraphSemanticLifecycleCounts>>((counts, group) => {
    counts[group.lifecycle_status] += 1
    return counts
  }, { ...FALLBACK_LIFECYCLE_COUNTS })
}

function buildStateCopy(state: KnowledgeGraphSemanticProjectionSummary['state']): string {
  if (state === 'unavailable') {
    return 'Семантическая проекция пока недоступна. Структурный граф остаётся доступен.'
  }

  if (state === 'empty') {
    return 'Семантические группы пока не найдены. Структурный граф остаётся доступен.'
  }

  if (state === 'degraded') {
    return 'Семантическая проекция доступна частично. Проверьте статус и продолжайте пользоваться структурным графом.'
  }

  return 'Семантическая проекция построена по видимым группам.'
}

export function buildKnowledgeGraphSemanticProjection(
  groups: KnowledgeGraphSemanticGroup[] = [],
  nodes: KnowledgeGraphNode[] = [],
  metadata?: KnowledgeGraphSemanticGraphMetadata,
): KnowledgeGraphSemanticProjectionSummary {
  const nodeById = new Map(nodes.map((node) => [node.concept_id, node]))
  const visibleNodeIds = new Set(nodeById.keys())
  const areas = groups.map<KnowledgeGraphSemanticProjectionArea>((group) => {
    const members = group.members.map<KnowledgeGraphSemanticProjectionMember>((member) => {
      const node = nodeById.get(member.concept_id)
      return {
        conceptId: member.concept_id,
        label: conceptLabel(node, member),
        rank: member.rank,
        visible: visibleNodeIds.has(member.concept_id),
      }
    })
    const visibleMemberCount = members.filter((member) => member.visible).length
    const memberCount = group.member_count || members.length
    const hiddenMemberCount = Math.max(0, memberCount - visibleMemberCount)
    const label = safeText(group.label, `Семантическая группа ${group.group_key}`)
    const description = safeText(group.description, 'Описание семантической группы пока недоступно.')
    const lifecycleLabel = LIFECYCLE_LABELS[group.lifecycle_status]

    return {
      key: group.group_key,
      label,
      description,
      lifecycleStatus: group.lifecycle_status,
      lifecycleLabel,
      lifecycleReasonCode: group.lifecycle_reason_code,
      memberCount,
      visibleMemberCount,
      hiddenMemberCount,
      members,
      ariaLabel: `${label}. ${lifecycleLabel}. Видимых концептов: ${visibleMemberCount} из ${memberCount}.`,
    }
  })
  const lifecycleCounts = buildLifecycleCounts(metadata, groups)
  const visibleGroupCount = metadata?.visible_group_count ?? areas.length
  const visibleMemberCount = metadata?.visible_member_count ?? areas.reduce((count, area) => count + area.visibleMemberCount, 0)
  const available = metadata?.available ?? areas.length > 0
  const status = metadata?.status ?? (available ? 'available' : 'pending')
  const reasonCode = metadata?.reason_code ?? ''
  const phase = metadata?.phase ?? ''
  const state: KnowledgeGraphSemanticProjectionSummary['state'] = !available
    ? 'unavailable'
    : areas.length === 0
      ? 'empty'
      : status === 'degraded' || status === 'stale' || lifecycleCounts.stale > 0
        ? 'degraded'
        : 'available'

  return {
    available,
    status,
    reasonCode,
    phase,
    visibleGroupCount,
    visibleMemberCount,
    lifecycleCounts,
    areas,
    state,
    stateCopy: buildStateCopy(state),
  }
}
