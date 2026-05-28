import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UserAvatar from '@/shared/ui/UserAvatar.vue'

describe('UserAvatar', () => {
  it('adds version cache busting to unsigned avatar URLs', () => {
    const wrapper = mount(UserAvatar, {
      props: {
        url: 'https://cdn.example.test/avatars/user-1.jpg',
        version: '2026-05-25T18:30:00Z',
      },
    })

    expect(wrapper.get('img').attributes('src')).toBe(
      'https://cdn.example.test/avatars/user-1.jpg?v=2026-05-25T18%3A30%3A00Z',
    )
  })

  it('does not mutate S3 signed URLs because extra query params break the signature', () => {
    const signedUrl = 'https://s3.cloud.ru/devquery/avatars/user-1.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=tenant%3Akey&X-Amz-Signature=signed-value'

    const wrapper = mount(UserAvatar, {
      props: {
        url: signedUrl,
        version: '2026-05-25T18:30:00Z',
      },
    })

    expect(wrapper.get('img').attributes('src')).toBe(signedUrl)
  })
})
