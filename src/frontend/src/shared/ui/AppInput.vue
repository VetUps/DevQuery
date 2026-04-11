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
  <label class="app-input" :for="id">
    <span class="app-input__label">{{ label }}</span>
    <input
      :id="id"
      class="app-input__control"
      :class="{ 'app-input__control--error': props.error }"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      @input="handleInput"
    />
    <span v-if="props.error" class="app-input__error">{{ props.error }}</span>
  </label>
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

.app-input__control {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 48px;
  padding: 0 var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 0.82);
  color: var(--color-text);
}

.app-input__control::placeholder {
  color: var(--color-muted);
}

.app-input__control--error {
  border-color: var(--color-danger);
}

.app-input__error {
  color: var(--color-danger);
  font-size: 13px;
}
</style>
