<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AuthLayout from '@/layouts/AuthLayout.vue'
import AuthIntroBlock from '@/features/auth/components/AuthIntroBlock.vue'
import LoginForm from '@/features/auth/components/LoginForm.vue'
import { SESSION_EXPIRED_MESSAGE } from '@/features/auth/lib/auth-errors'

const route = useRoute()

const noticeMessage = computed(() => {
  if (route.query.message === 'registered') {
    return 'Аккаунт создан. Теперь войдите, чтобы продолжить.'
  }

  if (route.query.message === 'session-expired') {
    return SESSION_EXPIRED_MESSAGE
  }

  return ''
})
</script>

<template>
  <AuthLayout>
    <AuthIntroBlock />

    <p v-if="noticeMessage" class="login-page__notice">
      {{ noticeMessage }}
    </p>

    <LoginForm />
  </AuthLayout>
</template>

<style scoped>
.login-page__notice {
  margin: 0 0 var(--space-lg);
  padding: var(--space-md);
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: var(--radius-sm);
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
}
</style>
