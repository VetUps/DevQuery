<script setup lang="ts">
import { computed } from 'vue'

import VoteBalanceMeter from '@/features/questions/components/VoteBalanceMeter.vue'

const props = withDefaults(defineProps<{
  score: number
  upvotes: number
  downvotes: number
  userVote?: string | null
  label?: string
}>(), {
  userVote: null,
  label: 'Баланс голосов',
})

const userVoteLabel = computed(() => {
  if (props.userVote === 'up') {
    return 'Ваш прошлый голос: поддержка'
  }

  if (props.userVote === 'down') {
    return 'Ваш прошлый голос: против'
  }

  return ''
})
</script>

<template>
  <aside class="read-only-vote-block" data-testid="read-only-vote-block">
    <p class="read-only-vote-block__label">{{ label }}</p>

    <div class="read-only-vote-block__score-group">
      <strong class="read-only-vote-block__score">{{ score }}</strong>
      <span class="read-only-vote-block__score-caption">текущий счёт</span>
    </div>

    <VoteBalanceMeter :upvotes="upvotes" :downvotes="downvotes" />

    <p class="read-only-vote-block__note">{{ userVoteLabel }}</p>
  </aside>
</template>

<style scoped>
.read-only-vote-block {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid rgb(207 198 180 / 0.84);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.82), rgb(247 243 234 / 0.94));
}

.read-only-vote-block__label,
.read-only-vote-block__score-caption,
.read-only-vote-block__note {
  margin: 0;
}

.read-only-vote-block__label {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.read-only-vote-block__score-group {
  display: grid;
  gap: var(--space-xs);
}

.read-only-vote-block__score {
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.read-only-vote-block__score-caption,
.read-only-vote-block__note {
  color: var(--color-muted);
}

.read-only-vote-block__note {
  font-size: 14px;
  line-height: 1.5;
}
</style>
