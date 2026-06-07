<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, reactive, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import { registerUser } from '@/features/auth/api/auth'
import { normalizeAuthErrorMessage } from '@/features/auth/libs/auth-errors'
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'

const router = useRouter()

const registrationSuccessMessage = 'Аккаунт создан. Теперь войдите, чтобы продолжить.'

const form = reactive({
  user_name: '',
  user_email: '',
  password: '',
  password_confirm: '',
})

const fieldErrors = reactive<Record<string, string>>({
  user_name: '',
  user_email: '',
  password: '',
  password_confirm: '',
})

const formError = ref('')
const isSubmitting = ref(false)
const isPasswordVisible = shallowRef(false)
const passwordInputType = computed(() => (isPasswordVisible.value ? 'text' : 'password'))
const passwordVisibilityLabel = computed(() => (isPasswordVisible.value ? 'Скрыть пароль' : 'Показать пароль'))

function togglePasswordVisibility() {
  isPasswordVisible.value = !isPasswordVisible.value
}

function validate() {
  fieldErrors.user_name = form.user_name ? '' : 'Укажите имя.'
  fieldErrors.user_email = form.user_email ? '' : 'Укажите почту.'
  fieldErrors.password = form.password ? '' : 'Укажите пароль.'
  fieldErrors.password_confirm = form.password_confirm ? '' : 'Повторите пароль.'

  if (form.password && form.password_confirm && form.password !== form.password_confirm) {
    fieldErrors.password_confirm = 'Пароли не совпадают.'
  }

  return Object.values(fieldErrors).every((value) => !value)
}

async function handleSubmit() {
  formError.value = ''

  if (!validate()) {
    formError.value = 'Проверьте форму и исправьте ошибки перед отправкой.'
    return
  }

  isSubmitting.value = true

  try {
    await registerUser(form)
    await router.push({
      path: '/login',
      query: { message: 'registered' },
    })
  } catch (error) {
    formError.value = normalizeAuthErrorMessage(error, 'register')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <p v-if="formError" class="auth-form__summary">{{ formError }}</p>

    <AppInput
      id="register-user-name"
      v-model="form.user_name"
      label="Имя"
      autocomplete="username"
      placeholder="Как к вам обращаться"
      :error="fieldErrors.user_name"
    />

    <AppInput
      id="register-user-email"
      v-model="form.user_email"
      label="Почта"
      type="email"
      autocomplete="email"
      placeholder="name@example.com"
      :error="fieldErrors.user_email"
    />

    <AppInput
      id="register-password"
      v-model="form.password"
      label="Пароль"
      :type="passwordInputType"
      autocomplete="new-password"
      placeholder="Минимум 6 символов"
      :error="fieldErrors.password"
    >
      <template #trailing>
        <button
          class="auth-form__password-toggle"
          type="button"
          :aria-label="passwordVisibilityLabel"
          :aria-pressed="isPasswordVisible"
          aria-controls="register-password register-password-confirm"
          data-testid="register-password-visibility-toggle"
          @click="togglePasswordVisibility"
        >
          <svg
            v-if="!isPasswordVisible"
            class="auth-form__password-toggle-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg
            v-else
            class="auth-form__password-toggle-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
            <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.3 3.4" />
            <path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 8 10 8a10.4 10.4 0 0 0 4.8-1.2" />
          </svg>
        </button>
      </template>
    </AppInput>

    <AppInput
      id="register-password-confirm"
      v-model="form.password_confirm"
      label="Повторите пароль"
      :type="passwordInputType"
      autocomplete="new-password"
      placeholder="Повторите пароль"
      :error="fieldErrors.password_confirm"
    />

    <AppButton type="submit" :disabled="isSubmitting" :block="true">
      {{ isSubmitting ? 'Создаём аккаунт…' : 'Создать аккаунт' }}
    </AppButton>
  </form>
</template>

<style scoped>
.auth-form {
  display: grid;
  gap: var(--space-md);
}

.auth-form__summary {
  margin: 0;
  padding: var(--space-md);
  border: 1px solid rgb(194 65 12 / 0.24);
  border-radius: var(--radius-sm);
  background: rgb(194 65 12 / 0.08);
  color: var(--color-danger);
}

.auth-form__password-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}

.auth-form__password-toggle:hover {
  color: var(--color-primary);
  background: rgb(0 0 0 / 0.04);
}

.auth-form__password-toggle:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.auth-form__password-toggle-icon {
  width: 20px;
  height: 20px;
}
</style>
