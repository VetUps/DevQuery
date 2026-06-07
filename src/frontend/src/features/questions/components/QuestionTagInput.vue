<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, shallowRef } from 'vue'

import { useTagAutocompleteQuery } from '@/features/questions/queries/useTagAutocompleteQuery'
import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  id: string
  label: string
  modelValue: string[]
  error?: string
  maxTags?: number
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
  maxTags: 5,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const draft = shallowRef('')
const localFeedback = shallowRef('')

const normalizedDraft = computed(() => normalizeTagName(draft.value))
const selectedTags = computed(() => props.modelValue)
const selectedTagSet = computed(() => new Set(selectedTags.value))
const remainingTagSlots = computed(() => Math.max(props.maxTags - selectedTags.value.length, 0))
const isAtTagLimit = computed(() => remainingTagSlots.value === 0)

const autocompleteQuery = useTagAutocompleteQuery(normalizedDraft)

const visibleSuggestions = computed(() => {
  const suggestions = autocompleteQuery.data.value ?? []

  return suggestions.filter((suggestion) => !selectedTagSet.value.has(suggestion.name))
})

const statusText = computed(() => {
  if (isAtTagLimit.value) {
    return `Достигнут лимит: ${props.maxTags} тегов.`
  }

  return `До ${props.maxTags} тегов. Осталось: ${remainingTagSlots.value}.`
})

const describedBy = computed(() =>
  [
    `${props.id}-help`,
    props.error ? `${props.id}-error` : '',
    localFeedback.value ? `${props.id}-feedback` : '',
  ]
    .filter(Boolean)
    .join(' '),
)

function normalizeTagName(value: string) {
  return value.trim().toLowerCase()
}

function validateTagName(tagName: string) {
  if (isAtTagLimit.value) {
    return `Можно добавить не больше ${props.maxTags} тегов.`
  }

  if (!tagName) {
    return 'Введите название тега перед добавлением.'
  }

  if (tagName.length > 50) {
    return 'Тег не может быть длиннее 50 символов.'
  }

  if (!/^[a-z0-9-]+$/.test(tagName)) {
    return 'Тег может содержать только латинские буквы, цифры и дефисы.'
  }

  if (selectedTagSet.value.has(tagName)) {
    return 'Этот тег уже добавлен.'
  }

  return ''
}

function addTag(rawTag = draft.value) {
  const tagName = normalizeTagName(rawTag)
  const validationMessage = validateTagName(tagName)

  if (validationMessage) {
    localFeedback.value = validationMessage
    return
  }

  emit('update:modelValue', [...selectedTags.value, tagName])
  draft.value = ''
  localFeedback.value = ''
}

function removeTag(tagName: string) {
  emit(
    'update:modelValue',
    selectedTags.value.filter((selectedTag) => selectedTag !== tagName),
  )
  localFeedback.value = ''
}

function handleComma(event: KeyboardEvent) {
  event.preventDefault()
  addTag()
}
</script>

<template>
  <section class="question-tag-input" :aria-labelledby="`${id}-label`">
    <div class="question-tag-input__header">
      <label :id="`${id}-label`" class="question-tag-input__label" :for="id">{{ label }}</label>
      <span :id="`${id}-help`" class="question-tag-input__limit">{{ statusText }}</span>
    </div>

    <div v-if="selectedTags.length" class="question-tag-input__chips" aria-label="Выбранные теги">
      <span v-for="tag in selectedTags" :key="tag" class="question-tag-input__chip">
        <span>#{{ tag }}</span>
        <button
          class="question-tag-input__remove"
          type="button"
          :aria-label="`Удалить тег ${tag}`"
          @click="removeTag(tag)"
        >
          ×
        </button>
      </span>
    </div>

    <div class="question-tag-input__entry">
      <input
        :id="id"
        v-model="draft"
        class="question-tag-input__control"
        :class="{ 'question-tag-input__control--error': error || localFeedback }"
        type="text"
        autocomplete="off"
        placeholder="Например: django, vue, mysql"
        :disabled="isAtTagLimit"
        :aria-describedby="describedBy"
        :aria-invalid="Boolean(error || localFeedback)"
        @keydown.enter.prevent="addTag()"
        @keydown.,="handleComma"
      />

      <AppButton type="button" variant="secondary" :disabled="isAtTagLimit" @click="addTag()">
        Добавить
      </AppButton>
    </div>

    <p v-if="error" :id="`${id}-error`" class="question-tag-input__error">{{ error }}</p>
    <p v-if="localFeedback" :id="`${id}-feedback`" class="question-tag-input__error">{{ localFeedback }}</p>

    <p v-if="autocompleteQuery.isError.value" class="question-tag-input__warning" role="status">
      Не удалось загрузить подсказки. Можно добавить тег вручную.
    </p>

    <p v-else-if="autocompleteQuery.isPending.value && normalizedDraft" class="question-tag-input__muted" role="status">
      Ищем похожие теги…
    </p>

    <div
      v-else-if="normalizedDraft && visibleSuggestions.length"
      class="question-tag-input__suggestions"
      role="listbox"
      :aria-label="`Подсказки тегов для ${normalizedDraft}`"
    >
      <button
        v-for="suggestion in visibleSuggestions"
        :key="suggestion.name"
        class="question-tag-input__suggestion"
        type="button"
        role="option"
        @click="addTag(suggestion.name)"
      >
        <span>#{{ suggestion.name }}</span>
        <span>{{ suggestion.questions_count }} вопросов</span>
      </button>
    </div>

    <p v-else-if="normalizedDraft" class="question-tag-input__muted" role="status">
      Подсказок нет — добавьте тег вручную.
    </p>
  </section>
</template>

<style scoped>
.question-tag-input {
  display: grid;
  gap: var(--space-sm);
  min-width: 0;
}

.question-tag-input__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-xs) var(--space-md);
}

.question-tag-input__label {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

.question-tag-input__limit,
.question-tag-input__muted {
  color: var(--color-muted);
  font-size: 13px;
}

.question-tag-input__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.question-tag-input__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 34px;
  padding: 0 var(--space-sm) 0 var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.24);
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(14 116 144 / 0.12), rgb(255 255 255 / 0.64));
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 700;
}

.question-tag-input__remove {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.12);
  color: var(--color-accent);
  font: inherit;
  line-height: 1;
}

.question-tag-input__remove:hover,
.question-tag-input__remove:focus-visible {
  background: var(--color-accent);
  color: #f8fbfc;
}

.question-tag-input__entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-sm);
}

.question-tag-input__control {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 48px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 0.86);
  color: var(--color-text);
}

.question-tag-input__control:focus {
  border-color: var(--color-accent);
  outline: 3px solid rgb(14 116 144 / 0.16);
}

.question-tag-input__control--error {
  border-color: var(--color-danger);
}

.question-tag-input__control:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.question-tag-input__error,
.question-tag-input__warning,
.question-tag-input__muted {
  margin: 0;
}

.question-tag-input__error {
  color: var(--color-danger);
  font-size: 13px;
}

.question-tag-input__warning {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid rgb(194 65 12 / 0.24);
  border-radius: var(--radius-sm);
  background: rgb(194 65 12 / 0.08);
  color: var(--color-danger);
  font-size: 13px;
}

.question-tag-input__suggestions {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.64);
}

.question-tag-input__suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
}

.question-tag-input__suggestion:hover,
.question-tag-input__suggestion:focus-visible {
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
}

@media (max-width: 560px) {
  .question-tag-input__entry {
    grid-template-columns: 1fr;
  }
}
</style>
