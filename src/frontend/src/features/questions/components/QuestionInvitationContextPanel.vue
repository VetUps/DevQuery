<script setup lang="ts">
import { computed } from 'vue'

import type { NotificationItem } from '@/features/notifications/api/notifications'
import type { QuestionDetail } from '@/features/questions/api/questions'

const props = defineProps<{
  question: QuestionDetail
  matchingInvitation: NotificationItem | null
  isAuthor: boolean
  isAuthenticated: boolean
  notificationsPending: boolean
  notificationsError: boolean
}>()

const shouldRender = computed(
  () => props.isAuthenticated && !props.isAuthor && props.question.is_protected,
)

const hasActiveAnswerInvitation = computed(
  () =>
    props.matchingInvitation?.invitation_status === 'active' &&
    props.matchingInvitation.protected_window_active &&
    props.question.viewer_can_answer,
)

const hasStaleInvitation = computed(
  () => Boolean(props.matchingInvitation) && !hasActiveAnswerInvitation.value,
)

const shouldShowOrdinaryBlockedContext = computed(
  () => !props.matchingInvitation && !props.question.viewer_can_answer,
)

const levelProgressText = computed(() => {
  const levelLabel = props.question.viewer_level_label ?? props.question.viewer_level
  const nextLevelLabel = props.question.viewer_next_level_label ?? props.question.viewer_next_level
  const points = props.question.viewer_points_to_next_level

  if (typeof points === 'number' && points > 0 && nextLevelLabel) {
    return `Сейчас ваш уровень: ${levelLabel ?? 'текущий'}, до уровня ${nextLevelLabel} не хватает ${points} очков.`
  }

  if (levelLabel) {
    return `Сейчас ваш уровень: ${levelLabel}.`
  }

  return ''
})

const reasonText = computed(() => props.question.viewer_answer_reason_message || 'Право отвечать проверяется серверной политикой вопроса.')
</script>

<template>
  <aside
    v-if="shouldRender"
    class="question-invitation-context"
    data-testid="question-invitation-context-panel"
  >
    <p v-if="notificationsError" class="question-invitation-context__warning" data-testid="question-invitation-context-warning">
      Не удалось проверить ваши приглашения. Мы показываем обычный защищённый контекст; право отвечать всё равно определяет сервер.
    </p>

    <div v-if="hasActiveAnswerInvitation" data-testid="question-invitation-context-active">
      <p class="question-invitation-context__eyebrow">Приглашение активно</p>
      <h2 class="question-invitation-context__title">Автор позвал вас как эксперта или мастера</h2>
      <p class="question-invitation-context__body">
        Приглашение относится к этому защищённому вопросу, окно защиты ещё активно, а сервер разрешил вам ответить.
        Откройте форму ответа через основной блок ниже — уведомление только объясняет контекст и не выдаёт доступ само по себе.
      </p>
    </div>

    <div v-else-if="hasStaleInvitation" data-testid="question-invitation-context-stale">
      <p class="question-invitation-context__eyebrow">Приглашение не даёт доступ</p>
      <h2 class="question-invitation-context__title">Уведомление найдено, но оно больше не является активным пропуском</h2>
      <p class="question-invitation-context__body">
        Приглашение могло устареть, истечь, относиться к завершённому окну защиты или быть отклонено текущей политикой ответа.
        Наличие уведомления не является разрешением: форму ответа включает только серверное поле вопроса.
      </p>
      <p v-if="!question.viewer_can_answer" class="question-invitation-context__detail">
        {{ reasonText }}
      </p>
    </div>

    <div v-else-if="notificationsPending" data-testid="question-invitation-context-loading">
      <p class="question-invitation-context__eyebrow">Проверяем приглашения</p>
      <p class="question-invitation-context__body">Загружаем ваши уведомления, не меняя доступ к форме ответа.</p>
    </div>

    <div v-else-if="shouldShowOrdinaryBlockedContext" data-testid="question-invitation-context-ordinary-blocked">
      <p class="question-invitation-context__eyebrow">Защищённый вопрос новичка</p>
      <h2 class="question-invitation-context__title">Ответы временно доступны только подходящим экспертам</h2>
      <p class="question-invitation-context__body">
        У вас нет активного приглашения к этому вопросу, и страница не предлагает отправить запрос самому себе.
        {{ reasonText }}
      </p>
      <p v-if="levelProgressText" class="question-invitation-context__detail" data-testid="question-invitation-context-progress">
        {{ levelProgressText }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.question-invitation-context {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-lg);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(14 116 144 / 0.07);
  color: var(--color-text);
}

.question-invitation-context__eyebrow {
  margin: 0 0 var(--space-xs);
  color: var(--color-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.question-invitation-context__title {
  margin: 0;
  font-size: 1rem;
}

.question-invitation-context__body,
.question-invitation-context__detail,
.question-invitation-context__warning {
  margin: var(--space-xs) 0 0;
  line-height: 1.6;
}

.question-invitation-context__detail {
  color: var(--color-muted);
}

.question-invitation-context__warning {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid rgb(180 83 9 / 0.22);
  border-radius: var(--radius-md);
  background: rgb(180 83 9 / 0.1);
  color: #92400E;
}
</style>
