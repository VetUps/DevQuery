<template>
  <div class="auth-layout">
    <AppHeader />
    <main class="auth-layout__main">
      <section class="auth-layout__card">
        <slot />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/widgets/app-header/AppHeader.vue'
</script>

<style scoped>
.auth-layout__main {
  display: flex;
  justify-content: center;
  padding: var(--space-3xl) var(--space-lg);
}

.auth-layout__card {
  width: min(100%, 520px);
  padding: var(--space-2xl);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(228 222 208 / 0.85);
  box-shadow: 0 20px 48px rgb(47 57 70 / 0.1);
}

@media (width <= 640px) {
  .auth-layout__main {
    padding: var(--space-xl) var(--space-md) var(--space-2xl);
  }

  .auth-layout__card {
    padding: var(--space-lg);
  }
}
</style>
