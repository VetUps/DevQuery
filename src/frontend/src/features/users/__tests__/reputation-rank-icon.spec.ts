import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { getReputationRankDescriptor } from '@/features/users/api/reputation'
import AuthorReputationBadge from '@/features/users/components/AuthorReputationBadge.vue'
import ProfileReputationSummary from '@/features/users/components/ProfileReputationSummary.vue'
import ReputationRankIcon from '@/features/users/components/ReputationRankIcon.vue'

function rankParts(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-rank-part]').map((part) => part.attributes('data-rank-part'))
}

const baseReputation = {
  score: 320,
  level: 'master' as const,
  level_label: 'Мастер',
  level_minimum_score: 300,
  next_level: null,
  next_level_label: null,
  next_level_minimum_score: null,
  points_to_next_level: 0,
}

describe('reputation rank icons', () => {
  it('maps all reputation levels to the requested rank shapes', () => {
    expect(getReputationRankDescriptor('newcomer')?.parts).toEqual(['star'])
    expect(getReputationRankDescriptor('participant')?.parts).toEqual(['star', 'star'])
    expect(getReputationRankDescriptor('expert')?.parts).toEqual(['star', 'star', 'star'])
    expect(getReputationRankDescriptor('master')?.parts).toEqual(['star', 'star', 'star'])
    expect(getReputationRankDescriptor('legacy')).toBeNull()
  })

  it('renders stable rank hooks without exposing decorative SVGs as text', () => {
    const wrapper = mount(ReputationRankIcon, {
      props: { level: 'participant' },
    })

    expect(wrapper.get('[data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('participant')
    expect(rankParts(wrapper)).toEqual(['star', 'star'])
    expect(wrapper.text()).toBe('')
  })

  it('adds rank icons to author reputation badges while preserving legacy score-only badges', () => {
    const ranked = mount(AuthorReputationBadge, {
      props: { reputation: baseReputation },
    })
    const legacy = mount(AuthorReputationBadge, {
      props: { fallbackScore: 12 },
    })

    expect(ranked.get('[data-testid="author-reputation-badge"]').text()).toContain('Мастер')
    expect(rankParts(ranked)).toEqual(['star', 'star', 'star'])
    expect(legacy.find('[data-testid="reputation-rank-icon"]').exists()).toBe(false)
    expect(legacy.get('[data-testid="author-reputation-badge"]').text()).toContain('12')
  })

  it('shows the same rank mark in the profile reputation summary', () => {
    const wrapper = mount(ProfileReputationSummary, {
      props: { reputation: baseReputation },
      global: {
        stubs: {
          SurfacePanel: { template: '<section><slot /></section>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Мастер')
    expect(wrapper.get('[data-testid="reputation-rank-icon"]').attributes('data-rank-level')).toBe('master')
    expect(rankParts(wrapper)).toEqual(['star', 'star', 'star'])
  })
})
