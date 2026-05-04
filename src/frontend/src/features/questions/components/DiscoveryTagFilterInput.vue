<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  id: string
  label: string
  modelValue: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const draft = shallowRef('')
const localFeedback = shallowRef('')

const normalizedDraft = computed(() => normalizeTagName(draft.value))
const selectedTags = computed(() => normalizeTagList(props.modelValue))
const selectedTagSet = computed(() => new Set(selectedTags.value))
const hasSelectedTags = computed(() => selectedTags.value.length > 0)
const describedBy = computed(() =>
  [`${props.id}-help`, localFeedback.value ? `${props.id}-feedback` : ''].filter(Boolean).join(' '),
)

function normalizeTagName(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTagList(values: string[] | undefined) {
  const normalizedTags: string[] = []
  const seenTags = new Set<string>()

  for (const value of values ?? []) {
    const tagName = normalizeTagName(value)

    if (!tagName || seenTags.has(tagName)) {
      continue
    }

    seenTags.add(tagName)
    normalizedTags.push(tagName)
  }

  return normalizedTags
}

function addTag(rawTag = draft.value) {
  const tagName = normalizeTagName(rawTag)

  if (!tagName) {
    localFeedback.value = 'Введите тег перед добавлением фильтра.'
    return
  }

  if (selectedTagSet.value.has(tagName)) {
    localFeedback.value = 'Этот тег уже добавлен в фильтры.'
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

function clearTags() {
  emit('update:modelValue', [])
  localFeedback.value = ''
}

function handleComma(event: KeyboardEvent) {
  event.preventDefault()
  addTag()
}
</script>

<template>
  <section class="discovery-tag-filter-input" :aria-labelledby="`${id}-label`" data-testid="discovery-tag-filter-input">
    <div class="discovery-tag-filter-input__header">
      <label :id="`${id}-label`" class="discovery-tag-filter-input__label" :for="id">{{ label }}</label>
      <span :id="`${id}-help`" class="discovery-tag-filter-input__help">
        Добавьте один или несколько тегов для фильтрации вопросов.
      </span>
    </div>

    <div
      v-if="hasSelectedTags"
      class="discovery-tag-filter-input__chips"
      aria-label="Активные фильтры по тегам"
      data-testid="discovery-tag-chips"
    >
      <span
        v-for="tag in selectedTags"
        :key="tag"
        class="discovery-tag-filter-input__chip"
        :data-testid="`discovery-tag-chip-${tag}`"
      >
        <span>#{{ tag }}</span>
        <button
          class="discovery-tag-filter-input__remove"
          type="button"
          :aria-label="`Убрать фильтр по тегу ${tag}`"
          :data-testid="`discovery-tag-remove-${tag}`"
          @click="removeTag(tag)"
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>

      <button
        class="discovery-tag-filter-input__clear"
        type="button"
        aria-label="Очистить все фильтры по тегам"
        data-testid="discovery-tag-clear-all"
        @click="clearTags"
      >
        Очистить теги
      </button>
    </div>

    <div class="discovery-tag-filter-input__entry">
      <input
        :id="id"
        v-model="draft"
        class="discovery-tag-filter-input__control"
        :class="{ 'discovery-tag-filter-input__control--error': localFeedback }"
        type="text"
        autocomplete="off"
        placeholder="Например: django, vue, mysql"
        :aria-describedby="describedBy"
        :aria-invalid="Boolean(localFeedback)"
        data-testid="discovery-tag-draft"
        @keydown.enter.prevent="addTag()"
        @keydown.,="handleComma"
      >

      <AppButton type="button" variant="secondary" data-testid="discovery-tag-add" @click="addTag()">
        Добавить тег
      </AppButton>
    </div>

    <p
      v-if="localFeedback"
      :id="`${id}-feedback`"
      class="discovery-tag-filter-input__feedback"
      role="status"
      data-testid="discovery-tag-feedback"
    >
      {{ localFeedback }}
    </p>
  </section>
</template>

<style scoped>
.discovery-tag-filter-input {
  display: grid;
  gap: var(--space-sm);
  min-width: 0;
}

.discovery-tag-filter-input__header {
  display: grid;
  gap: var(--space-xs);
}

.discovery-tag-filter-input__label {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

.discovery-tag-filter-input__help {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.45;
}

.discovery-tag-filter-input__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
}

.discovery-tag-filter-input__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 8px 0 12px;
  border: 1px solid rgb(14 116 144 / 0.2);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.1);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
}

.discovery-tag-filter-input__remove,
.discovery-tag-filter-input__clear {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.discovery-tag-filter-input__remove {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.12);
  color: var(--color-accent);
  line-height: 1;
}

.discovery-tag-filter-input__clear {
  padding: 0 var(--space-xs);
  background: transparent;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.discovery-tag-filter-input__remove:hover,
.discovery-tag-filter-input__remove:focus-visible {
  background: var(--color-accent);
  color: #f8fbfc;
}

.discovery-tag-filter-input__clear:focus-visible {
  outline: 3px solid rgb(14 116 144 / 0.28);
  outline-offset: 2px;
}

.discovery-tag-filter-input__entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-sm);
}

.discovery-tag-filter-input__control {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.86);
  color: var(--color-text);
  font: inherit;
}

.discovery-tag-filter-input__control::placeholder {
  color: var(--color-muted);
}

.discovery-tag-filter-input__control:focus {
  border-color: var(--color-accent);
  outline: 3px solid rgb(14 116 144 / 0.16);
}

.discovery-tag-filter-input__control--error {
  border-color: var(--color-danger);
}

.discovery-tag-filter-input__feedback {
  margin: 0;
  color: var(--color-danger);
  font-size: 13px;
}

@media (width <= 560px) {
  .discovery-tag-filter-input__entry {
    grid-template-columns: 1fr;
  }
}
</style>
