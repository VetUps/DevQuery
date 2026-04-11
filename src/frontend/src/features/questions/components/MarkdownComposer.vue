<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'

import MarkdownContent from '@/shared/ui/MarkdownContent.vue'

import MarkdownModeToggle from './MarkdownModeToggle.vue'

interface Props {
  id: string
  label: string
  placeholder?: string
  error?: string
  showModeToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  error: '',
  showModeToggle: true,
})

const model = defineModel<string>({ required: true })

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textarea')
const mode = ref<'editor' | 'preview'>('editor')
const selectedLanguage = ref('ts')

const languageOptions = [
  { value: 'ts', label: 'TypeScript' },
  { value: 'js', label: 'JavaScript' },
  { value: 'py', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
]

const hasContent = computed(() => model.value.trim().length > 0)
const languageSelectId = computed(() => `${props.id}-language`)

function insertSnippet(
  buildSnippet: (selectedText: string) => { nextValue: string; cursorStart: number; cursorEnd: number },
) {
  const textarea = textareaRef.value

  if (!textarea) {
    const { nextValue } = buildSnippet('')
    model.value = nextValue
    return
  }

  const selectionStart = textarea.selectionStart
  const selectionEnd = textarea.selectionEnd
  const selectedText = model.value.slice(selectionStart, selectionEnd)
  const beforeSelection = model.value.slice(0, selectionStart)
  const afterSelection = model.value.slice(selectionEnd)

  const { nextValue, cursorStart, cursorEnd } = buildSnippet(selectedText)
  model.value = `${beforeSelection}${nextValue}${afterSelection}`

  void nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(selectionStart + cursorStart, selectionStart + cursorEnd)
  })
}

function wrapSelection(before: string, after: string, fallbackText: string) {
  insertSnippet((selectedText) => {
    const text = selectedText || fallbackText
    const nextValue = `${before}${text}${after}`

    return {
      nextValue,
      cursorStart: before.length,
      cursorEnd: before.length + text.length,
    }
  })
}

function insertLinePrefix(prefix: string, fallbackText: string) {
  insertSnippet((selectedText) => {
    const text = selectedText || fallbackText
    const lines = text.split('\n').map((line) => `${prefix}${line}`).join('\n')

    return {
      nextValue: lines,
      cursorStart: prefix.length,
      cursorEnd: prefix.length + text.length,
    }
  })
}

function insertCodeBlock() {
  const language = selectedLanguage.value

  insertSnippet((selectedText) => {
    const text = selectedText || '// code'
    const nextValue = `\`\`\`${language}\n${text}\n\`\`\``

    return {
      nextValue,
      cursorStart: language.length + 4,
      cursorEnd: language.length + 4 + text.length,
    }
  })
}
</script>

<template>
  <label class="markdown-composer" :for="id">
    <div class="markdown-composer__header">
      <div>
        <span class="markdown-composer__label">{{ label }}</span>
        <p class="markdown-composer__caption">
          Поддерживаются заголовки, списки, ссылки, цитаты и кодовые блоки.
        </p>
      </div>

      <MarkdownModeToggle v-if="showModeToggle" v-model="mode" />
    </div>

    <div class="markdown-composer__toolbar">
      <div class="markdown-composer__toolbar-group">
        <button type="button" class="markdown-composer__toolbar-button" @click="wrapSelection('## ', '', 'Новый раздел')">
          H2
        </button>
        <button type="button" class="markdown-composer__toolbar-button" @click="insertLinePrefix('> ', 'Цитата')">
          Цитата
        </button>
        <button type="button" class="markdown-composer__toolbar-button" @click="insertLinePrefix('- ', 'Пункт списка')">
          Список
        </button>
        <button type="button" class="markdown-composer__toolbar-button" @click="wrapSelection('[', '](https://example.com)', 'текст ссылки')">
          Ссылка
        </button>
        <button type="button" class="markdown-composer__toolbar-button" @click="wrapSelection('`', '`', 'code')">
          Inline code
        </button>
      </div>

      <div class="markdown-composer__toolbar-group">
        <label class="markdown-composer__language" :for="languageSelectId">
          Язык кода
        </label>
        <select :id="languageSelectId" v-model="selectedLanguage" class="markdown-composer__select">
          <option
            v-for="option in languageOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <button type="button" class="markdown-composer__toolbar-button" @click="insertCodeBlock()">
          Блок кода
        </button>
      </div>
    </div>

    <textarea
      v-show="mode === 'editor'"
      :id="id"
      ref="textarea"
      v-model="model"
      class="markdown-composer__textarea"
      :class="{ 'markdown-composer__textarea--error': props.error }"
      :placeholder="placeholder"
    />

    <div v-show="mode === 'preview'" class="markdown-composer__preview">
      <MarkdownContent
        v-if="hasContent"
        :source="model"
      />
      <p v-else class="markdown-composer__preview-empty">
        Предпросмотр появится, когда вы добавите текст вопроса.
      </p>
    </div>

    <span v-if="props.error" class="markdown-composer__error">{{ props.error }}</span>
  </label>
</template>

<style scoped>
.markdown-composer {
  display: grid;
  gap: var(--space-sm);
  min-width: 0;
}

.markdown-composer > * {
  min-width: 0;
}

.markdown-composer__header,
.markdown-composer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  min-width: 0;
}

.markdown-composer__label,
.markdown-composer__caption,
.markdown-composer__preview-empty {
  margin: 0;
}

.markdown-composer__label {
  font-size: 14px;
  font-weight: 600;
}

.markdown-composer__caption,
.markdown-composer__language,
.markdown-composer__preview-empty {
  color: var(--color-muted);
  font-size: 14px;
  line-height: 1.5;
}

.markdown-composer__toolbar {
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.62);
}

.markdown-composer__toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
}

.markdown-composer__toolbar-button,
.markdown-composer__select {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgb(31 41 51 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.84);
  color: var(--color-text);
}

.markdown-composer__textarea,
.markdown-composer__preview {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 320px;
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 0.86);
}

.markdown-composer__textarea {
  resize: vertical;
  line-height: 1.7;
}

.markdown-composer__textarea--error {
  border-color: var(--color-danger);
}

.markdown-composer__preview-empty {
  max-width: 36ch;
}

.markdown-composer__error {
  color: var(--color-danger);
  font-size: 13px;
}
</style>
