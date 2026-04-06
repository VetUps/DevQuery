<script setup lang="ts">
import { reactive, ref } from 'vue'
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
      type="password"
      autocomplete="new-password"
      placeholder="Минимум 6 символов"
      :error="fieldErrors.password"
    />

    <AppInput
      id="register-password-confirm"
      v-model="form.password_confirm"
      label="Повторите пароль"
      type="password"
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
</style>
