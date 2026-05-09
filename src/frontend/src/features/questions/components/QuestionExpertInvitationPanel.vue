<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import {
  MalformedExpertInvitationResponseError,
  normalizeExpertInvitationError,
  type EligibleExpertCandidate,
  type InvitedExpertInvitation,
} from '@/features/questions/api/questionExpertInvitations'
import { useCreateExpertInvitationsMutation } from '@/features/questions/mutations/useCreateExpertInvitationsMutation'
import { useEligibleExpertsQuery } from '@/features/questions/queries/useEligibleExpertsQuery'
import { useInvitedExpertInvitationsQuery } from '@/features/questions/queries/useInvitedExpertInvitationsQuery'
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

interface Props {
  questionId: string
  enabled: boolean
}

const props = defineProps<Props>()

const search = shallowRef('')
const selectedIds = shallowRef<string[]>([])
const mutationError = shallowRef('')
const successMessage = shallowRef('')

const eligibleExpertsQuery = useEligibleExpertsQuery(
  () => props.questionId,
  search,
  () => props.enabled,
)
const invitedExpertsQuery = useInvitedExpertInvitationsQuery(() => props.questionId, () => props.enabled)
const createInvitationsMutation = useCreateExpertInvitationsMutation()

const envelope = computed(() => eligibleExpertsQuery.data.value)
const candidates = computed(() => envelope.value?.results ?? [])
const invitedEnvelope = computed(() => invitedExpertsQuery.data.value)
const invitedExperts = computed(() => invitedEnvelope.value?.results ?? [])
const remainingSlots = computed(() => envelope.value?.remaining_slots ?? 0)
const invitedCount = computed(() => envelope.value?.invited_count ?? invitedEnvelope.value?.invited_count ?? 0)
const maxInvites = computed(() => envelope.value?.max_invites ?? 0)
const canInvite = computed(() => Boolean(envelope.value?.can_invite))
const selectedCount = computed(() => selectedIds.value.length)
const isSelectionOverLimit = computed(() => selectedCount.value > remainingSlots.value)
const hasNoSlots = computed(() => Boolean(envelope.value) && remainingSlots.value <= 0)
const hasCandidates = computed(() => candidates.value.length > 0)
const hasInvitedExperts = computed(() => invitedExperts.value.length > 0)
const isBusy = computed(() => createInvitationsMutation.isPending.value)
const queryErrorMessage = computed(() => normalizeSelectorError(eligibleExpertsQuery.error.value))
const invitedQueryErrorMessage = computed(() => normalizeInvitedQueryError(invitedExpertsQuery.error.value))
const unavailableMessage = computed(() => getUnavailableMessage(envelope.value?.reason_code))
const submitDisabled = computed(
  () =>
    isBusy.value ||
    !canInvite.value ||
    hasNoSlots.value ||
    selectedCount.value === 0 ||
    isSelectionOverLimit.value,
)
const slotSummary = computed(() => {
  if (!envelope.value) {
    return 'Загрузка доступных слотов приглашений…'
  }

  return `Приглашено ${invitedCount.value} из ${maxInvites.value}. Осталось ${remainingSlots.value}.`
})

watch(
  () => props.questionId,
  () => {
    selectedIds.value = []
    mutationError.value = ''
    successMessage.value = ''
  },
)

function normalizeSelectorError(error: unknown) {
  if (!error) {
    return ''
  }

  if (error instanceof MalformedExpertInvitationResponseError) {
    return 'Не удалось прочитать список экспертов. Попробуйте ещё раз.'
  }

  return normalizeExpertInvitationError(error)
}

function normalizeInvitedQueryError(error: unknown) {
  if (!error) {
    return ''
  }

  if (error instanceof MalformedExpertInvitationResponseError) {
    return 'Не удалось прочитать список уже приглашённых экспертов. Попробуйте ещё раз.'
  }

  return 'Не удалось загрузить уже приглашённых экспертов. Попробуйте ещё раз.'
}

function getUnavailableMessage(reasonCode?: string) {
  switch (reasonCode) {
    case 'slots_exhausted':
      return 'Все слоты приглашений уже использованы.'
    case 'question_not_protected':
      return 'Приглашения доступны только для защищённых вопросов.'
    case 'not_question_author':
      return 'Только автор защищённого вопроса может приглашать экспертов.'
    case 'protected_window_expired':
      return 'Защитное окно вопроса завершилось, новые приглашения больше не нужны.'
    case 'author_not_newcomer':
      return 'Приглашения доступны только для вопросов новых авторов.'
    default:
      return 'Сейчас нельзя отправить приглашение. Проверьте состояние вопроса позже.'
  }
}

