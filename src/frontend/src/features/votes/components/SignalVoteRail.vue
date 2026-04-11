<script setup lang="ts">
import { computed } from 'vue'

import VoteBalanceMeter from '@/features/questions/components/VoteBalanceMeter.vue'
import { useVoteMutation } from '@/features/votes/mutations/useVoteMutation'
import type { VoteTargetType, VoteType } from '@/features/votes/api/votes'

interface Props {
  mode: 'interactive' | 'readonly'
  score: number
  upvotes: number
  downvotes: number
  userVote?: VoteType | null | string
  targetType?: VoteTargetType
  targetId?: string
  questionId?: string
  isOwnContent?: boolean
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  userVote: null,
  targetType: undefined,
  targetId: undefined,
  questionId: undefined,
  isOwnContent: false,
  label: 'Баланс голосов',
})

const voteMutation = useVoteMutation()

const isInteractive = computed(() => props.mode === 'interactive' && !props.isOwnContent)
const currentVoteLabel = computed(() => {
  if (props.isOwnContent) {
    return 'Свой контент нельзя оценивать собственным голосом.'
  }

  if (props.userVote === 'up') {
    return 'Ваш сигнал: поддержка'
  }

  if (props.userVote === 'down') {
    return 'Ваш сигнал: против'
  }

  if (props.mode === 'readonly') {
    return 'Чтобы голосовать, войдите в аккаунт.'
  }

  return 'Можно усилить или ослабить сигнал одним нажатием.'
})

async function handleVote(requestedVote: VoteType) {
  if (!isInteractive.value || !props.targetType || !props.targetId) {
    return
  }

  await voteMutation.mutateAsync({
    targetType: props.targetType,
    targetId: props.targetId,
    questionId: props.questionId,
    currentVote: props.userVote,
    requestedVote,
  })
}
</script>

<template>
  <aside class="signal-vote-rail" data-testid="signal-vote-rail">
    <p class="signal-vote-rail__label">{{ label }}</p>

    <div class="signal-vote-rail__core">
      <button
        v-if="isInteractive"
        type="button"
        class="signal-vote-rail__action signal-vote-rail__action--up"
        :class="{ 'signal-vote-rail__action--active': userVote === 'up' }"
        :disabled="voteMutation.isPending.value"
        :aria-pressed="userVote === 'up'"
        @click="handleVote('up')"
      >
        Поддержать
      </button>

      <strong class="signal-vote-rail__score">{{ score }}</strong>

      <button
        v-if="isInteractive"
        type="button"
        class="signal-vote-rail__action signal-vote-rail__action--down"
        :class="{ 'signal-vote-rail__action--active': userVote === 'down' }"
        :disabled="voteMutation.isPending.value"
        :aria-pressed="userVote === 'down'"
        @click="handleVote('down')"
      >
        Против
      </button>
    </div>

    <VoteBalanceMeter :upvotes="upvotes" :downvotes="downvotes" />

    <p class="signal-vote-rail__note">{{ currentVoteLabel }}</p>
  </aside>
</template>

<style scoped>
.signal-vote-rail {
  display: grid;
  gap: var(--space-sm);
  width: 100%;
  max-width: 260px;
  min-width: 0;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.78);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.86), rgb(247 243 234 / 0.92));
}

.signal-vote-rail__label,
.signal-vote-rail__note {
  margin: 0;
}

.signal-vote-rail__label {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.signal-vote-rail__core {
  display: grid;
  gap: var(--space-xs);
  justify-items: center;
}

.signal-vote-rail__score {
  font-size: 36px;
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.signal-vote-rail__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  width: 100%;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.92);
  font-size: 13px;
  font-weight: 600;
}

.signal-vote-rail__action--up {
  color: #2F855A;
}

.signal-vote-rail__action--down {
  color: #B42318;
}

.signal-vote-rail__action--active.signal-vote-rail__action--up {
  border-color: rgb(47 133 90 / 0.24);
  background: rgb(47 133 90 / 0.1);
}

.signal-vote-rail__action--active.signal-vote-rail__action--down {
  border-color: rgb(180 35 24 / 0.24);
  background: rgb(180 35 24 / 0.08);
}

.signal-vote-rail__note {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

@media (width <= 900px) {
  .signal-vote-rail {
    max-width: none;
  }
}
</style>
