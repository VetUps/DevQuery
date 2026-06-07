// Кратко: держит основную логику этого файла.
import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement) {
    const gradient = { addColorStop: () => {} }

    return {
      canvas: this,
      arc: () => {},
      beginPath: () => {},
      bezierCurveTo: () => {},
      clearRect: () => {},
      clip: () => {},
      closePath: () => {},
      createLinearGradient: () => gradient,
      createPattern: () => null,
      createRadialGradient: () => gradient,
      drawImage: () => {},
      fill: () => {},
      fillRect: () => {},
      fillText: () => {},
      lineTo: () => {},
      measureText: () => ({ width: 0 }),
      moveTo: () => {},
      quadraticCurveTo: () => {},
      rect: () => {},
      resetTransform: () => {},
      restore: () => {},
      rotate: () => {},
      save: () => {},
      scale: () => {},
      setLineDash: () => {},
      setTransform: () => {},
      stroke: () => {},
      strokeRect: () => {},
      strokeText: () => {},
      translate: () => {},
    }
  },
})

afterEach(() => {
  vi.restoreAllMocks()
})

config.global.stubs = {
  transition: false,
  'transition-group': false,
}

config.global.plugins = [VueQueryPlugin]
