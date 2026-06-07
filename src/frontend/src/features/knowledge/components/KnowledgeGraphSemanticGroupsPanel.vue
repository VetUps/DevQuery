<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
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
  selectedGroupKey.value = selectedGroupKey.value === groupKey ? '' : groupKey
}

function isGroupExpanded(groupKey: string): boolean {
  return selectedGroupKey.value === groupKey
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

    if (selectedGroupKey.value && !groups.some((entry) => entry.group.group_key === selectedGroupKey.value)) {
      selectedGroupKey.value = ''
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
        <article
          v-for="entry in visibleGroups"
          :key="entry.group.group_key"
          class="semantic-groups__expander"
          :class="{ 'semantic-groups__expander--open': isGroupExpanded(entry.group.group_key) }"
          role="listitem"
        >
          <button
            type="button"
            class="semantic-groups__card"
            :data-testid="`knowledge-semantic-group-card-${entry.group.group_key}`"
            :aria-expanded="isGroupExpanded(entry.group.group_key)"
            :aria-controls="`knowledge-semantic-group-details-${entry.group.group_key}`"
            @click="selectGroup(entry.group.group_key)"
          >
            <span class="semantic-groups__card-title">{{ entry.group.label || 'Группа без названия' }}</span>
            <span class="semantic-groups__card-meta">
              {{ entry.members.length }} из {{ entry.group.members.length }} концептов · уверенность {{ formatDecimal(entry.group.confidence) }}
            </span>
            <span class="semantic-groups__card-description">
              {{ entry.group.description || entry.group.rationale || 'Описание группы пока недоступно.' }}
            </span>
            <span class="semantic-groups__card-indicator" aria-hidden="true">{{ isGroupExpanded(entry.group.group_key) ? '−' : '+' }}</span>
          </button>

          <div
            v-if="isGroupExpanded(entry.group.group_key)"
            :id="`knowledge-semantic-group-details-${entry.group.group_key}`"
            class="semantic-groups__details"
            :data-testid="`knowledge-semantic-group-details-${entry.group.group_key}`"
            aria-live="polite"
          >
            <p class="semantic-groups__eyebrow">Группа концептов</p>
            <h4>{{ entry.group.label || 'Группа без названия' }}</h4>
            <p>{{ entry.group.description || 'Описание группы пока недоступно.' }}</p>
            <p>{{ entry.group.rationale || 'Объяснение будет доступно после следующего безопасного пересчёта.' }}</p>
            <dl class="semantic-groups__facts">
              <div>
                <dt>Уверенность</dt>
                <dd>{{ formatDecimal(entry.group.confidence) }}</dd>
              </div>
              <div>
                <dt>Сформировано</dt>
                <dd>{{ formatDateTime(entry.group.generated_at) }}</dd>
              </div>
              <div>
                <dt>Подтверждения</dt>
                <dd>{{ evidenceSummary(entry.group.evidence) }}</dd>
              </div>
            </dl>

            <ul class="semantic-groups__members" data-testid="knowledge-semantic-group-members" aria-label="Концепты выбранной семантической группы">
              <li v-for="member in entry.members" :key="member.concept_id" class="semantic-groups__member">
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
              v-if="hiddenMemberCount(entry) > 0"
              class="semantic-groups__hidden-members"
              data-testid="knowledge-semantic-group-hidden-members"
            >
              Скрыто фильтрами: {{ hiddenMemberCount(entry) }}. Эти концепты не доступны для выбора в текущей топологии.
            </p>
          </div>
        </article>
      </div>
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
  gap: var(--space-sm);
}

.semantic-groups__expander {
  overflow: hidden;
  border: 1px solid rgb(14 116 144 / 0.12);
  border-radius: calc(var(--radius-lg) + 4px);
  background: rgb(255 255 255 / 0.56);
  box-shadow: 0 12px 30px rgb(14 116 144 / 0.07);
}

.semantic-groups__card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-xs) var(--space-md);
  width: 100%;
  min-height: 72px;
  padding: var(--space-md);
  border: 0;
  background: rgb(255 255 255 / 0.74);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition-property: background-color, transform;
  transition-duration: 160ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.semantic-groups__card:hover,
.semantic-groups__card:focus-visible,
.semantic-groups__expander--open .semantic-groups__card {
  background: rgb(236 254 255 / 0.68);
  outline: none;
}

.semantic-groups__card:active {
  transform: scale(0.99);
}

.semantic-groups__card-indicator {
  grid-row: 1 / span 3;
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
  align-self: center;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-weight: 900;
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
  display: grid;
  gap: var(--space-md);
  padding: var(--space-md);
  border-top: 1px solid rgb(14 116 144 / 0.12);
  background: linear-gradient(135deg, rgb(236 254 255 / 0.72), rgb(255 255 255 / 0.84));
  animation: semantic-group-slide-in 180ms cubic-bezier(0.2, 0, 0, 1);
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

@keyframes semantic-group-slide-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
