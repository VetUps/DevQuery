<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  heading?: string
  placeholder?: string
  submitLabel?: string
  pending?: boolean
  summary?: string
  fieldError?: string
  autoFocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  heading: '',
  placeholder: 'Добавьте комментарий по делу.',
  submitLabel: 'Отправить комментарий',
  pending: false,
  summary: '',
  fieldError: '',
  autoFocus: false,
})

const emit = defineEmits<{
  submit: [body: string]
  cancel: []
}>()

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textarea')
const body = ref('')
const localFieldError = ref('')

if (props.autoFocus && typeof window !== 'undefined') {
  requestAnimationFrame(() => {
    textareaRef.value?.focus()
  })
}

function validate() {
  localFieldError.value = body.value.trim() ? '' : 'Добавьте текст комментария.'

  return !localFieldError.value
}

function handleSubmit() {
  if (!validate()) {
    return
  }

  emit('submit', body.value.trim())
}

function handleInput() {
  if (body.value.trim()) {
    localFieldError.value = ''
  }
}
</script>

<template>
  <form class="comment-composer" @submit.prevent="handleSubmit">
    <div class="comment-composer__header">
      <p v-if="heading" class="comment-composer__heading">{{ heading }}</p>
      <p v-if="summary" class="comment-composer__summary">{{ summary }}</p>
    </div>

    <textarea
      ref="textarea"
      v-model="body"
      class="comment-composer__textarea"
      :class="{ 'comment-composer__textarea--error': fieldError || localFieldError }"
      :placeholder="placeholder"
      :disabled="pending"
      @input="handleInput"
    />

    <p v-if="fieldError || localFieldError" class="comment-composer__error">
      {{ fieldError || localFieldError }}
    </p>

    <div class="comment-composer__actions">
      <AppButton type="button" variant="ghost" @click="$emit('cancel')">
        Отменить
      </AppButton>
      <AppButton type="submit" :disabled="pending">
        {{ pending ? 'Отправляем…' : submitLabel }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.comment-composer {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.72);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.82);
}

.comment-composer__header {
  display: grid;
  gap: var(--space-xs);
}

.comment-composer__heading,
.comment-composer__summary,
.comment-composer__error {
  margin: 0;
}

.comment-composer__heading {
  font-size: 14px;
  font-weight: 600;
}

.comment-composer__summary,
.comment-composer__error {
  font-size: 14px;
  line-height: 1.5;
}

.comment-composer__summary,
.comment-composer__error {
  color: #B42318;
}

.comment-composer__textarea {
  min-height: 120px;
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.92);
  line-height: 1.6;
  resize: vertical;
}

.comment-composer__textarea--error {
  border-color: #B42318;
}

.comment-composer__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
