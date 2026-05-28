<script setup lang="ts">
interface Props {
  id: string
  label: string
  modelValue: string
  type?: string
  placeholder?: string
  autocomplete?: string
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  autocomplete: 'off',
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="app-input">
    <label class="app-input__label" :for="id">{{ label }}</label>
    <div class="app-input__control-shell" :class="{ 'app-input__control-shell--error': props.error }">
      <input
        :id="id"
        class="app-input__control"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        @input="handleInput"
      />
      <span v-if="$slots.trailing" class="app-input__trailing">
        <slot name="trailing" />
      </span>
    </div>
    <span v-if="props.error" class="app-input__error">{{ props.error }}</span>
  </div>
</template>

<style scoped>
.app-input {
  display: grid;
  gap: var(--space-xs);
  min-width: 0;
}

.app-input__label {
  font-size: 14px;
  font-weight: 600;
}

.app-input__control-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 0.82);
}

.app-input__control {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 46px;
  padding: 0 var(--space-md);
  border: 0;
  background: transparent;
  color: var(--color-text);
}

.app-input__control:focus {
  outline: none;
}

.app-input__control-shell:focus-within {
  outline: 2px solid Highlight;
  outline: 2px solid -webkit-focus-ring-color;
}

.app-input__trailing {
  display: inline-flex;
  align-items: center;
  padding-right: var(--space-sm);
}

.app-input__control::placeholder {
  color: var(--color-muted);
}

.app-input__control-shell--error {
  border-color: var(--color-danger);
}

.app-input__error {
  color: var(--color-danger);
  font-size: 13px;
}
</style>