function getInvitationStatusLabel(invitation: InvitedExpertInvitation) {
  switch (invitation.invitation_status) {
    case 'active':
      return 'Приглашение активно'
    case 'expired':
      return 'Приглашение истекло'
    case 'read':
      return 'Приглашение прочитано'
    default:
      return 'Статус приглашения уточняется'
  }
}

function getReadStatusLabel(invitation: InvitedExpertInvitation) {
  return invitation.is_read ? 'Уведомление прочитано' : 'Уведомление не прочитано'
}

function getProtectedWindowStatusLabel(invitation: InvitedExpertInvitation) {
  return invitation.protected_window_active ? 'Защитное окно активно' : 'Защитное окно завершено'
}

function isSelected(candidate: EligibleExpertCandidate) {
  return selectedIds.value.includes(candidate.user_id)
}

function isCandidateDisabled(candidate: EligibleExpertCandidate) {
  return !isSelected(candidate) && selectedCount.value >= remainingSlots.value
}

function toggleCandidate(candidate: EligibleExpertCandidate) {
  mutationError.value = ''
  successMessage.value = ''

  if (isSelected(candidate)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== candidate.user_id)
    return
  }

  if (selectedCount.value >= remainingSlots.value) {
    return
  }

  selectedIds.value = [...selectedIds.value, candidate.user_id]
}

async function sendInvitations() {
  mutationError.value = ''
  successMessage.value = ''

  if (submitDisabled.value) {
    if (selectedCount.value === 0) {
      mutationError.value = 'Выберите хотя бы одного эксперта для приглашения.'
    }

    return
  }

  try {
    const response = await createInvitationsMutation.mutateAsync({
      questionId: props.questionId,
      recipientIds: selectedIds.value,
    })

    selectedIds.value = []
    successMessage.value = `Отправлено приглашений: ${response.created_count}. Осталось слотов: ${response.remaining_slots}.`
  } catch (error) {
    mutationError.value = normalizeSelectorError(error)
  }
}
</script>

