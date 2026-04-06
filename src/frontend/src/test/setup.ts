import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'

afterEach(() => {
  vi.restoreAllMocks()
})

config.global.stubs = {
  transition: false,
  'transition-group': false,
}
