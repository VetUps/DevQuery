<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import type {
  KnowledgeGraphConceptEntry,
  KnowledgeGraphSafeEvidencePayload,
  KnowledgeGraphSafeEvidenceValue,
  KnowledgeGraphSemanticGroup,
  KnowledgeGraphSemanticGroupMember,
} from '@/features/knowledge/api/knowledgeGraph'

type SemanticStatus = 'fresh' | 'stale' | 'rebuilding' | 'failed' | 'unknown'

interface VisibleSemanticGroup {
  group: KnowledgeGraphSemanticGroup
  members: KnowledgeGraphSemanticGroupMember[]
}

const props = withDefaults(defineProps<{
  groups: KnowledgeGraphSemanticGroup[]
  concepts: KnowledgeGraphConceptEntry[]
  visibleConceptIds: Set<number>
  graphStatus?: SemanticStatus
  hasQueryError?: boolean
}>(), {
  graphStatus: 'unknown',
  hasQueryError: false,
})

const emit = defineEmits<{
  memberSelected: [conceptId: number]
}>()

const selectedGroupKey = shallowRef<string>('')

const conceptLookup = computed(() => {
  const map = new Map<number, KnowledgeGraphConceptEntry>()

  for (const concept of props.concepts) {
    map.set(concept.concept_id, concept)
  }

  return map
})

const visibleGroups = computed<VisibleSemanticGroup[]>(() => {
  return props.groups
    .map((group) => ({
      group,
      members: group.members.filter((member) => props.visibleConceptIds.has(member.concept_id)),
    }))
    .filter((entry) => entry.members.length > 0)
})

const hasGroups = computed(() => visibleGroups.value.length > 0)
const selectedGroup = computed(() => {
  if (!selectedGroupKey.value) {
    return visibleGroups.value[0] ?? null
  }

  return visibleGroups.value.find((entry) => entry.group.group_key === selectedGroupKey.value) ?? visibleGroups.value[0] ?? null
})

const statusCopy = computed(() => {
  if (props.hasQueryError) {
    return 'Семантическое обогащение временно недоступно. Базовый граф, список и перестроение остаются доступными.'
  }

  if (props.graphStatus === 'stale') {
    return 'Граф может быть устаревшим: группы показаны как последняя безопасная агрегированная версия.'
  }

  if (props.graphStatus === 'rebuilding') {
    return 'Граф обновляется. Семантические группы могут появиться после завершения перестроения.'
  }

  if (props.graphStatus === 'failed') {
    return 'Последнее перестроение не завершилось. Семантические группы могут быть неполными.'
  }

  return hasGroups.value
    ? `Доступно групп: ${visibleGroups.value.length}.`
    : 'Семантические группы пока не найдены. Базовый граф и список остаются доступными.'
})

function selectGroup(groupKey: string): void {
  selectedGroupKey.value = groupKey
}

function selectMember(conceptId: number): void {
  if (!props.visibleConceptIds.has(conceptId)) {
    return
  }

  emit('memberSelected', conceptId)
}

function hiddenMemberCount(entry: VisibleSemanticGroup): number {
  return Math.max(entry.group.members.length - entry.members.length, 0)
}

function formatDecimal(value: string): string {
  const parsed = Number.parseFloat(value)

  if (!Number.isFinite(parsed)) {
    return '0'
  }

  return parsed.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'дата не указана'
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function memberLabel(member: KnowledgeGraphSemanticGroupMember): string {
  const concept = conceptLookup.value.get(member.concept_id)

  return concept?.name || member.name || member.slug || `Концепт ${member.concept_id}`
}

function evidenceSummary(evidence: KnowledgeGraphSafeEvidencePayload): string {
  const count = countEvidenceSignals(evidence)

  if (count === 0) {
    return 'Агрегированных подтверждений пока нет.'
  }

  if (count === 1) {
    return '1 агрегированный сигнал.'
  }

  if (count > 1 && count < 5) {
    return `${count} агрегированных сигнала.`
  }

  return `${count} агрегированных сигналов.`
}

function countEvidenceSignals(value: KnowledgeGraphSafeEvidenceValue): number {
  if (value === null || typeof value === 'boolean') {
    return 0
  }

  if (typeof value === 'number') {
    return value > 0 ? 1 : 0
  }

  if (typeof value === 'string') {
    return value.trim() ? 1 : 0
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + countEvidenceSignals(entry), 0)
  }

  return Object.values(value).reduce((sum, entry) => sum + countEvidenceSignals(entry), 0)
}

