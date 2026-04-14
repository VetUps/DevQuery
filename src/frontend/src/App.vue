<script setup lang="ts">
import { RouterView } from 'vue-router'

import { useSessionStore } from '@/features/auth/stores/session'
import AppToastRegion from '@/shared/ui/AppToastRegion.vue'

const sessionStore = useSessionStore()

if (!sessionStore.isAuthenticated) {
  sessionStore.hydrateFromStorage()
}
</script>

<template>
  <RouterView />
  <AppToastRegion />
</template>
