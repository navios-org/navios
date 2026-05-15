import { Container, Inject, Injectable } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Traceable, Traced } from '../decorators/traced.decorator.mjs'
import { defineOtelTracingPlugin } from '../plugins/otel-tracing.plugin.mjs'
import { SpanFactoryService } from '../services/span-factory.service.mjs'

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

  // Regression guard for the v1 -> v2 migration: in v1 a `pre:adapter-resolve`
  // plugin rewrote the registry so that *every* consumer of a @Traced token
  // transparently received the wrapped instance. The v2 middleware wraps per
  // resolution instead, so a service that *injects* a @Traced dependency must
  // still receive the traced proxy (not the raw instance). Without this test
  // the suite would pass even if injection delivered the unwrapped object.
  it('delivers the traced proxy (not the raw instance) to an injecting consumer', async () => {
    const spanFactory = await container.get(SpanFactoryService)
    const createChildSpan = vi.spyOn(spanFactory, 'createChildSpan')

    @Injectable()
    @Traced({ name: 'traced-dep' })
    class TracedDep {
      compute(value: number) {
        return value + 1
      }
    }

    @Injectable()
    class Consumer {
      @Inject(TracedDep) private accessor dep!: TracedDep

      get dependency(): TracedDep {
        return this.dep
      }
    }

    const consumer = await container.get(Consumer)

    // Transparency through the injected reference: the proxied method still
    // returns the correct value.
    expect(consumer.dependency.compute(41)).toBe(42)

    // The injected reference is the tracing proxy, proven by span emission
    // (the same technique the suite uses to distinguish wrapped vs raw):
    // an unwrapped instance would never call into SpanFactoryService.
    expect(createChildSpan).toHaveBeenCalledTimes(1)
    expect(createChildSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'traced-dep.compute' }),
    )
  })

  // Proves tracing is not a silent no-op pass-through. Every other test in
  // this file would still pass if the proxy forwarded calls without ever
  // creating a span; this asserts an actual span is emitted for @Traced
  // methods (with the expected `Class.method` name and ended on both success
  // and throw) and is NOT emitted for an undecorated service.
  it('emits exactly one span for a @Traced method and none for an undecorated method', async () => {
    const spanFactory = await container.get(SpanFactoryService)
    const endSpy = vi.fn()
    const setStatusSpy = vi.fn()
    const createChildSpan = vi
      .spyOn(spanFactory, 'createChildSpan')
      .mockImplementation((options) => {
        return {
          name: options.name,
          end: endSpy,
          setStatus: setStatusSpy,
          recordException: vi.fn(),
          setAttribute: vi.fn(),
        } as unknown as ReturnType<SpanFactoryService['createChildSpan']>
      })

    @Injectable()
    @Traced({ name: 'observed-service' })
    class ObservedService {
      ok() {
        return 'ok'
      }

      fail(): never {
        throw new Error('observed-failure')
      }
    }

    @Injectable()
    class UndecoratedService {
      noop() {
        return 'noop'
      }
    }

    const observed = await container.get(ObservedService)
    const undecorated = await container.get(UndecoratedService)

    // Untraced service: no span ever created.
    expect(undecorated.noop()).toBe('noop')
    expect(createChildSpan).not.toHaveBeenCalled()

    // Traced success path: exactly one span, correct `Class.method` name,
    // span ended.
    expect(observed.ok()).toBe('ok')
    expect(createChildSpan).toHaveBeenCalledTimes(1)
    expect(createChildSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'observed-service.ok' }),
    )
    expect(endSpy).toHaveBeenCalledTimes(1)

    // Traced throw path: span still created and ended (error propagates).
    expect(() => observed.fail()).toThrow('observed-failure')
    expect(createChildSpan).toHaveBeenCalledTimes(2)
    expect(createChildSpan).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'observed-service.fail' }),
    )
    expect(endSpy).toHaveBeenCalledTimes(2)
  })
})
