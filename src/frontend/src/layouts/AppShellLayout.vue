<template>
  <div class="app-shell-layout">
    <AppHeader />
    <main class="app-shell-layout__main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/widgets/app-header/AppHeader.vue'
</script>

<style scoped>
.app-shell-layout__main {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-2xl) var(--space-lg) var(--space-3xl);
}
</style>