<template>
  <SurfacePanel class="question-expert-invitation-panel" padding="lg" data-testid="question-expert-invitation-panel">
    <div class="question-expert-invitation-panel__header">
      <p class="question-expert-invitation-panel__eyebrow">Приглашения экспертов</p>
      <h2 class="question-expert-invitation-panel__title">Позвать эксперта или мастера</h2>
      <p class="question-expert-invitation-panel__description">
        Выберите участников, которые смогут быстрее увидеть защищённый вопрос. Итоговое право на приглашение всё равно подтверждает сервер.
      </p>
    </div>

    <p class="question-expert-invitation-panel__slots" data-testid="expert-invitation-slot-summary">
      {{ slotSummary }}
    </p>

    <p
      v-if="successMessage"
      class="question-expert-invitation-panel__feedback question-expert-invitation-panel__feedback--success"
      role="status"
      data-testid="expert-invitation-success"
    >
      {{ successMessage }}
    </p>

    <p
      v-if="mutationError"
      class="question-expert-invitation-panel__feedback question-expert-invitation-panel__feedback--danger"
      role="alert"
      data-testid="expert-invitation-mutation-error"
    >
      {{ mutationError }}
    </p>

    <p
      v-if="envelope && !canInvite"
      class="question-expert-invitation-panel__feedback question-expert-invitation-panel__feedback--muted"
      data-testid="expert-invitation-unavailable"
    >
      {{ unavailableMessage }}
    </p>

    <section
      class="question-expert-invitation-panel__section"
      aria-labelledby="expert-invitation-available-title"
      data-testid="expert-invitation-available-section"
    >
      <div class="question-expert-invitation-panel__section-heading">
        <div>
          <p class="question-expert-invitation-panel__section-kicker">Доступные кандидаты</p>
          <h3 id="expert-invitation-available-title" class="question-expert-invitation-panel__section-title">
            Кого можно пригласить сейчас
          </h3>
        </div>
        <p class="question-expert-invitation-panel__section-note">Поиск влияет только на этот список.</p>
      </div>

      <AppInput
        id="expert-invitation-search"
        v-model="search"
        label="Поиск по имени эксперта"
        placeholder="Например, Vue или Alice"
        data-testid="expert-invitation-search"
      />

      <p
        v-if="eligibleExpertsQuery.isPending.value"
        class="question-expert-invitation-panel__state"
        data-testid="expert-invitation-available-loading"
      >
        Загружаем доступных экспертов…
      </p>

      <div
        v-else-if="eligibleExpertsQuery.isError.value"
        class="question-expert-invitation-panel__state question-expert-invitation-panel__state--danger"
        data-testid="expert-invitation-available-error"
      >
        <p>{{ queryErrorMessage }}</p>
        <AppButton
          type="button"
          variant="secondary"
          size="compact"
          data-testid="expert-invitation-available-retry"
          @click="eligibleExpertsQuery.refetch()"
        >
          Повторить поиск
        </AppButton>
      </div>

      <p
        v-else-if="envelope && !hasCandidates"
        class="question-expert-invitation-panel__state"
        data-testid="expert-invitation-available-empty"
      >
        Подходящие эксперты не найдены или уже приглашены.
      </p>

      <ul v-else class="question-expert-invitation-panel__list" data-testid="expert-invitation-available-list">
        <li
          v-for="candidate in candidates"
          :key="candidate.user_id"
          class="question-expert-invitation-panel__candidate"
          :data-testid="`expert-invitation-available-row-${candidate.user_id}`"
        >
          <label class="question-expert-invitation-panel__candidate-label">
            <input
              class="question-expert-invitation-panel__checkbox"
              type="checkbox"
              :value="candidate.user_id"
              :checked="isSelected(candidate)"
              :disabled="isCandidateDisabled(candidate)"
              :data-testid="`expert-invitation-candidate-${candidate.user_id}`"
              @change="toggleCandidate(candidate)"
            />
            <span class="question-expert-invitation-panel__candidate-copy">
              <span class="question-expert-invitation-panel__candidate-name">{{ candidate.user_name }}</span>
              <span class="question-expert-invitation-panel__candidate-meta">
                {{ candidate.reputation_level_label }} · {{ candidate.user_reputation_score }} очков
                <span v-if="candidate.is_manual_override">· уровень назначен вручную</span>
              </span>
            </span>
          </label>
        </li>
      </ul>
    </section>

    <section
      class="question-expert-invitation-panel__section"
      aria-labelledby="expert-invitation-invited-title"
      data-testid="expert-invitation-invited-section"
    >
      <div class="question-expert-invitation-panel__section-heading">
        <div>
          <p class="question-expert-invitation-panel__section-kicker">Уже приглашены</p>
          <h3 id="expert-invitation-invited-title" class="question-expert-invitation-panel__section-title">
            Получатели приглашений
          </h3>
        </div>
        <p class="question-expert-invitation-panel__section-note" data-testid="expert-invitation-invited-count">
          Всего: {{ invitedEnvelope?.invited_count ?? invitedExperts.length }}.
        </p>
      </div>

      <p
        v-if="invitedExpertsQuery.isPending.value"
        class="question-expert-invitation-panel__state"
        data-testid="expert-invitation-invited-loading"
      >
        Загружаем уже отправленные приглашения…
      </p>

      <div
        v-else-if="invitedExpertsQuery.isError.value"
        class="question-expert-invitation-panel__state question-expert-invitation-panel__state--danger"
        data-testid="expert-invitation-invited-error"
      >
        <p>{{ invitedQueryErrorMessage }}</p>
        <AppButton
          type="button"
          variant="secondary"
          size="compact"
          data-testid="expert-invitation-invited-retry"
          @click="invitedExpertsQuery.refetch()"
        >
          Повторить загрузку
        </AppButton>
      </div>

      <p
        v-else-if="invitedEnvelope && !hasInvitedExperts"
        class="question-expert-invitation-panel__state"
        data-testid="expert-invitation-invited-empty"
      >
        Пока никто не приглашён.
      </p>

      <ul v-else class="question-expert-invitation-panel__list" data-testid="expert-invitation-invited-list">
        <li
          v-for="invitation in invitedExperts"
          :key="invitation.notification_id"
          class="question-expert-invitation-panel__invited-card"
          :data-testid="`expert-invitation-invited-row-${invitation.recipient_id}`"
        >
          <div class="question-expert-invitation-panel__invited-copy">
            <span class="question-expert-invitation-panel__candidate-name">{{ invitation.recipient_name }}</span>
            <span class="question-expert-invitation-panel__candidate-meta">
              {{ invitation.reputation_level_label }} · {{ invitation.recipient_reputation_score }} очков
            </span>
          </div>
          <div class="question-expert-invitation-panel__badges" aria-label="Статусы приглашения">
            <span class="question-expert-invitation-panel__badge" :data-testid="`expert-invitation-status-${invitation.recipient_id}`">
              {{ getInvitationStatusLabel(invitation) }}
            </span>
            <span class="question-expert-invitation-panel__badge" :data-testid="`expert-invitation-read-${invitation.recipient_id}`">
              {{ getReadStatusLabel(invitation) }}
            </span>
            <span class="question-expert-invitation-panel__badge" :data-testid="`expert-invitation-window-${invitation.recipient_id}`">
              {{ getProtectedWindowStatusLabel(invitation) }}
            </span>
          </div>
        </li>
      </ul>
    </section>

    <div class="question-expert-invitation-panel__footer">
      <p class="question-expert-invitation-panel__selection" data-testid="expert-invitation-selection-summary">
        Выбрано: {{ selectedCount }} из {{ remainingSlots }}.
      </p>
      <AppButton
        type="button"
        :disabled="submitDisabled"
        data-testid="expert-invitation-send"
        @click="sendInvitations"
      >
        {{ isBusy ? 'Отправляем…' : 'Отправить приглашения' }}
      </AppButton>
    </div>
  </SurfacePanel>
