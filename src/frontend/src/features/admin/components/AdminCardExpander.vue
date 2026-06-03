<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{
  baseHeight?: number
}>(), {
  baseHeight: 110
})

const contentRef = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)
const isExpanded = ref(false)

let observer: ResizeObserver | null = null

function checkOverflow() {
  if (contentRef.value) {
    isOverflowing.value = contentRef.value.scrollHeight > props.baseHeight
  }
}

onMounted(() => {
  if (contentRef.value) {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        checkOverflow()
      })
      observer.observe(contentRef.value)
    }
    // Run an initial check just in case
    checkOverflow()
  }
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div class="admin-card-expander" :class="{ 'is-expanded': isExpanded }">
    <div
      ref="contentRef"
      class="admin-card-expander__content"
      :style="{ height: isExpanded ? 'auto' : `${baseHeight}px` }"
      :class="{ 'is-clamped': !isExpanded && isOverflowing }"
    >
      <slot />
    </div>
    <div class="admin-card-expander__actions" :class="{ 'has-button': isOverflowing }">
      <button
        v-if="isOverflowing"
        type="button"
        class="admin-card-expander__toggle"
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? 'Скрыть' : 'Читать полностью' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.admin-card-expander {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.admin-card-expander__content {
  overflow: hidden;
}
.admin-card-expander__content.is-clamped {
  mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
}
.admin-card-expander__actions {
  display: flex;
  justify-content: flex-start;
}
.admin-card-expander__actions.has-button {
  margin-top: var(--space-xs);
}
.admin-card-expander__toggle {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 0;
}
.admin-card-expander__toggle:hover {
  text-decoration: underline;
}
</style>
