// oxlint-disable no-unused-vars
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Container,
  definePlugin,
  Inject,
  Injectable,
  InjectableScope,
  Registry,
} from '../index.mjs'

import type { CreateContext, DestroyContext } from '../index.mjs'

describe('Plugin integration (Container + InstanceResolver + ServiceInvalidator)', () => {
  let registry: Registry
  let mockLogger: Console & {
    log: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    debug: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    registry = new Registry()
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as any
  })

  describe('onAfterCreate observer', () => {
    it('observes a constructed @Injectable with its target', async () => {
      @Injectable({ registry })
      class ObservedService {
        readonly tag = 'observed'
      }

      const seen: Array<{ target: string; instanceName: string; instance: unknown }> = []
      const container = new Container({
        registry,
        logger: mockLogger,
        plugins: [
          definePlugin({
            name: 'observer',
            onAfterCreate(ctx: CreateContext, instance: unknown) {
              seen.push({
                target: ctx.target.name,
                instanceName: ctx.instanceName,
                instance,
              })
            },
          }),
        ],
      })

      const svc = await container.get(ObservedService)

      expect(svc).toBeInstanceOf(ObservedService)
      expect(seen).toHaveLength(1)
      expect(seen[0]!.target).toBe('ObservedService')
      expect(seen[0]!.instance).toBe(svc)
      expect(seen[0]!.instanceName).toContain('ObservedService')

      await container.dispose()
    })
  })

  describe('middleware wrapping (OTEL contract)', () => {
    it('wraps the instance and the wrapped value is both returned and cached', async () => {
      @Injectable({ registry })
      class WrappedService {
        value() {
          return 'raw'
        }
      }

      let mwRuns = 0
      const container = new Container({
        registry,
        logger: mockLogger,
        plugins: [
          definePlugin({
            name: 'wrapper',
            async middleware(_ctx, next) {
              mwRuns++
              const instance = (await next()) as WrappedService
              return {
                wrapped: true,
                value: () => `wrapped:${instance.value()}`,
              }
            },
          }),
        ],
      })

      const first = (await container.get(WrappedService)) as any
      expect(first.wrapped).toBe(true)
      expect(first.value()).toBe('wrapped:raw')
      expect(mwRuns).toBe(1)

      // Second get: cached singleton, middleware NOT re-run, same wrapped value.
      const second = (await container.get(WrappedService)) as any
      expect(second).toBe(first)
      expect(mwRuns).toBe(1)

      // The WRAPPED value is what is stored: invalidate by the wrapped
      // instance must find the holder.
      await expect(container.invalidate(first)).resolves.toBeUndefined()

      await container.dispose()
    })
  })

  describe('singleton vs transient frequency', () => {
    it('runs middleware/hooks exactly once for a singleton across two gets', async () => {
      @Injectable({ registry })
      class SingletonSvc {}

      const calls = { before: 0, mw: 0, after: 0 }
      const container = new Container({
        registry,
        plugins: [
          definePlugin({
            name: 'counter',
            onBeforeCreate() {
              calls.before++
            },
            async middleware(_ctx, next) {
              calls.mw++
              return next()
            },
            onAfterCreate() {
              calls.after++
            },
          }),
        ],
      })

      await container.get(SingletonSvc)
      await container.get(SingletonSvc)

      expect(calls).toEqual({ before: 1, mw: 1, after: 1 })

      await container.dispose()
    })

    it('runs middleware/hooks per get for a transient', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientSvc {}

      const calls = { before: 0, mw: 0, after: 0 }
      const container = new Container({
        registry,
        plugins: [
          definePlugin({
            name: 'counter',
            onBeforeCreate() {
              calls.before++
            },
            async middleware(_ctx, next) {
              calls.mw++
              return next()
            },
            onAfterCreate() {
              calls.after++
            },
          }),
        ],
      })

      const a = await container.get(TransientSvc)
      const b = await container.get(TransientSvc)
      expect(a).not.toBe(b)
      // Transient = no cache, so hooks/middleware run once per get.
      expect(calls).toEqual({ before: 2, mw: 2, after: 2 })

      await container.dispose()
    })
  })

  describe('error isolation vs propagation', () => {
    it('a throwing onAfterCreate does NOT break get and is reported via the logger', async () => {
      @Injectable({ registry })
      class StillResolves {}

      const container = new Container({
        registry,
        logger: mockLogger,
        plugins: [
          definePlugin({
            name: 'bad-observer',
            onAfterCreate() {
              throw new Error('boom in observer')
            },
          }),
        ],
      })

      const svc = await container.get(StillResolves)
      expect(svc).toBeInstanceOf(StillResolves)

      // Reported via the container-logger-backed onPluginError.
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[navios/di] plugin "bad-observer" onAfterCreate hook failed',
        expect.any(Error),
      )

      await container.dispose()
    })

    it('a throwing middleware DOES reject get (propagation)', async () => {
      @Injectable({ registry })
      class FailsResolution {}

      const container = new Container({
        registry,
        logger: mockLogger,
        plugins: [
          definePlugin({
            name: 'aborter',
            async middleware() {
              throw new Error('aborted by middleware')
            },
          }),
        ],
      })

      await expect(container.get(FailsResolution)).rejects.toThrow()

      await container.dispose()
    })
  })

  describe('destroy hooks', () => {
    it('fires runBeforeDestroy/runAfterDestroy on invalidate', async () => {
      @Injectable({ registry })
      class Destroyable {}

      const order: string[] = []
      let beforeInstanceSeen: unknown
      const container = new Container({
        registry,
        plugins: [
          definePlugin({
            name: 'destroy-observer',
            onBeforeDestroy(ctx: DestroyContext, instance: unknown) {
              order.push(`before:${ctx.instanceName.includes('Destroyable')}`)
              beforeInstanceSeen = instance
            },
            onAfterDestroy(ctx: DestroyContext) {
              order.push(`after:${ctx.instanceName.includes('Destroyable')}`)
            },
          }),
        ],
      })

      const svc = await container.get(Destroyable)
      await container.invalidate(svc)

      expect(order).toEqual(['before:true', 'after:true'])
      expect(beforeInstanceSeen).toBe(svc)

      await container.dispose()
    })

    it('fires runBeforeDestroy/runAfterDestroy for a CASCADE-invalidated dependent', async () => {
      @Injectable({ registry })
      class Base {}

      @Injectable({ registry })
      class Dependent {
        @Inject(Base) accessor base!: Base
      }

      const events: string[] = []
      const container = new Container({
        registry,
        plugins: [
          definePlugin({
            name: 'cascade-destroy-observer',
            onBeforeDestroy(ctx: DestroyContext) {
              events.push(
                `before:${ctx.instanceName.includes('Dependent') ? 'Dependent' : ctx.instanceName.includes('Base') ? 'Base' : ctx.instanceName}`,
              )
            },
            onAfterDestroy(ctx: DestroyContext) {
              events.push(
                `after:${ctx.instanceName.includes('Dependent') ? 'Dependent' : ctx.instanceName.includes('Base') ? 'Base' : ctx.instanceName}`,
              )
            },
          }),
        ],
      })

      // Resolving Dependent eagerly injects Base, registering a real
      // subscription edge (Dependent depends on Base).
      const dependent = await container.get(Dependent)
      expect(dependent.base).toBeInstanceOf(Base)
      const base = await container.get(Base)

      // Cascade: Base invalidated -> Dependent must cascade-destroy.
      await container.invalidate(base)

      // BOTH must fire before+after destroy hooks. Before the fix the
      // Dependent's cascade destroy hooks were silently skipped.
      expect(events).toContain('before:Base')
      expect(events).toContain('after:Base')
      expect(events).toContain('before:Dependent')
      expect(events).toContain('after:Dependent')

      await container.dispose()
    })

    it('fires onContainerDispose on dispose()', async () => {
      const disposed: string[] = []
      const container = new Container({
        registry,
        plugins: [
          definePlugin({
            name: 'dispose-observer',
            onContainerDispose() {
              disposed.push('disposed')
            },
          }),
        ],
      })

      await container.dispose()
      expect(disposed).toEqual(['disposed'])
    })
  })

  describe('container.use() after construction', () => {
    it('applies a plugin registered post-construction to subsequently-created instances', async () => {
      @Injectable({ registry })
      class LateService {}

      const container = new Container({ registry })

      const seen: string[] = []
      container.use(
        definePlugin({
          name: 'late',
          onAfterCreate(ctx: CreateContext) {
            seen.push(ctx.target.name)
          },
        }),
      )

      await container.get(LateService)
      expect(seen).toEqual(['LateService'])

      await container.dispose()
    })
  })

  describe('middleware resolving another service', () => {
    it('can await ctx.container.get(Other) inside middleware (no cycle)', async () => {
      @Injectable({ registry })
      class Helper {
        readonly help = 'helped'
      }

      @Injectable({ registry })
      class Main {
        decorated?: string
      }

      const container = new Container({
        registry,
        plugins: [
          definePlugin({
            name: 'resolver',
            async middleware(ctx, next) {
              const instance = (await next()) as Main
              if (ctx.target.name === 'Main') {
                const helper = await ctx.container.get(Helper)
                instance.decorated = helper.help
              }
              return instance
            },
          }),
        ],
      })

      const main = await container.get(Main)
      expect(main).toBeInstanceOf(Main)
      expect(main.decorated).toBe('helped')

      await container.dispose()
    })
  })
})
