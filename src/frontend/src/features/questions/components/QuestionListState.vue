<script setup lang="ts">
import InlineFeedbackPanel from '@/shared/ui/InlineFeedbackPanel.vue'

defineProps<{
  mode: 'empty' | 'error'
}>()

defineEmits<{
  retry: []
}>()
</script>

<template>
  <InlineFeedbackPanel
    v-if="mode === 'empty'"
    eyebrow="Публичная лента"
    title="Вопросов пока нет"
    description="Как только в системе появятся новые обсуждения, они сразу покажутся здесь."
    data-testid="question-list-state-empty"
  />

  <InlineFeedbackPanel
    v-else
    eyebrow="Не удалось загрузить данные. Попробуйте снова."
    title="Лента временно недоступна"
    description="Мы не смогли получить список вопросов с сервера. Повторите запрос ещё раз."
    :show-action="true"
    action-label="Попробовать снова"
    tone="danger"
    data-testid="question-list-state-error"
    @action="$emit('retry')"
  />
</template>
