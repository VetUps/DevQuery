<script setup lang="ts">
import { computed, ref } from 'vue'

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
  downvoteBlocked?: boolean
  blockedNote?: string
}

const props = withDefaults(defineProps<Props>(), {
  userVote: null,
  targetType: undefined,
  targetId: undefined,
  questionId: undefined,
  isOwnContent: false,
  label: 'Баланс голосов',
  downvoteBlocked: false,
  blockedNote: '',
})

const voteMutation = useVoteMutation()

const isInteractive = computed(() => props.mode === 'interactive' && !props.isOwnContent)
const canDownvote = computed(() => !props.downvoteBlocked)


const particles = ref<Array<{ id: number; x: number; y: number; tx: number; ty: number; type: 'up' | 'down' }>>([])
let particleId = 0

function spawnParticles(event: MouseEvent, type: 'up' | 'down') {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()

  const count = 4 + Math.floor(Math.random() * 3)
  for (let i = 0; i < count; i++) {
    const id = particleId++

    const startX = rect.left + rect.width / 2 + (Math.random() * 30 - 15)
    const startY = rect.top + rect.height / 2 + (Math.random() * 10 - 5)

    const tx = Math.random() * 80 - 40;
    const ty = type === 'up' ? -(Math.random() * 60 + 40) : (Math.random() * 60 + 40);

    particles.value.push({ id, x: startX, y: startY, tx, ty, type })

    setTimeout(() => {
      particles.value = particles.value.filter(p => p.id !== id)
    }, 800)
  }
}

async function handleVote(requestedVote: VoteType, event: MouseEvent) {
  if (!isInteractive.value || !props.targetType || !props.targetId) {
    return
  }

  if (props.userVote !== requestedVote) {
    spawnParticles(event, requestedVote)
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
        v-if="props.mode === 'interactive'"
        type="button"
        class="signal-vote-rail__action signal-vote-rail__action--up"
        :class="{ 'signal-vote-rail__action--active': userVote === 'up' }"
        :disabled="voteMutation.isPending.value || isOwnContent"
        :aria-pressed="userVote === 'up'"
        @click="handleVote('up', $event)"
      >
        ▲ Поддержать
      </button>

      <strong class="signal-vote-rail__score">{{ score }}</strong>

      <button
        v-if="props.mode === 'interactive' && canDownvote"
        type="button"
        class="signal-vote-rail__action signal-vote-rail__action--down"
        :class="{ 'signal-vote-rail__action--active': userVote === 'down' }"
        :disabled="voteMutation.isPending.value || isOwnContent"
        :aria-pressed="userVote === 'down'"
        @click="handleVote('down', $event)"
      >
        ▼ Против
      </button>

      <span
        v-else-if="props.mode === 'interactive' && downvoteBlocked"
        class="signal-vote-rail__blocked-pill"
        data-testid="vote-downvote-blocked"
      >
        Даунвоут временно отключён
      </span>
    </div>

    <VoteBalanceMeter :upvotes="upvotes" :downvotes="downvotes" />

    <Teleport to="body">
      <div
        v-for="p in particles"
        :key="p.id"
        class="vote-particle"
        :class="`vote-particle--${p.type}`"
        :style="{ left: p.x + 'px', top: p.y + 'px', '--tx': p.tx + 'px', '--ty': p.ty + 'px' }"
      >
        {{ p.type === 'up' ? '▲' : '▼' }}
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.signal-vote-rail {
  display: grid;
  gap: var(--space-sm);
  width: 100%;
  max-width: 260px;
  max-height: 260px;
  min-width: 0;
  padding: var(--space-md);
  border: 1px solid rgb(207 198 180 / 0.78);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.86), rgb(247 243 234 / 0.92));
}

.signal-vote-rail__label {
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
  border: 1px solid rgb(207 198 180 / 0.6);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.92);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), background 0.2s, border-color 0.2s;
}

.signal-vote-rail__action:hover:not(:disabled) {
  transform: scale(1.1);
}

.signal-vote-rail__action:active:not(:disabled) {
  transform: scale(0.9);
}

.signal-vote-rail__action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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

.signal-vote-rail__blocked-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  width: 100%;
  padding: 0 10px;
  border: 1px solid rgb(180 35 24 / 0.2);
  border-radius: 999px;
  background: rgb(180 35 24 / 0.08);
  color: #8F1D14;
  font-size: 13px;
  font-weight: 600;
}



@media (width <= 900px) {
  .signal-vote-rail {
    max-width: none;
  }
}

.vote-particle {
  position: fixed;
  pointer-events: none;
  font-size: 16px;
  font-weight: 800;
  z-index: 9999;
  animation: float-particle 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

.vote-particle--up {
  color: #2F855A;
  text-shadow: 0 0 4px rgba(47, 133, 90, 0.5);
}

.vote-particle--down {
  color: #B42318;
  text-shadow: 0 0 4px rgba(180, 35, 24, 0.5);
}

@keyframes float-particle {
  0% {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.5);
    opacity: 0;
  }
}
</style>
