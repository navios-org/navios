import { describe, expect, it, vi } from 'vitest'

import {
  getCurrentSpan,
  getCurrentSpanContext,
  runWithSpanContext,
} from '../stores/span-context.store.mjs'

describe('span-context.store', () => {
  describe('runWithSpanContext', () => {
    it('should run function within span context', () => {
      const mockSpan = { name: 'test-span' } as any

      let capturedContext: any
      runWithSpanContext({ span: mockSpan }, () => {
        capturedContext = getCurrentSpanContext()
      })

      expect(capturedContext).toEqual({ span: mockSpan })
    })

    it('should return function result', () => {
      const mockSpan = { name: 'test-span' } as any

      const result = runWithSpanContext({ span: mockSpan }, () => {
        return 'result'
      })

      expect(result).toBe('result')
    })

    it('should support async functions', async () => {
      const mockSpan = { name: 'test-span' } as any

      let capturedSpan: any
      const result = await runWithSpanContext({ span: mockSpan }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        capturedSpan = getCurrentSpan()
        return 'async-result'
      })

      expect(result).toBe('async-result')
      expect(capturedSpan).toBe(mockSpan)
    })

    it('should handle nested contexts', () => {
      const outerSpan = { name: 'outer' } as any
      const innerSpan = { name: 'inner' } as any

      let outerCapture: any
      let innerCapture: any
      let afterInnerCapture: any

      runWithSpanContext({ span: outerSpan }, () => {
        outerCapture = getCurrentSpan()

        runWithSpanContext({ span: innerSpan }, () => {
          innerCapture = getCurrentSpan()
        })

        afterInnerCapture = getCurrentSpan()
      })

      expect(outerCapture?.name).toBe('outer')
      expect(innerCapture?.name).toBe('inner')
      expect(afterInnerCapture?.name).toBe('outer')
    })
  })

  describe('getCurrentSpan', () => {
    it('should return undefined outside context', () => {
      expect(getCurrentSpan()).toBeUndefined()
    })

    it('should return current span within context', () => {
      const mockSpan = { name: 'test-span' } as any

      runWithSpanContext({ span: mockSpan }, () => {
        expect(getCurrentSpan()).toBe(mockSpan)
      })
    })
  })

  describe('getCurrentSpanContext', () => {
    it('should return undefined outside context', () => {
      expect(getCurrentSpanContext()).toBeUndefined()
    })

    it('should return full context within context', () => {
      const mockSpan = { name: 'test-span' } as any
      const mockBaggage = { items: [] } as any

      runWithSpanContext({ span: mockSpan, baggage: mockBaggage }, () => {
        const context = getCurrentSpanContext()
        expect(context?.span).toBe(mockSpan)
        expect(context?.baggage).toBe(mockBaggage)
      })
    })
  })
})
