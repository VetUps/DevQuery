<script setup lang="ts">
const props = withDefaults(defineProps<{
  lines?: number
  compact?: boolean
}>(), {
  lines: 3,
  compact: false,
})
</script>

<template>
  <div
    class="content-skeleton"
    :class="{ 'content-skeleton--compact': props.compact }"
  >
    <span
      v-for="index in props.lines"
      :key="index"
      class="content-skeleton__line skeleton"
      :class="{
        'content-skeleton__line--short': index === props.lines,
        'content-skeleton__line--compact': props.compact,
      }"
    />
  </div>
</template>

<style scoped>
.content-skeleton {
  display: grid;
  gap: var(--space-sm);
}

.content-skeleton__line {
  display: inline-flex;
  width: 100%;
  height: 18px;
  border-radius: 999px;
}

.content-skeleton__line--compact {
  height: 12px;
}

.content-skeleton__line--short {
  width: 68%;
}

.skeleton {
  background:
    linear-gradient(90deg, rgb(228 222 208 / 0.45), rgb(255 255 255 / 0.86), rgb(228 222 208 / 0.45));
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.3s linear infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -40% 0;
  }
}
</style>
