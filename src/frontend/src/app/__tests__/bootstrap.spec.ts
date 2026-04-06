import { describe, expect, it } from 'vitest'

import { queryClient } from '@/app/query-client'
import { router } from '@/app/router'

describe('frontend bootstrap', () => {
  it('creates a query client instance', () => {
    expect(queryClient).toBeDefined()
    expect(typeof queryClient.getDefaultOptions).toBe('function')
  })

  it('creates a router instance', () => {
    expect(router).toBeDefined()
    expect(typeof router.push).toBe('function')
  })
})
