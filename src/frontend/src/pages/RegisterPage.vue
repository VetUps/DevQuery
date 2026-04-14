<template>
  <AuthLayout>
    <section class="register-page__intro">
      <p class="register-page__eyebrow">Создать аккаунт</p>
      <h1 class="register-page__title">Подготовьте профиль для участия в вопросах и решениях</h1>
    </section>

    <RegisterForm />
  </AuthLayout>
</template>

<script setup lang="ts">
import RegisterForm from '@/features/auth/components/RegisterForm.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
</script>

<style scoped>
.register-page__intro {
  display: grid;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.register-page__eyebrow {
  margin: 0;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.register-page__title {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}
</style>
