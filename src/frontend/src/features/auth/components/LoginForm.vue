<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { queryClient } from '@/app/query-client'
import { loginUser } from '@/features/auth/api/auth'
import { normalizeAuthErrorMessage } from '@/features/auth/libs/auth-errors'
import { useSessionStore } from '@/features/auth/stores/session'
import AppButton from '@/shared/ui/AppButton.vue'
import AppInput from '@/shared/ui/AppInput.vue'

const router = useRouter()
const sessionStore = useSessionStore()

const form = reactive({
  user_email: '',
  password: '',
})

const fieldErrors = reactive<Record<string, string>>({
  user_email: '',
  password: '',
})

const formError = ref('')
const isSubmitting = ref(false)

function validate() {
  fieldErrors.user_email = form.user_email ? '' : 'Укажите почту.'
  fieldErrors.password = form.password ? '' : 'Укажите пароль.'

  return !fieldErrors.user_email && !fieldErrors.password
}

async function handleSubmit() {
  formError.value = ''

  if (!validate()) {
    formError.value = 'Заполните обязательные поля, чтобы продолжить.'
    return
  }

  isSubmitting.value = true

  try {
    const response = await loginUser(form)
    sessionStore.setSession({
      access: response.access,
      refresh: response.refresh,
    })
    queryClient.setQueryData(['auth', 'profile'], response.user)
    await router.push('/')
  } catch (error) {
    formError.value = normalizeAuthErrorMessage(error, 'login')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <p v-if="formError" class="auth-form__summary">{{ formError }}</p>

    <AppInput
      id="login-email"
      v-model="form.user_email"
      label="Почта"
      type="email"
      autocomplete="email"
      placeholder="name@example.com"
      :error="fieldErrors.user_email"
    />

    <AppInput
      id="login-password"
      v-model="form.password"
      label="Пароль"
      type="password"
      autocomplete="current-password"
      placeholder="Введите пароль"
      :error="fieldErrors.password"
    />

    <AppButton type="submit" :disabled="isSubmitting" :block="true">
      {{ isSubmitting ? 'Входим…' : 'Войти' }}
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
