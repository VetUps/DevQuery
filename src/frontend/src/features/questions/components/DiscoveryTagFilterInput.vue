<script setup lang="ts">
import { computed, shallowRef, toValue } from 'vue'

import { useTagAutocompleteQuery } from '@/features/questions/queries/useTagAutocompleteQuery'
import AppButton from '@/shared/ui/AppButton.vue'

interface Props {
  id: string
  label: string
  modelValue: string[]
}

interface RawTagSuggestion {
  name?: unknown
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
const autocompleteQuery = useTagAutocompleteQuery(normalizedDraft)
const visibleSuggestions = computed(() => normalizeSuggestionList(toValue(autocompleteQuery.data)))
const hasDraft = computed(() => normalizedDraft.value.length > 0)
const isAutocompletePending = computed(() => hasDraft.value && Boolean(toValue(autocompleteQuery.isFetching)))
const isAutocompleteError = computed(() => hasDraft.value && Boolean(toValue(autocompleteQuery.isError)))
const showEmptyAutocompleteFallback = computed(
  () => hasDraft.value && !isAutocompletePending.value && !isAutocompleteError.value && visibleSuggestions.value.length === 0,
)
const autocompleteStatus = computed(() => {
  if (isAutocompleteError.value) {
    return 'Не удалось загрузить подсказки. Можно добавить тег вручную.'
  }

  if (isAutocompletePending.value) {
    return 'Ищем подходящие теги…'
  }

  if (showEmptyAutocompleteFallback.value) {
    return 'Подсказок нет — добавьте тег вручную.'
  }

  return ''
})
const describedBy = computed(() =>
  [
    `${props.id}-help`,
    localFeedback.value ? `${props.id}-feedback` : '',
    autocompleteStatus.value ? `${props.id}-autocomplete-status` : '',
  ]
    .filter(Boolean)
    .join(' '),
)

function normalizeTagName(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeTagList(values: unknown[] | undefined) {
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

function normalizeSuggestionList(suggestions: unknown) {
  if (!Array.isArray(suggestions)) {
    return []
  }

  const normalizedSuggestions: string[] = []
  const seenSuggestions = new Set<string>()

  for (const suggestion of suggestions as RawTagSuggestion[]) {
    const tagName = typeof suggestion.name === 'string' ? normalizeTagName(suggestion.name) : ''

    if (!tagName || selectedTagSet.value.has(tagName) || seenSuggestions.has(tagName)) {
      continue
    }

    seenSuggestions.add(tagName)
    normalizedSuggestions.push(tagName)
  }

  return normalizedSuggestions
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

      <AppButton type="button" variant="secondary" size="compact" data-testid="discovery-tag-add" @click="addTag()">
        Добавить тег
      </AppButton>
    </div>

    <div
      v-if="hasDraft"
      class="discovery-tag-filter-input__autocomplete"
      data-testid="discovery-tag-autocomplete"
    >
      <ul
        v-if="visibleSuggestions.length > 0"
        class="discovery-tag-filter-input__suggestions"
        role="listbox"
        :aria-label="`Подсказки тегов для ${normalizedDraft}`"
        data-testid="discovery-tag-suggestions"
      >
        <li v-for="suggestion in visibleSuggestions" :key="suggestion" class="discovery-tag-filter-input__suggestion-item">
          <button
            class="discovery-tag-filter-input__suggestion"
            type="button"
            role="option"
            :data-testid="`discovery-tag-suggestion-${suggestion}`"
            @click="addTag(suggestion)"
          >
            #{{ suggestion }}
          </button>
        </li>
      </ul>

      <p
        v-if="autocompleteStatus"
        :id="`${id}-autocomplete-status`"
        class="discovery-tag-filter-input__autocomplete-status"
        :class="{ 'discovery-tag-filter-input__autocomplete-status--warning': isAutocompleteError }"
        role="status"
        data-testid="discovery-tag-autocomplete-status"
      >
        {{ autocompleteStatus }}
      </p>
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
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px var(--space-sm);
}

.discovery-tag-filter-input__label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
}

.discovery-tag-filter-input__help {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.35;
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
  min-height: 40px;
  padding: 0 8px 0 14px;
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
  min-width: 40px;
  min-height: 40px;
  place-items: center;
  border-radius: 999px;
  background: rgb(14 116 144 / 0.12);
  color: var(--color-accent);
  line-height: 1;
}

.discovery-tag-filter-input__clear {
  min-height: 40px;
  padding: 0 var(--space-sm);
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
  gap: var(--space-xs);
}

.discovery-tag-filter-input__control {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.78);
  color: var(--color-text);
  font: inherit;
  font-size: 14px;
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

.discovery-tag-filter-input__autocomplete {
  display: grid;
  gap: var(--space-xs);
}

.discovery-tag-filter-input__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding: 0;
  margin: 0;
  list-style: none;
}

.discovery-tag-filter-input__suggestion {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.discovery-tag-filter-input__suggestion:hover,
.discovery-tag-filter-input__suggestion:focus-visible {
  border-color: var(--color-accent);
  background: rgb(14 116 144 / 0.14);
  outline: 3px solid rgb(14 116 144 / 0.18);
  outline-offset: 1px;
}

.discovery-tag-filter-input__autocomplete-status {
  margin: 0;
  color: var(--color-muted);
  font-size: 13px;
}

.discovery-tag-filter-input__autocomplete-status--warning,
.discovery-tag-filter-input__feedback {
  color: var(--color-danger);
}

.discovery-tag-filter-input__feedback {
  margin: 0;
  font-size: 13px;
}

@media (width <= 560px) {
  .discovery-tag-filter-input__entry {
    grid-template-columns: 1fr;
  }
}
</style>
