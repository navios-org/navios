import { context as otelContext, propagation, trace } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  getCurrentSpan,
  getCurrentSpanContext,
  runWithSpanContext,
} from '../tracing/span-context.mjs'

describe('span-context.store', () => {
  // The helpers are thin wrappers over the OpenTelemetry context, which needs
  // a context manager to hold anything. Registering a provider installs one.
  beforeAll(() => {
    new NodeTracerProvider().register()
  })

  afterAll(() => {
    trace.disable()
    otelContext.disable()
    propagation.disable()
  })

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

describe('span-context.store without a context manager', () => {
  it('runs the function but has no active span to report', () => {
    const mockSpan = { name: 'test-span' } as any

    const seen = runWithSpanContext({ span: mockSpan }, () => getCurrentSpan())

    expect(seen).toBeUndefined()
  })
})
