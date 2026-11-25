import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  Container,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  provide,
  ScopedContainer,
} from '../index.mjs'
import { TestContainer, UnitTestContainer } from '../testing/index.mjs'

import type { OnServiceDestroy, OnServiceInit } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** What a promise came to, or `hang` when it did not settle in time. */
const outcome = async (promise: Promise<unknown>, ms = 100): Promise<unknown> =>
  Promise.race([
    promise.then(
      (value) => value ?? 'resolved',
      (error) => error?.code ?? String(error),
    ),
    tick(ms).then(() => 'hang'),
  ])

describe('disposal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('a disposed root container', () => {
    it('stays disposed', async () => {
      const built = vi.fn()

      @Injectable()
      class Service {
        constructor() {
          built()
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Transient {}

      const TOKEN = InjectionToken.create<string>('token')
      const container = new Container({ providers: [provide(TOKEN, { value: 'value' })] })
      await container.get(Service)
      await container.dispose()

      const disposed = expect.objectContaining({ code: DIErrorCode.ContainerDisposed })
      await expect(container.get(Service)).rejects.toEqual(disposed)
      await expect(container.get(Transient)).rejects.toEqual(disposed)
      await expect(container.get(TOKEN)).rejects.toEqual(disposed)
      await expect(container.get(Container)).rejects.toEqual(disposed)
      expect(() => container.getSync(Service)).toThrow(disposed)
      expect(() => container.addInstance(TOKEN, 'x')).toThrow(disposed)
      expect(() => container.provide(TOKEN, { value: 'x' })).toThrow(disposed)
      expect(() => container.decorate(Service, (s) => s)).toThrow(disposed)
      expect(() => container.createScope()).toThrow(disposed)
      expect(built).toHaveBeenCalledTimes(1)
    })

    it('builds nothing through a scope that is still open', async () => {
      @Injectable()
      class Service {}

      @Injectable({ scope: InjectableScope.Request })
      class Handler {}

      const container = new Container()
      const scope = container.createScope()
      await container.dispose()

      const disposed = expect.objectContaining({ code: DIErrorCode.ContainerDisposed })
      await expect(scope.get(Service)).rejects.toEqual(disposed)
      await expect(scope.get(Handler)).rejects.toEqual(disposed)
      await scope.dispose()
    })

    it('returns the disposal in flight from a second dispose()', async () => {
      let done = false

      @Injectable()
      class Service implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick(5)
          done = true
        }
      }

      const container = new Container()
      await container.get(Service)
      const first = container.dispose()
      expect(container.dispose()).toBe(first)
      await container.dispose()
      expect(done).toBe(true)
    })

    it('rejects a get() that was in flight', async () => {
      const destroyed = vi.fn()

      @Injectable()
      class Slow implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick(5)
        }

        onServiceDestroy() {
          destroyed()
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class SlowTransient implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick(5)
        }

        onServiceDestroy() {
          destroyed()
        }
      }

      const container = new Container()
      const pending = [container.get(Slow), container.get(SlowTransient)].map((p) => outcome(p))
      await container.dispose()

      expect(destroyed).toHaveBeenCalledTimes(2)
      expect(await Promise.all(pending)).toEqual([
        DIErrorCode.ContainerDisposed,
        DIErrorCode.ContainerDisposed,
      ])
    })

    it('reports what a listener fails with, unless it was refused to resolve again', async () => {
      @Injectable()
      class Service {}

      @Injectable()
      class Other {}

      const error = vi.fn()
      const container = new Container({ logger: { error, warn: vi.fn() } as unknown as Console })
      await Promise.all([container.get(Service), container.get(Other)])
      container.onInvalidate(Service, undefined, async () => {
        await container.get(Service)
      })
      container.onInvalidate(Other, undefined, async () => {
        throw new Error('not a refusal')
      })
      await container.dispose()
      await tick()
      expect(error.mock.calls.map(([description]) => description)).toEqual([
        expect.stringContaining('An onInvalidate listener of Other failed'),
      ])
    })

    it('waits for what the destruction itself started', async () => {
      const log: string[] = []
      let late: (listener: () => Promise<void>) => void = () => {}
      const PRODUCT = InjectionToken.create<object>('product')

      @Injectable()
      class Service implements OnServiceDestroy {
        onServiceDestroy() {
          // The product is gone by now, so this runs at once.
          late(async () => {
            await tick(5)
            log.push('released')
          })
        }
      }

      const container = new Container({
        providers: [
          provide(PRODUCT, {
            factory: (ctx) => {
              late = ctx.addDestroyListener
              return {}
            },
          }),
        ],
      })
      await container.get(Service)
      await container.get(PRODUCT)
      await container.dispose()
      expect(log).toEqual(['released'])
    })

    it('is not brought back by an onInvalidate listener that resolves again', async () => {
      let built = 0
      let destroyed = 0

      @Injectable()
      class Service implements OnServiceDestroy {
        constructor() {
          built++
        }

        onServiceDestroy() {
          destroyed++
        }
      }

      const container = new Container()
      await container.get(Service)
      let again: Promise<unknown> | null = null
      container.onInvalidate(Service, undefined, () => {
        again = outcome(container.get(Service))
      })
      // Listeners that do not care, as in the documentation.
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      container.onInvalidate(Service, undefined, async () => {
        await container.get(Service)
      })
      container.onInvalidate(Service, undefined, () => {
        void container.get(Service)
      })
      container.onInvalidate(Service, undefined, () => {
        container.getSync(Service)
      })
      await container.dispose()
      await tick()
      process.off('unhandledRejection', unhandled)
      expect(unhandled).not.toHaveBeenCalled()

      expect(await again).toBe(DIErrorCode.ContainerDisposed)
      expect({ built, destroyed }).toEqual({ built: 1, destroyed: 1 })
    })
  })

  describe('resolving from a destroy hook', () => {
    it('gets a dependency that is still whole, with container.get()', async () => {
      const log: string[] = []

      @Injectable()
      class Logger implements OnServiceDestroy {
        info(message: string) {
          log.push(message)
        }

        onServiceDestroy() {
          log.push('logger destroyed')
        }
      }

      @Injectable()
      class Service implements OnServiceDestroy {
        private readonly logger = inject(Logger)
        private readonly container = inject(Container)

        async onServiceDestroy() {
          await tick()
          ;(await this.container.get(Logger)).info('closing')
        }
      }

      const container = new Container()
      await container.get(Service)
      expect(await outcome(container.dispose())).toBe('resolved')
      expect(log).toEqual(['closing', 'logger destroyed'])
    })

    it('gets a dependency that is still whole, with ctx.inject()', async () => {
      const log: string[] = []

      @Injectable()
      class Logger {
        info(message: string) {
          log.push(message)
        }
      }

      const POOL = InjectionToken.create<object>('pool')
      const pool = provide(POOL, {
        factory: async (ctx) => {
          await ctx.inject(Logger)
          ctx.addDestroyListener(async () => {
            ;(await ctx.inject(Logger)).info('closing')
          })
          return {}
        },
      })

      const disposed = new Container({ providers: [pool] })
      await disposed.get(POOL)
      expect(await outcome(disposed.dispose())).toBe('resolved')
      expect(log).toEqual(['closing'])

      const invalidated = new Container({ providers: [pool] })
      await invalidated.get(POOL)
      const logger = await invalidated.get(Logger)
      expect(await outcome(invalidated.invalidate(logger))).toBe('resolved')
      expect(log).toEqual(['closing', 'closing'])
      await invalidated.dispose()
    })

    it('builds nothing on a dependency that is being invalidated', async () => {
      const built: unknown[] = []

      @Injectable()
      class Config {}

      @Injectable()
      class Report {
        readonly config = inject(Config)
      }

      @Injectable()
      class Service implements OnServiceDestroy {
        readonly config = inject(Config)
        private readonly container = inject(Container)

        onServiceDestroy() {
          built.push(this.container.get(Report))
        }
      }

      const container = new Container()
      const { config } = await container.get(Service)
      await container.invalidate(config)
      const report = (await built[0]) as Report
      expect(report.config).not.toBe(config)
      expect(report.config).toBe(await container.get(Config))
      await container.dispose()
    })

    it('builds nothing on it with ctx.inject() either', async () => {
      const built: Promise<{ config: Config }>[] = []

      @Injectable()
      class Config {}

      const REPORT = InjectionToken.create<{ config: Config }>('report')

      @Injectable()
      class Service implements OnServiceDestroy {
        readonly config = inject(Config)
        private readonly container = inject(Container)

        onServiceDestroy() {
          built.push(this.container.get(REPORT))
        }
      }

      const container = new Container({
        providers: [
          provide(REPORT, { factory: async (ctx) => ({ config: await ctx.inject(Config) }) }),
        ],
      })
      const { config } = await container.get(Service)
      await container.invalidate(config)
      const report = await built[0]
      expect(report.config).not.toBe(config)
      expect(report.config).toBe(await container.get(Config))
      await container.dispose()
    })

    it('is refused when it would wait for its own destruction', async () => {
      const errors: Error[] = []
      const TOKEN = InjectionToken.create<object>('token')
      const container = new Container({
        providers: [
          provide(TOKEN, {
            factory: (ctx) => {
              ctx.addDestroyListener(async () => {
                await ctx.inject(TOKEN).catch((error) => errors.push(error))
              })
              return {}
            },
          }),
        ],
      })
      expect(await outcome(container.invalidate(await container.get(TOKEN)))).toBe('resolved')
      expect(errors[0].message).toContain('cannot wait for that')
      await container.dispose()
    })

    it('gets a dependency that is being invalidated, at the start of the hook', async () => {
      const seen: unknown[] = []

      @Injectable()
      class Logger {}

      @Injectable()
      class Service implements OnServiceDestroy {
        readonly logger = inject(Logger)
        private readonly container = inject(Container)

        async onServiceDestroy() {
          seen.push(await this.container.get(Logger))
        }
      }

      const container = new Container()
      const { logger } = await container.get(Service)
      expect(await outcome(container.invalidate(logger))).toBe('resolved')
      expect(seen).toEqual([logger])
      await container.dispose()
    })

    it.each(['the first time', 'again'])(
      'is refused when it would wait for itself through what it builds %s',
      async (time) => {
        const codes: unknown[] = []
        const X = InjectionToken.create<object>('X')

        @Injectable()
        class Y {
          readonly x = inject(X)
        }

        @Injectable()
        class Z {
          readonly y = inject(Y)
        }

        const container = new Container({
          providers: [
            provide(X, {
              factory: (ctx) => {
                ctx.addDestroyListener(async () => {
                  codes.push(await outcome(ctx.inject(Z)))
                })
                return {}
              },
            }),
          ],
        })
        if (time === 'again') {
          await container.get(Z)
        }
        const x = await container.get(X)
        expect(await outcome(container.invalidate(x))).toBe('resolved')
        expect(codes).toEqual([DIErrorCode.CircularDependency])
        expect((await container.get(Z)).y.x).not.toBe(x)
        await container.dispose()
      },
    )

    it('is refused when it would have to wait or to build', async () => {
      const codes: unknown[] = []

      @Injectable()
      class NeverBuilt {}

      @Injectable()
      class Service implements OnServiceDestroy {
        private readonly container = inject(Container)

        async onServiceDestroy() {
          await tick()
          codes.push(await outcome(this.container.get(Service)))
          codes.push(await outcome(this.container.get(NeverBuilt)))
        }
      }

      const container = new Container()
      await container.get(Service)
      expect(await outcome(container.dispose())).toBe('resolved')
      expect(codes).toEqual([DIErrorCode.ContainerDisposed, DIErrorCode.ContainerDisposed])
    })

    it('reaches a singleton from the cleanup of a request-scoped factory', async () => {
      const log: string[] = []

      @Injectable()
      class Logger {
        info(message: string) {
          log.push(message)
        }
      }

      const POOL = InjectionToken.create<object>('pool')
      const container = new Container({
        providers: [
          provide(POOL, {
            scope: InjectableScope.Request,
            factory: (ctx) => {
              ctx.addDestroyListener(async () => {
                ;(await ctx.inject(Logger)).info('closing')
              })
              return {}
            },
          }),
        ],
      })
      const scope = container.createScope()
      await scope.get(POOL)
      await scope.dispose()
      expect(log).toEqual(['closing'])
      await container.dispose()
    })
  })

  describe('dispose() from a hook of the same container', () => {
    it.each(['onServiceInit', 'onServiceDestroy'])(
      'in %s does not wait for that hook',
      async (hook) => {
        const errors: unknown[] = []

        class Service {
          private readonly container = inject(Container)

          async [hook]() {
            await this.container.dispose()
          }
        }
        const TOKEN = InjectionToken.create<Service>('service')
        const container = new Container({
          logger: { error: (_: string, error: any) => errors.push(error.message) } as any,
          providers: [provide(TOKEN, Service)],
        })

        const resolved = await outcome(container.get(TOKEN).then(() => 'resolved'))
        expect(resolved).toBe(hook === 'onServiceInit' ? DIErrorCode.ContainerDisposed : 'resolved')
        expect(await outcome(container.dispose())).toBe('resolved')
        expect(errors).toEqual([])
      },
    )

    it('in a scope does not wait for that hook either', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Service implements OnServiceDestroy {
        private readonly scope = inject(ScopedContainer)

        async onServiceDestroy() {
          await this.scope.dispose()
        }
      }

      const container = new Container()
      const scope = container.createScope()
      await scope.get(Service)
      expect(await outcome(scope.dispose())).toBe('resolved')
      await container.dispose()
    })
  })

  describe('a scope', () => {
    it('destroys transients before the request services they use', async () => {
      const log: string[] = []

      @Injectable({ scope: InjectableScope.Request })
      class Transaction implements OnServiceDestroy {
        open = true

        onServiceDestroy() {
          this.open = false
          log.push('closed')
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class UnitOfWork implements OnServiceDestroy {
        private readonly transaction = inject(Transaction)

        onServiceDestroy() {
          log.push(`flush, open: ${this.transaction.open}`)
        }
      }

      const container = new Container()
      const scope = container.createScope()
      await scope.get(UnitOfWork)
      await scope.dispose()
      expect(log).toEqual(['flush, open: true', 'closed'])
      await container.dispose()
    })

    it('destroys a transient a request service injected with asyncInject after that service', async () => {
      const log: string[] = []
      const { asyncInject } = await import('../index.mjs')

      @Injectable({ scope: InjectableScope.Transient })
      class Helper implements OnServiceDestroy {
        onServiceDestroy() {
          log.push('helper')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Service implements OnServiceInit, OnServiceDestroy {
        private readonly helper = asyncInject(Helper)

        async onServiceInit() {
          await this.helper
        }

        onServiceDestroy() {
          log.push('service')
        }
      }

      const container = new Container()
      const scope = container.createScope()
      await scope.get(Service)
      await scope.dispose()
      expect(log).toEqual(['service', 'helper'])
      await container.dispose()
    })

    it('returns the disposal in flight from a second dispose()', async () => {
      let done = false

      @Injectable({ scope: InjectableScope.Request })
      class Service implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick(5)
          done = true
        }
      }

      const container = new Container()
      const scope = container.createScope()
      await scope.get(Service)
      void scope.dispose()
      await scope.dispose()
      expect(done).toBe(true)
      await container.dispose()
    })

    it('waits for a transient in flight and destroys it', async () => {
      const log: string[] = []

      @Injectable({ scope: InjectableScope.Transient })
      class Slow implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick(5)
          log.push('init')
        }

        async onServiceDestroy() {
          await tick(5)
          log.push('destroy')
        }
      }

      const container = new Container()
      const scope = container.createScope()
      const pending = outcome(scope.get(Slow))
      await scope.dispose()
      log.push('disposed')

      expect(log).toEqual(['init', 'destroy', 'disposed'])
      expect(await pending).toBe(DIErrorCode.ContainerDisposed)
      await container.dispose()
    })

    it('waits for the transients of a build that failed', async () => {
      const log: string[] = []

      @Injectable({ scope: InjectableScope.Transient })
      class Helper implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick(5)
          log.push('helper')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Failing {
        readonly helper = inject(Helper)

        constructor() {
          throw new Error('failed')
        }
      }

      const container = new Container()
      const scope = container.createScope()
      await expect(scope.get(Failing)).rejects.toThrow('failed')
      await scope.dispose()
      expect(log).toEqual(['helper'])
      await container.dispose()
    })
  })

  describe('something that is never ready', () => {
    const never = () => new Promise<never>(() => {})

    @Injectable({ scope: InjectableScope.Transient })
    class Never implements OnServiceInit {
      onServiceInit() {
        return never()
      }
    }

    it('does not keep a disposal waiting for long, if it is not stored', async () => {
      const ids = z.object({ id: z.number() })
      const KEYED = InjectionToken.create<object, typeof ids>('keyed', ids)
      const COMPUTED = InjectionToken.factory(KEYED, never)

      @Injectable({ scope: InjectableScope.Request })
      class Failing {
        readonly never = inject(Never)
        readonly bad = inject(Bad)
      }

      @Injectable({ scope: InjectableScope.Request })
      class Bad implements OnServiceInit {
        async onServiceInit() {
          throw new Error('bad')
        }
      }

      const container = new Container()
      const scope = container.createScope()
      void outcome(container.get(Never))
      void outcome(container.get(COMPUTED))
      void outcome(scope.get(Never))

      const failed = container.createScope()
      await expect(failed.get(Failing)).rejects.toThrow('bad')

      const test = new TestContainer()
      void outcome(test.get(Never))

      vi.useFakeTimers()
      const disposals = [scope, failed, container, test].map((one) => one.dispose())
      vi.useRealTimers()
      const all = Promise.all(disposals).then(() => 'disposed')
      expect(await outcome(all, 2000)).toBe('disposed')
    })

    it('is destroyed should it be ready after all', async () => {
      const log: string[] = []
      let open = () => {}
      const opened = new Promise<void>((resolve) => {
        open = resolve
      })

      @Injectable({ scope: InjectableScope.Transient })
      class Late implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await opened
        }

        onServiceDestroy() {
          log.push('destroyed')
        }
      }

      const ids = z.object({ id: z.number() })
      const KEYED = InjectionToken.create<object, typeof ids>('keyed', ids)
      const COMPUTED = InjectionToken.factory(KEYED, async (ctx) => {
        ctx.addDestroyListener(() => void log.push('released'))
        await opened
        return { id: 1 }
      })

      const container = new Container()
      const scope = container.createScope()
      const pending = [scope.get(Late), container.get(Late), container.get(COMPUTED)].map((p) =>
        outcome(p, 2000),
      )
      await Promise.all([scope.dispose(), container.dispose()])
      expect(log).toEqual([])
      open()
      expect(await Promise.all(pending)).toEqual([
        DIErrorCode.ContainerDisposed,
        DIErrorCode.ContainerDisposed,
        DIErrorCode.ContainerDisposed,
      ])
      expect(log.sort()).toEqual(['destroyed', 'destroyed', 'released'])
    })
  })

  describe('destroy listeners', () => {
    it('run, newest first, when the factory that registered them fails', async () => {
      const log: string[] = []
      const TOKEN = InjectionToken.create<object>('connection')
      const container = new Container({
        providers: [
          provide(TOKEN, {
            factory: async (ctx) => {
              ctx.addDestroyListener(() => void log.push('socket closed'))
              ctx.addDestroyListener(() => void log.push('session closed'))
              await tick()
              throw new Error('migration failed')
            },
          }),
        ],
      })

      await expect(container.get(TOKEN)).rejects.toThrow('migration failed')
      expect(log).toEqual(['session closed', 'socket closed'])
      await container.dispose()
      expect(log).toHaveLength(2)
    })

    it('run for an initialised instance whose decorator throws', async () => {
      const log: string[] = []

      @Injectable()
      class Service implements OnServiceInit, OnServiceDestroy {
        onServiceInit() {
          log.push('init')
        }

        onServiceDestroy() {
          log.push('destroy')
        }
      }

      const container = new Container()
      container.decorate(Service, () => {
        throw new Error('decorator')
      })
      await expect(container.get(Service)).rejects.toThrow('decorator')
      expect(log).toEqual(['init', 'destroy'])
      await container.dispose()
    })

    it('run at once when they are added after the instance was destroyed', async () => {
      const log: string[] = []
      const TOKEN = InjectionToken.create<{ late: () => void }>('late')
      const container = new Container({
        providers: [
          provide(TOKEN, {
            factory: (ctx) => ({ late: () => ctx.addDestroyListener(() => void log.push('late')) }),
          }),
        ],
      })
      const product = await container.get(TOKEN)
      await container.invalidate(product)
      product.late()
      expect(log).toEqual(['late'])
      await container.dispose()
    })

    it('of a factory token run when the container is disposed', async () => {
      const log: string[] = []
      const schema = z.object({ id: z.number() })
      const TOKEN = InjectionToken.create<object, typeof schema>('token', schema)
      const FACTORY = InjectionToken.factory(TOKEN, (ctx) => {
        ctx.addDestroyListener(() => void log.push('closed'))
        return { id: 1 }
      })
      const container = new Container({ providers: [provide(TOKEN, { factory: () => ({}) })] })
      await container.get(FACTORY)
      expect(log).toEqual([])
      await container.dispose()
      expect(log).toEqual(['closed'])
    })
  })

  describe('errors of destroy hooks', () => {
    @Injectable()
    class Root implements OnServiceDestroy {
      onServiceDestroy() {
        throw new Error('root hook')
      }
    }

    @Injectable({ scope: InjectableScope.Request })
    class Scoped implements OnServiceDestroy {
      onServiceDestroy() {
        throw new Error('scope hook')
      }
    }

    @Injectable({ scope: InjectableScope.Transient })
    class Helper implements OnServiceDestroy {
      onServiceDestroy() {
        throw new Error('helper hook')
      }
    }

    @Injectable()
    class Failing {
      readonly helper = inject(Helper)

      constructor() {
        throw new Error('failed')
      }
    }

    const run = async (container: Container) => {
      const scope = container.createScope()
      await scope.get(Scoped)
      await container.get(Root)
      await container.get(Failing).catch(() => {})
      await scope.dispose()
      await container.dispose()
    }
    const messages = (mock: { mock: { calls: any[][] } }) =>
      mock.mock.calls.map((call) => call[call.length - 1].message).sort()

    it('go to the logger', async () => {
      const logger = { error: vi.fn(), warn: vi.fn() }
      await run(new Container({ logger: logger as unknown as Console }))
      expect(messages(logger.error)).toEqual(['helper hook', 'root hook', 'scope hook'])
    })

    it('go to console.error without a logger', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await run(new Container())
      expect(messages(error)).toEqual(['helper hook', 'root hook', 'scope hook'])
    })

    it('are dropped with logger: null', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await run(new Container({ logger: null }))
      expect(error).not.toHaveBeenCalled()
    })
  })

  describe('invalidate()', () => {
    it('refuses the container itself', async () => {
      @Injectable()
      class Service {
        readonly container = inject(Container)
      }

      const container = new Container()
      await expect(container.invalidate(container)).rejects.toThrow('dispose()')
      expect((await container.get(Service)).container).toBe(container)
      await container.dispose()
    })
  })

  describe('clear() of the testing containers', () => {
    it('leaves them usable', async () => {
      @Injectable()
      class Service {}

      const test = new TestContainer()
      const first = await test.get(Service)
      await test.clear()
      expect(await test.get(Service)).not.toBe(first)
      expect(await test.get(Container)).toBe(test)
      await test.dispose()
      await expect(test.get(Service)).rejects.toMatchObject({
        code: DIErrorCode.ContainerDisposed,
      })

      const unit = new UnitTestContainer({ providers: [{ token: Service }] })
      await unit.get(Service)
      await unit.clear()
      expect(await unit.get(Service)).toBeInstanceOf(Service)
      await unit.dispose()
    })
  })
})
