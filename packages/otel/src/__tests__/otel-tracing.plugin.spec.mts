import { Container, Injectable } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Traceable, Traced } from '../decorators/traced.decorator.mjs'
import { defineOtelTracingPlugin } from '../plugins/otel-tracing.plugin.mjs'

describe('defineOtelTracingPlugin (middleware)', () => {
  let container: Container

  beforeEach(() => {
    container = new Container({ plugins: [defineOtelTracingPlugin({})] })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('returns a Plugin value from the factory with the otel-tracing name', () => {
    const plugin = defineOtelTracingPlugin({})
    expect(plugin.name).toBe('otel-tracing')
    expect(typeof plugin.middleware).toBe('function')
  })

  it('wraps a @Traced class instance with a tracing proxy that still behaves like the original', async () => {
    @Injectable()
    @Traced({ name: 'traced-service' })
    class TracedService {
      callCount = 0

      doWork() {
        this.callCount++
        return 'work-result'
      }
    }

    const service = await container.get(TracedService)

    // The proxy must transparently forward to the real implementation.
    expect(service.doWork()).toBe('work-result')
    expect(service).toBeInstanceOf(TracedService)
    expect(service.callCount).toBe(1)
  })

  it('wraps a @Traceable class and forwards method calls', async () => {
    @Injectable()
    @Traceable({ name: 'traceable-service' })
    class TraceableService {
      @Traced({ name: 'process' })
      process(value: number) {
        return value * 2
      }

      untraced() {
        return 'untraced'
      }
    }

    const service = await container.get(TraceableService)

    expect(service.process(21)).toBe(42)
    expect(service.untraced()).toBe('untraced')
  })

  it('returns an undecorated class instance untouched (no proxy)', async () => {
    @Injectable()
    class PlainService {
      ping() {
        return 'pong'
      }
    }

    const service = await container.get(PlainService)

    expect(service).toBeInstanceOf(PlainService)
    expect(service.ping()).toBe('pong')
  })

  it('returns the same wrapped instance on repeated resolution (singleton caching)', async () => {
    @Injectable()
    @Traced({ name: 'cached-service' })
    class CachedService {
      id() {
        return 'cached'
      }
    }

    const first = await container.get(CachedService)
    const second = await container.get(CachedService)

    expect(first).toBe(second)
    expect(first.id()).toBe('cached')
  })

  it('propagates errors thrown by traced methods', async () => {
    @Injectable()
    @Traced({ name: 'throwing-service' })
    class ThrowingService {
      boom() {
        throw new Error('kaboom')
      }
    }

    const service = await container.get(ThrowingService)

    expect(() => service.boom()).toThrow('kaboom')
  })

  it('preserves async return values through the traced proxy', async () => {
    @Injectable()
    @Traced({ name: 'async-service' })
    class AsyncService {
      async fetch() {
        await Promise.resolve()
        return 'async-value'
      }
    }

    const service = await container.get(AsyncService)

    await expect(service.fetch()).resolves.toBe('async-value')
  })
})
