<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  url?: string | null
  alt?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  version?: string | null
}>()

function isSignedStorageUrl(url: string) {
  try {
    const parsedUrl = new URL(url, window.location.origin)
    const queryKeys = Array.from(parsedUrl.searchParams.keys()).map((key) => key.toLowerCase())

    return queryKeys.includes('x-amz-signature')
      || queryKeys.includes('x-amz-credential')
      || queryKeys.includes('signature')
      || queryKeys.includes('awsaccesskeyid')
  } catch {
    return false
  }
}

const imageUrl = computed(() => {
  if (!props.url) {
    return 'https://api.dicebear.com/7.x/identicon/svg?seed=fallback'
  }

  if (!props.version || props.url.startsWith('blob:') || props.url.startsWith('data:') || isSignedStorageUrl(props.url)) {
    return props.url
  }

  const separator = props.url.includes('?') ? '&' : '?'
  return `${props.url}${separator}v=${encodeURIComponent(props.version)}`
})

const sizeClass = computed(() => {
  return `user-avatar--${props.size || 'md'}`
})
</script>

<template>
  <img :src="imageUrl" :alt="alt || ''" class="user-avatar" :class="sizeClass" />
</template>

<style scoped>
.user-avatar {
  border-radius: 50%;
  object-fit: cover;
  background-color: var(--color-surface-hover);
  border: 1px solid var(--color-border);
}

.user-avatar--sm {
  width: 24px;
  height: 24px;
}

.user-avatar--md {
  width: 32px;
  height: 32px;
}

.user-avatar--lg {
  width: 48px;
  height: 48px;
}

.user-avatar--xl {
  width: 96px;
  height: 96px;
}
</style>