</template>

<style scoped>
.question-expert-invitation-panel {
  display: grid;
  gap: var(--space-lg);
}

.question-expert-invitation-panel__header,
.question-expert-invitation-panel__section,
.question-expert-invitation-panel__invited-copy {
  display: grid;
  gap: var(--space-xs);
}

.question-expert-invitation-panel__eyebrow,
.question-expert-invitation-panel__description,
.question-expert-invitation-panel__slots,
.question-expert-invitation-panel__state,
.question-expert-invitation-panel__selection,
.question-expert-invitation-panel__section-kicker,
.question-expert-invitation-panel__section-note {
  margin: 0;
}

.question-expert-invitation-panel__eyebrow,
.question-expert-invitation-panel__section-kicker {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.question-expert-invitation-panel__title {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.55rem);
  text-wrap: balance;
}

.question-expert-invitation-panel__section-title {
  margin: 0;
  font-size: 1rem;
  text-wrap: balance;
}

.question-expert-invitation-panel__description,
.question-expert-invitation-panel__slots,
.question-expert-invitation-panel__selection,
.question-expert-invitation-panel__section-note {
  color: var(--color-muted);
  line-height: 1.6;
}

.question-expert-invitation-panel__section {
  padding: var(--space-md);
  border-radius: calc(var(--radius-md) + var(--space-xs));
  background: rgb(255 255 255 / 0.46);
  box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.08);
}

.question-expert-invitation-panel__section-heading,
.question-expert-invitation-panel__invited-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.question-expert-invitation-panel__feedback,
.question-expert-invitation-panel__state {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  line-height: 1.6;
}

.question-expert-invitation-panel__feedback--success {
  border: 1px solid rgb(47 133 90 / 0.24);
  background: rgb(47 133 90 / 0.1);
  color: #2F855A;
}

.question-expert-invitation-panel__feedback--danger,
.question-expert-invitation-panel__state--danger {
  border: 1px solid rgb(197 48 48 / 0.24);
  background: rgb(197 48 48 / 0.08);
  color: var(--color-danger);
}

.question-expert-invitation-panel__feedback--muted,
.question-expert-invitation-panel__state {
  border: 1px solid var(--color-border);
  background: rgb(255 255 255 / 0.55);
}

.question-expert-invitation-panel__state--danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.question-expert-invitation-panel__state--danger p {
  margin: 0;
}

.question-expert-invitation-panel__list {
  display: grid;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.question-expert-invitation-panel__candidate,
.question-expert-invitation-panel__invited-card {
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.72);
  box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.08), 0 10px 28px rgb(15 23 42 / 0.05);
}

.question-expert-invitation-panel__candidate-label {
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  padding: var(--space-md);
  cursor: pointer;
}

.question-expert-invitation-panel__checkbox {
  margin-top: 0.2rem;
}

.question-expert-invitation-panel__candidate-copy {
  display: grid;
  gap: var(--space-xs);
}

.question-expert-invitation-panel__candidate-name {
  font-weight: 700;
}

.question-expert-invitation-panel__candidate-meta {
  color: var(--color-muted);
  font-size: 14px;
}

.question-expert-invitation-panel__invited-card {
  padding: var(--space-md);
}

.question-expert-invitation-panel__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.question-expert-invitation-panel__badge {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 var(--space-sm);
  border-radius: 999px;
  background: rgb(49 130 206 / 0.1);
  color: #2B6CB0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.question-expert-invitation-panel__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}
</style>
