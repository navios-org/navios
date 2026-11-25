import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  Container,
  DIError,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  provide,
} from '../index.mjs'
import { TestContainer, UnitTestContainer } from '../testing/index.mjs'

import type { OnServiceDestroy, OnServiceInit } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('alpha readiness regressions', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('construction plan', () => {
    it('never builds a dependency with the args of an earlier build', async () => {
      const schema = z.object({ id: z.string() })
      const built: string[] = []

      @Injectable({ scope: InjectableScope.Request, schema })
      class Tenant implements OnServiceInit {
        constructor(public readonly args: z.output<typeof schema>) {
          built.push(args.id)
        }

        async onServiceInit() {
          await tick()
        }
      }

      @Injectable({ scope: InjectableScope.Request, schema })
      class Handler {
        readonly tenant: Tenant

        constructor(args: z.output<typeof schema>) {
          this.tenant = inject(Tenant, { id: args.id })
        }
      }

      for (const id of ['tenant-1', 'tenant-2', 'tenant-3']) {
        const scope = container.createScope()
        built.length = 0
        const handler = await scope.get(Handler, { id })
        expect(handler.tenant.args.id).toBe(id)
        expect(new Set(built)).toEqual(new Set([id]))
        await scope.dispose()
      }

      // The default provider, and with it the plan, is shared by containers.
      const other = new Container()
      const scope = other.createScope()
      built.length = 0
      await scope.get(Handler, { id: 'other-container' })
      expect(new Set(built)).toEqual(new Set(['other-container']))
      await scope.dispose()
      await other.dispose()
    })
  })

  describe('constructor that uses a dependency with an async initialiser', () => {
    it('is replayed once the dependency is ready', async () => {
      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }

        table() {
          return 'users'
        }
      }

      @Injectable()
      class Repo {
        private readonly db = inject(Db)
        readonly table = this.db.table()
      }

      const repo = await container.get(Repo)
      expect(repo.table).toBe('users')
    })

    it('still fails when the constructor throws with nothing pending', async () => {
      let runs = 0

      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }
      }

      @Injectable()
      class Broken {
        private readonly db = inject(Db)

        constructor() {
          runs++
          throw new Error('boom')
        }
      }

      await expect(container.get(Broken)).rejects.toMatchObject({
        code: DIErrorCode.InitializationError,
        message: expect.stringContaining('boom'),
      })
      expect(runs).toBe(2)
    })
  })

  describe('transient cycles', () => {
    it('reports a cycle made only of transients', async () => {
      @Injectable({ scope: InjectableScope.Transient })
      class A {
        readonly b: unknown = inject(B)
      }

      @Injectable({ scope: InjectableScope.Transient })
      class B {
        readonly a: unknown = inject(A)
      }

      const error = await container.get(A).catch((e) => e)
      expect(error).toBeInstanceOf(DIError)
      expect(error.code).toBe(DIErrorCode.CircularDependency)
      expect(error.context.cycle).toEqual(['A', 'B', 'A'])
    })

    it('allows a transient to inject itself with other args', async () => {
      const schema = z.object({ depth: z.number() })

      @Injectable({ scope: InjectableScope.Transient, schema })
      class Node {
        readonly child: Node | null

        constructor(args: z.output<typeof schema>) {
          this.child = args.depth > 0 ? inject(Node, { depth: args.depth - 1 }) : null
        }
      }

      const node = await container.get(Node, { depth: 2 })
      expect(node.child?.child?.child).toBeNull()
    })
  })

  describe('provide() scope', () => {
    it('keeps the scope of a request-scoped token', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Real {}

      @Injectable()
      class Mock {}

      @Injectable()
      class Single {
        readonly real = inject(Real)
      }

      const own = new Container({ providers: [provide(Real, Mock)] })
      expect(own.getProvider(Real)?.scope).toBe(InjectableScope.Request)
      await expect(own.get(Single)).rejects.toMatchObject({
        code: DIErrorCode.ScopeMismatchError,
      })
      expect(provide(Real, { factory: () => new Real() }).record.scope).toBe(
        InjectableScope.Request,
      )
      expect(provide(Real, { class: Mock }).record.scope).toBe(InjectableScope.Request)
      expect(provide(Real, { class: Mock, scope: InjectableScope.Transient }).record.scope).toBe(
        InjectableScope.Transient,
      )
      await own.dispose()
    })
  })

  describe('transients of a failed construction', () => {
    it('are destroyed', async () => {
      const destroyed = vi.fn()

      @Injectable({ scope: InjectableScope.Transient })
      class Helper implements OnServiceDestroy {
        onServiceDestroy() {
          destroyed()
        }
      }

      @Injectable()
      class Bad {
        readonly helper = inject(Helper)

        constructor() {
          throw new Error('boom')
        }
      }

      await expect(container.get(Bad)).rejects.toThrow('boom')
      await tick()
      expect(destroyed).toHaveBeenCalledTimes(1)
    })
  })

  describe('ctx.inject()', () => {
    it('does not keep the transients it hands out after construction', async () => {
      const destroyed = vi.fn()

      @Injectable({ scope: InjectableScope.Transient })
      class Hooked implements OnServiceDestroy {
        onServiceDestroy() {
          destroyed()
        }
      }

      const TOKEN = InjectionToken.create<{ first: Hooked; next: () => Promise<Hooked> }>('lazy')
      container.provide(TOKEN, {
        factory: async (ctx) => ({
          first: await ctx.inject(Hooked),
          next: () => ctx.inject(Hooked),
        }),
      })

      const lazy = await container.get(TOKEN)
      for (let i = 0; i < 50; i++) {
        await lazy.next()
      }
      const entry = (container as any).store.get(TOKEN, null)
      expect(entry.transients).toHaveLength(1)

      // The one injected during construction is destroyed with its owner.
      await container.invalidate(lazy)
      expect(destroyed).toHaveBeenCalledTimes(1)
    })

    it('destroys with the scope what a request-scoped product injects later', async () => {
      const destroyed = vi.fn()

      @Injectable({ scope: InjectableScope.Transient })
      class Hooked implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick()
        }

        onServiceDestroy() {
          destroyed()
        }
      }

      const TOKEN = InjectionToken.create<() => Promise<Hooked>>('lazy-scoped')
      container.provide(TOKEN, {
        factory: (ctx) => () => ctx.inject(Hooked),
        scope: InjectableScope.Request,
      })

      const scope = container.createScope()
      const next = await scope.get(TOKEN)
      await next()
      await scope.dispose()
      expect(destroyed).toHaveBeenCalledTimes(1)
    })

    it('resolves a transient with an asynchronous initialiser', async () => {
      let constructed = 0

      @Injectable({ scope: InjectableScope.Transient })
      class Slow implements OnServiceInit {
        ready = false

        constructor() {
          constructed++
        }

        async onServiceInit() {
          await tick()
          this.ready = true
        }
      }

      const TOKEN = InjectionToken.create<{ slow: Slow }>('with-slow')
      container.provide(TOKEN, {
        factory: async (ctx) => ({ slow: await ctx.inject(Slow) }),
      })

      const result = await Promise.race([container.get(TOKEN), tick(100).then(() => null)])
      expect(result?.slow.ready).toBe(true)
      expect(constructed).toBe(1)
    })
  })

  describe('onInvalidate', () => {
    it('leaves nothing behind after the last listener is removed', () => {
      const schema = z.object({ i: z.number() })

      @Injectable({ schema })
      class Keyed {
        constructor(public readonly args: z.output<typeof schema>) {}
      }

      const store = (container as any).store
      for (let i = 0; i < 100; i++) {
        container.onInvalidate(Keyed, { i }, () => {})()
      }
      expect(store.listeners?.size ?? 0).toBe(0)

      const keep = container.onInvalidate(Keyed, { i: 1 }, () => {})
      container.onInvalidate(Keyed, { i: 1 }, () => {})()
      expect(store.listeners.size).toBe(1)
      keep()
      expect(store.listeners.size).toBe(0)
    })
  })

  describe('scope disposed while a resolution is in flight', () => {
    it('destroys what was built late and rejects the caller', async () => {
      const destroyed: string[] = []

      @Injectable({ scope: InjectableScope.Transient })
      class SlowTransient implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick(20)
        }

        onServiceDestroy() {
          destroyed.push('transient')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class SlowRequest implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick(5)
        }

        onServiceDestroy() {
          destroyed.push('request')
        }
      }

      const scope = container.createScope()
      const transient = scope.get(SlowTransient)
      const request = scope.get(SlowRequest)
      const disposal = scope.dispose()

      const results = await Promise.allSettled([transient, request])
      await disposal
      await tick()

      for (const result of results) {
        expect(result.status).toBe('rejected')
        expect((result as PromiseRejectedResult).reason.code).toBe(DIErrorCode.ContainerDisposed)
      }
      expect(destroyed.sort()).toEqual(['request', 'transient'])
    })

    it('builds nothing into a disposed scope', async () => {
      const built = vi.fn()

      @Injectable({ scope: InjectableScope.Request })
      class Late {
        constructor() {
          built()
        }
      }

      const TOKEN = InjectionToken.create<{ late: () => Promise<Late> }>('lazy-request')
      const own = new Container({
        providers: [
          provide(TOKEN, {
            factory: (ctx) => ({ late: () => ctx.inject(Late) }),
            scope: InjectableScope.Request,
          }),
        ],
      })
      const scope = own.createScope()
      const lazy = await scope.get(TOKEN)
      await scope.dispose()

      await expect(lazy.late()).rejects.toMatchObject({ code: DIErrorCode.ContainerDisposed })
      expect(built).not.toHaveBeenCalled()
      expect((scope as any).store.size).toBe(0)
      await own.dispose()
    })
  })

  describe('errors thrown while destroying', () => {
    it('are reported to the logger', async () => {
      const logger = { error: vi.fn(), warn: vi.fn() }
      const own = new Container({ logger: logger as unknown as Console })
      const syncError = new Error('sync destroy failed')
      const asyncError = new Error('async destroy failed')

      @Injectable()
      class Sync implements OnServiceDestroy {
        onServiceDestroy() {
          throw syncError
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Async implements OnServiceDestroy {
        async onServiceDestroy() {
          throw asyncError
        }
      }

      const scope = own.createScope()
      await scope.get(Async)
      await own.get(Sync)
      await scope.dispose()
      await own.dispose()

      const reported = logger.error.mock.calls.map((call) => call[call.length - 1])
      expect(reported).toEqual([asyncError, syncError])
      expect(String(logger.error.mock.calls[1][0])).toContain('Sync')
    })
  })

  describe('injection outside a construction', () => {
    it('throws a DIError', () => {
      @Injectable()
      class Service {}

      let error: unknown
      try {
        inject(Service)
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(DIError)
      expect((error as DIError).code).toBe(DIErrorCode.OutsideInjectionContext)
      expect((error as DIError).message).toBe(
        '[Injector] Trying to access inject outside of a injectable context',
      )
    })
  })

  describe('UnitTestContainer', () => {
    it('returns one proxy per instance and keeps private members working', async () => {
      @Injectable()
      class Counter {
        #count = 1

        increment() {
          return ++this.#count
        }
      }

      const unit = new UnitTestContainer({ providers: [{ token: Counter }] })
      const first = await unit.get(Counter)
      const second = await unit.get(Counter)

      expect(first).toBe(second)
      expect(unit.getSync(Counter)).toBe(first)
      expect(first.increment()).toBe(2)
      unit.expectCalled(Counter, 'increment')
      await unit.dispose()
    })
  })

  describe('TestContainer', () => {
    it('does not leave an unhandled rejection when a rebind destroys asynchronously', async () => {
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown) => unhandled.push(reason)
      process.on('unhandledRejection', onUnhandled)

      @Injectable()
      class Service implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
        }
      }

      @Injectable()
      class Replacement implements OnServiceDestroy {
        async onServiceDestroy() {}
      }

      const test = new TestContainer()
      try {
        await test.get(Service)
        test.onInvalidate(Service, undefined, () => {
          throw new Error('listener failed')
        })
        test.bind(Service).toClass(Replacement)
        await tick(10)
        expect(unhandled).toEqual([])
      } finally {
        process.off('unhandledRejection', onUnhandled)
        await test.dispose()
      }
    })
  })
})
