<script setup lang="ts">
import { computed } from 'vue'
import type { LocationQueryRaw } from 'vue-router'

import type { QuestionTag } from '@/features/questions/api/questions'

const props = withDefaults(defineProps<{
  tags?: QuestionTag[]
  variant?: 'compact' | 'large'
  linkToDiscovery?: boolean
  tagLinkPath?: string
  tagLinkQueryBase?: LocationQueryRaw
}>(), {
  tags: () => [],
  variant: 'compact',
  linkToDiscovery: true,
  tagLinkPath: '/',
  tagLinkQueryBase: () => ({}),
})

const visibleTags = computed(() =>
  props.tags
    .map((tag) => ({ ...tag, name: tag.name.trim() }))
    .filter((tag) => tag.name.length > 0),
)
</script>

<template>
  <nav
    v-if="visibleTags.length > 0"
    class="question-tag-chips"
    :class="`question-tag-chips--${variant}`"
    aria-label="Теги вопроса"
    data-testid="question-tag-chips"
  >
    <template v-if="linkToDiscovery">
      <RouterLink
        v-for="tag in visibleTags"
        :key="tag.name"
        class="question-tag-chips__chip"
        :to="{ path: tagLinkPath, query: { ...tagLinkQueryBase, tag: tag.name } }"
        :aria-label="`Фильтровать вопросы по тегу ${tag.name}`"
      >
        #{{ tag.name }}
      </RouterLink>
    </template>

    <template v-else>
      <span
        v-for="tag in visibleTags"
        :key="tag.name"
        class="question-tag-chips__chip question-tag-chips__chip--static"
      >
        #{{ tag.name }}
      </span>
    </template>
  </nav>
</template>

<style scoped>
.question-tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  min-width: 0;
}

.question-tag-chips__chip {
  display: inline-flex;
  align-items: center;
  max-width: min(100%, 18rem);
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgb(14 116 144 / 0.18);
  border-radius: 999px;
  background: rgb(14 116 144 / 0.08);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  overflow-wrap: anywhere;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.question-tag-chips__chip:hover {
  transform: translateY(-1px);
  border-color: rgb(14 116 144 / 0.34);
  background: rgb(14 116 144 / 0.14);
}

.question-tag-chips__chip:focus-visible {
  outline: 3px solid rgb(14 116 144 / 0.28);
  outline-offset: 2px;
}

.question-tag-chips__chip--static:hover {
  transform: none;
}

.question-tag-chips--large {
  gap: var(--space-sm);
}

.question-tag-chips--large .question-tag-chips__chip {
  min-height: 34px;
  padding: 0 12px;
  font-size: 14px;
}
</style>
