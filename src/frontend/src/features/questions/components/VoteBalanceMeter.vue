<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  upvotes: number
  downvotes: number
}>()

const totalVotes = computed(() => props.upvotes + props.downvotes)
const upvoteWidth = computed(() => {
  if (totalVotes.value === 0) {
    return '50%'
  }

  return `${(props.upvotes / totalVotes.value) * 100}%`
})

const downvoteWidth = computed(() => {
  if (totalVotes.value === 0) {
    return '50%'
  }

  return `${(props.downvotes / totalVotes.value) * 100}%`
})
</script>

<template>
  <div class="vote-balance-meter" data-testid="vote-balance-meter">
    <div class="vote-balance-meter__bar" aria-hidden="true">
      <span
        class="vote-balance-meter__segment vote-balance-meter__segment--up"
        :style="{ width: upvoteWidth }"
      />
      <span
        class="vote-balance-meter__segment vote-balance-meter__segment--down"
        :style="{ width: downvoteWidth }"
      />
    </div>

    <div class="vote-balance-meter__legend">
      <span class="vote-balance-meter__label vote-balance-meter__label--up">
        Поддержали: {{ upvotes }}
      </span>
      <span class="vote-balance-meter__label vote-balance-meter__label--down">
        Против: {{ downvotes }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.vote-balance-meter {
  display: grid;
  gap: var(--space-sm);
}

.vote-balance-meter__bar {
  display: flex;
  overflow: hidden;
  min-height: 12px;
  border-radius: 999px;
  background: rgb(31 41 51 / 0.08);
}

.vote-balance-meter__segment {
  display: block;
  transition: width 0.2s ease;
}

.vote-balance-meter__segment--up {
  background: #2F855A;
}

.vote-balance-meter__segment--down {
  background: #B42318;
}

.vote-balance-meter__legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-sm);
  color: var(--color-muted);
  font-size: 13px;
}

.vote-balance-meter__label--up {
  color: #2F855A;
}

.vote-balance-meter__label--down {
  color: #B42318;
}
</style>
