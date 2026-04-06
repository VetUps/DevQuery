import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ReadOnlyVoteBlock from '@/features/questions/components/ReadOnlyVoteBlock.vue'
import VoteBalanceMeter from '@/features/questions/components/VoteBalanceMeter.vue'

describe('VoteBalanceMeter', () => {
  it('renders the read-only score and balance visualization', () => {
    const wrapper = mount(ReadOnlyVoteBlock, {
      props: {
        score: 14,
        upvotes: 18,
        downvotes: 4,
        userVote: null,
      },
    })

    expect(wrapper.text()).toContain('14')
    expect(wrapper.findComponent(VoteBalanceMeter).exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