watch(
  visibleGroups,
  (groups) => {
    if (groups.length === 0) {
      selectedGroupKey.value = ''
      return
    }

    if (!groups.some((entry) => entry.group.group_key === selectedGroupKey.value)) {
      selectedGroupKey.value = groups[0].group.group_key
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="semantic-groups" data-testid="knowledge-semantic-groups-panel" aria-labelledby="knowledge-semantic-groups-title">
    <header class="semantic-groups__header">
      <div>
        <p class="semantic-groups__eyebrow">Семантические группы</p>
        <h3 id="knowledge-semantic-groups-title">Как темы связаны по смыслу</h3>
      </div>
      <span class="semantic-groups__count" data-testid="knowledge-semantic-groups-count">
        {{ visibleGroups.length }}
      </span>
    </header>

    <p class="semantic-groups__status" data-testid="knowledge-semantic-groups-status" aria-live="polite">
      {{ statusCopy }}
    </p>

    <p v-if="!hasGroups" class="semantic-groups__empty" data-testid="knowledge-semantic-groups-empty">
      Семантические группы появятся после достаточного количества безопасных агрегированных сигналов.
    </p>

    <div v-else class="semantic-groups__layout">
      <div class="semantic-groups__list" role="list" aria-label="Список семантических групп">
        <button
          v-for="entry in visibleGroups"
          :key="entry.group.group_key"
          type="button"
          class="semantic-groups__card"
          :class="{ 'semantic-groups__card--selected': selectedGroup?.group.group_key === entry.group.group_key }"
          :data-testid="`knowledge-semantic-group-card-${entry.group.group_key}`"
          :aria-pressed="selectedGroup?.group.group_key === entry.group.group_key"
          @click="selectGroup(entry.group.group_key)"
          @focus="selectGroup(entry.group.group_key)"
        >
          <span class="semantic-groups__card-title">{{ entry.group.label || 'Группа без названия' }}</span>
          <span class="semantic-groups__card-meta">
            {{ entry.members.length }} из {{ entry.group.members.length }} концептов · уверенность {{ formatDecimal(entry.group.confidence) }}
          </span>
          <span class="semantic-groups__card-description">
            {{ entry.group.description || entry.group.rationale || 'Описание группы пока недоступно.' }}
          </span>
        </button>
      </div>

      <article
        v-if="selectedGroup"
        class="semantic-groups__details"
        data-testid="knowledge-semantic-group-selected-details"
        aria-live="polite"
      >
        <p class="semantic-groups__eyebrow">Выбранная группа</p>
        <h4>{{ selectedGroup.group.label || 'Группа без названия' }}</h4>
        <p>{{ selectedGroup.group.description || 'Описание группы пока недоступно.' }}</p>
        <p>{{ selectedGroup.group.rationale || 'Объяснение будет доступно после следующего безопасного пересчёта.' }}</p>
        <dl class="semantic-groups__facts">
          <div>
            <dt>Уверенность</dt>
            <dd>{{ formatDecimal(selectedGroup.group.confidence) }}</dd>
          </div>
          <div>
            <dt>Сформировано</dt>
            <dd>{{ formatDateTime(selectedGroup.group.generated_at) }}</dd>
          </div>
          <div>
            <dt>Подтверждения</dt>
            <dd>{{ evidenceSummary(selectedGroup.group.evidence) }}</dd>
          </div>
        </dl>

        <ul class="semantic-groups__members" data-testid="knowledge-semantic-group-members" aria-label="Концепты выбранной семантической группы">
          <li v-for="member in selectedGroup.members" :key="member.concept_id" class="semantic-groups__member">
            <button
              type="button"
              class="semantic-groups__member-button"
              :data-testid="`knowledge-semantic-group-member-${member.concept_id}`"
              @click="selectMember(member.concept_id)"
            >
              <span class="semantic-groups__member-name">{{ memberLabel(member) }}</span>
              <span>Открыть детали концепта</span>
            </button>
            <span>ранг {{ member.rank }}</span>
            <span>уверенность {{ formatDecimal(member.confidence) }}</span>
            <span>{{ evidenceSummary(member.evidence) }}</span>
          </li>
        </ul>
        <p
          v-if="hiddenMemberCount(selectedGroup) > 0"
          class="semantic-groups__hidden-members"
          data-testid="knowledge-semantic-group-hidden-members"
        >
          Скрыто фильтрами: {{ hiddenMemberCount(selectedGroup) }}. Эти концепты не доступны для выбора в текущей топологии.
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.semantic-groups,
.semantic-groups__layout,
.semantic-groups__details,
.semantic-groups__members {
  display: grid;
  gap: var(--space-md);
}

.semantic-groups__header,
.semantic-groups__facts,
.semantic-groups__member {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: flex-start;
  justify-content: space-between;
}

.semantic-groups__eyebrow,
.semantic-groups__status,
.semantic-groups__empty,
.semantic-groups__hidden-members,
.semantic-groups__details h4,
.semantic-groups__details p,
.semantic-groups__facts,
.semantic-groups__facts dd {
  margin: 0;
}

.semantic-groups__eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.semantic-groups__count {
  display: inline-grid;
  min-width: 36px;
  min-height: 36px;
  place-items: center;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-weight: 800;
}

.semantic-groups__status,
.semantic-groups__empty,
.semantic-groups__card-meta,
.semantic-groups__card-description,
.semantic-groups__hidden-members,
.semantic-groups__member {
  color: var(--color-muted);
}

.semantic-groups__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-sm);
}

.semantic-groups__card {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.74);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.semantic-groups__card:hover,
.semantic-groups__card:focus-visible,
.semantic-groups__card--selected {
  border-color: rgb(14 116 144 / 0.55);
  outline: 3px solid rgb(14 116 144 / 0.18);
  outline-offset: 2px;
}

.semantic-groups__card-title,
.semantic-groups__member-name {
  color: var(--color-text);
  font-weight: 800;
}

.semantic-groups__member-button {
  display: inline-grid;
  gap: 2px;
  min-height: 40px;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid rgb(14 116 144 / 0.2);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.78);
  color: var(--color-muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.semantic-groups__member-button:hover,
.semantic-groups__member-button:focus-visible {
  border-color: rgb(14 116 144 / 0.55);
  outline: 3px solid rgb(14 116 144 / 0.18);
  outline-offset: 2px;
}

.semantic-groups__card-meta,
.semantic-groups__member {
  font-size: 14px;
}

.semantic-groups__details {
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.14);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgb(236 254 255 / 0.72), rgb(255 255 255 / 0.84));
}

.semantic-groups__facts {
  justify-content: flex-start;
}

.semantic-groups__facts div {
  display: grid;
  gap: 2px;
}

.semantic-groups__facts dt {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.semantic-groups__facts dd {
  color: var(--color-text);
  font-weight: 800;
}

.semantic-groups__members {
  padding: 0;
  margin: 0;
  list-style: none;
}

.semantic-groups__member {
  padding: var(--space-sm) 0;
  border-top: 1px solid rgb(14 116 144 / 0.12);
  justify-content: flex-start;
}
</style>
