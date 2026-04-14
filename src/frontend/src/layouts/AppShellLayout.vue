<template>
  <div class="app-shell-layout">
    <AppHeader />
    <main class="app-shell-layout__main">
      <div class="app-shell-layout__content">
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/widgets/app-header/AppHeader.vue'
</script>

<style scoped>
.app-shell-layout {
  min-height: 100vh;
}

.app-shell-layout__main {
  padding: var(--space-xl) var(--space-lg) var(--space-3xl);
}

.app-shell-layout__content {
  width: min(1180px, 100%);
  min-width: 0;
  max-width: 1180px;
  margin: 0 auto;
}
</style>
