<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed } from 'vue'

import {
  getProtectedQuestionWindowGenitiveLabel,
  getProtectedQuestionWindowHours,
  type QuestionListItem,
} from '@/features/questions/api/questions'
import AppDialog from '@/shared/ui/AppDialog.vue'
import { formatLongDate } from '@/shared/libs/formatting'

type ProtectedQuestionDisclosure = Pick<
  QuestionListItem,
  | 'question_created_at'
  | 'protected_until'
  | 'viewer_answer_required_level_label'
>

const props = defineProps<{
  question: ProtectedQuestionDisclosure
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const windowHours = computed(() => getProtectedQuestionWindowHours(props.question))
const windowLabel = computed(() => getProtectedQuestionWindowGenitiveLabel(windowHours.value))
const requiredLevelLabel = computed(() => props.question.viewer_answer_required_level_label?.trim() || 'Эксперт')
const requiredLevelThresholdLabel = computed(() => `${requiredLevelLabel.value} и выше`)
const protectedUntilLabel = computed(() => {
  if (!props.question.protected_until) {
    return ''
  }

  return formatLongDate(props.question.protected_until)
})
</script>

<template>
  <AppDialog
    :open="open"
    title="Как работает защита вопроса"
    description="Короткое окно помогает новым авторам получить содержательную первую обратную связь."
    size="default"
    data-testid="protected-question-info-dialog"
    @close="emit('close')"
  >
    <div class="protected-question-info" data-testid="protected-question-info-body">
      <section class="protected-question-info__section" data-testid="protected-question-info-policy">
        <p class="protected-question-info__eyebrow">Защита {{ windowLabel }}</p>
        <p class="protected-question-info__copy">
          В течение первых {{ windowLabel }} после публикации отвечать могут только участники уровня
          {{ requiredLevelThresholdLabel }}. Остальные участники могут читать вопрос, оставлять полезные комментарии
          и вернуться с ответом после завершения окна.
        </p>
      </section>

      <section class="protected-question-info__section" data-testid="protected-question-info-votes">
        <p class="protected-question-info__eyebrow">Оценки без давления</p>
        <p class="protected-question-info__copy">
          Даунвоуты на защищённый вопрос временно отключены, чтобы обсуждение начиналось с уточнений и правок,
          а не с раннего минуса для нового автора.
        </p>
      </section>

      <p v-if="protectedUntilLabel" class="protected-question-info__deadline" data-testid="protected-question-info-deadline">
        Окно защиты закончится {{ protectedUntilLabel }}.
      </p>
    </div>
  </AppDialog>
</template>

<style scoped>
.protected-question-info {
  display: grid;
  gap: var(--space-md);
}

.protected-question-info__section {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid rgb(180 35 24 / 0.16);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgb(180 35 24 / 0.07), rgb(14 116 144 / 0.05));
}

.protected-question-info__eyebrow,
.protected-question-info__copy,
.protected-question-info__deadline {
  margin: 0;
}

.protected-question-info__eyebrow {
  color: #8F1D14;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.protected-question-info__copy,
.protected-question-info__deadline {
  color: #5F4635;
  line-height: 1.65;
}

.protected-question-info__deadline {
  padding: 0 var(--space-xs);
  font-size: 14px;
}
</style>
