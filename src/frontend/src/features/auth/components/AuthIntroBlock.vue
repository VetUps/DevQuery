<template>
  <section class="auth-intro">
    <p class="auth-intro__eyebrow">Для разработчиков</p>
    <h1 class="auth-intro__title">Войдите, чтобы продолжить участие в обсуждениях</h1>
  </section>
</template>

<style scoped>
.auth-intro {
  display: grid;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.auth-intro__eyebrow {
  margin: 0;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.auth-intro__title {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}
</style>
