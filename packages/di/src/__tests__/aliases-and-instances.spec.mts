import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  Container,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  optional,
  provide,
  registerProvider,
  ScopedContainer,
} from '../index.mjs'
import {
  constructedInstances,
  hasOwnProvider,
  setErrorReporter,
  setProvider,
} from '../internal/index.mjs'
import { UnitTestContainer } from '../testing/index.mjs'

import type { OnServiceDestroy, OnServiceInit, ProviderInput, StandardSchemaV1 } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const caught = (run: () => unknown): any => {
  try {
    run()
  } catch (error) {
    return error
  }
  return 'nothing thrown'
}

describe('aliases and instances', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('provide(token, { existing })', () => {
    const PORT = InjectionToken.create<{ id: number }>('Port')

    it('is another name for the same instance', async () => {
      const destroyed = vi.fn()

      @Injectable()
      class Adapter implements OnServiceDestroy {
        id = 1

        onServiceDestroy() {
          destroyed()
        }
      }

      @Injectable()
      class Consumer {
        readonly port = inject(PORT)
        readonly adapter = inject(Adapter)
        readonly maybe = optional(PORT)
      }

      container.provide(PORT, { existing: Adapter })
      expect(container.peek(PORT)).toBeNull()
      const consumer = await container.get(Consumer)
      expect(consumer.port).toBe(consumer.adapter)
      expect(consumer.maybe).toBe(consumer.adapter)
      expect(container.getSync(PORT)).toBe(consumer.adapter)
      expect(container.peek(PORT)).toBe(consumer.adapter)
      expect(container.isRegistered(PORT)).toBe(true)
      expect(container.getProvider(PORT)).toEqual({
        kind: 'existing',
        scope: InjectableScope.Singleton,
        target: undefined,
      })
      expect(container.instances()).toEqual([consumer.adapter, consumer])

      const listener = vi.fn()
      container.onInvalidate(PORT, undefined, listener)
      await container.invalidate(consumer.port)
      expect(destroyed).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(await container.get(Consumer)).not.toBe(consumer)
    })

    it('follows the lifecycle of what it points to', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Adapter {
        id = 2
      }

      @Injectable()
      class Single {
        readonly port = inject(PORT)
      }

      container.provide(PORT, { existing: Adapter })
      const scope = container.createScope()
      expect(await scope.get(PORT)).toBe(await scope.get(Adapter))
      expect(container.getProvider(PORT)?.scope).toBe(InjectableScope.Request)
      await expect(container.get(Single)).rejects.toMatchObject({
        code: DIErrorCode.ScopeMismatchError,
      })
      const listener = vi.fn()
      scope.onInvalidate(PORT, undefined, listener)
      await scope.dispose()
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('passes on args, and can point to a token with its own', async () => {
      const schema = z.object({ id: z.number() })
      const TARGET = InjectionToken.create<{ id: number }, typeof schema>('Target', schema)
      const ALIAS = InjectionToken.create<{ id: number }, typeof schema>('Alias', schema)
      container.provide(TARGET, { factory: (_ctx, args) => ({ id: args.id }) })
      container.provide(ALIAS, { existing: TARGET })
      container.provide(PORT, { existing: InjectionToken.bound(TARGET, { id: 7 }) })

      expect(await container.get(ALIAS, { id: 5 })).toBe(await container.get(TARGET, { id: 5 }))
      expect(await container.get(PORT)).toBe(await container.get(TARGET, { id: 7 }))
    })

    it('is nothing when nothing provides what it points to', async () => {
      const MISSING = InjectionToken.create<{ id: number }>('Missing')

      @Injectable()
      class Consumer {
        readonly port = optional(PORT)
      }

      container.provide(PORT, { existing: MISSING })
      expect(container.isRegistered(PORT)).toBe(false)
      expect((await container.get(Consumer)).port).toBeNull()
      await expect(container.get(PORT)).rejects.toThrow('No provider for Missing')
    })

    it('cannot lead in a circle', async () => {
      const OTHER = InjectionToken.create<{ id: number }>('Other')
      container.provide(PORT, { existing: OTHER })
      container.provide(OTHER, { existing: PORT })
      const error = await container.get(PORT).catch((e) => e)
      expect(error.code).toBe(DIErrorCode.CircularDependency)
      expect(error.context.cycle).toEqual(['Port', 'Other', 'Port'])
    })

    it('cannot be decorated in place of what it points to', async () => {
      @Injectable()
      class Adapter {
        id = 1
      }

      container.provide(PORT, { existing: Adapter })
      container.decorate(PORT, (port) => port)
      await expect(container.get(PORT)).rejects.toThrow('decorate that instead')

      // Also in a pass that looks for what an earlier one built.
      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper {}
      const HELPER = InjectionToken.create<Helper>('Helper')
      container.provide(HELPER, { existing: Helper })
      let passes = 0

      @Injectable()
      class Service {
        readonly helper = inject(Helper)
        readonly slow = inject(Slow)
        readonly alias = passes++ > 0 ? inject(HELPER) : null
      }

      const pending = container.get(Service)
      container.decorate(HELPER, (helper) => helper)
      await expect(pending).rejects.toThrow('decorate that instead')
    })

    it('counts as resolved once it was asked for', async () => {
      @Injectable()
      class Adapter {
        id = 1
      }
      const OTHER = InjectionToken.create<{ id: number }>('Other')

      for (const asked of [PORT, OTHER]) {
        const own = new Container({
          providers: [provide(PORT, { existing: Adapter }), provide(OTHER, { existing: PORT })],
        })
        // What it points to is there, but nobody has come by the alias.
        await own.get(Adapter)
        own.provide(PORT, { existing: Adapter })
        await own.get(asked)
        for (const call of [
          () => own.provide(PORT, { value: { id: 2 } }),
          () => own.decorate(PORT, (port) => port),
        ]) {
          expect(caught(call).message).toContain('already resolved')
        }
        expect(setProvider(own, provide(PORT, { value: { id: 2 } }))).toBe(false)
        await own.invalidate(await own.get(Adapter))
        own.provide(PORT, { value: { id: 2 } })
        expect((await own.get(PORT)).id).toBe(2)
        await own.dispose()
      }
    })

    describe('of something with an asynchronous initialiser', () => {
      it('builds a transient once', async () => {
        const log: string[] = []

        @Injectable({ scope: InjectableScope.Transient })
        class Leaf implements OnServiceInit, OnServiceDestroy {
          async onServiceInit() {
            log.push('leaf')
          }

          onServiceDestroy() {
            log.push('leaf destroyed')
          }
        }
        const LEAF = InjectionToken.create<Leaf>('Leaf')
        registerProvider(LEAF, { existing: Leaf })

        @Injectable({ scope: InjectableScope.Transient })
        class Branch implements OnServiceInit {
          readonly leaf = inject(LEAF)

          async onServiceInit() {
            log.push('branch')
          }
        }
        const FIRST = InjectionToken.create<Branch>('First')
        const BRANCH = InjectionToken.create<Branch>('Branch')
        registerProvider(FIRST, { existing: Branch })
        registerProvider(BRANCH, { existing: FIRST })

        @Injectable()
        class Service {
          readonly branch = inject(BRANCH)
        }

        expect((await container.get(Service)).branch.leaf).toBeInstanceOf(Leaf)
        expect(log).toEqual(['leaf', 'branch'])
      })

      it('builds a transient of the same args once', async () => {
        const schema = z.object({ id: z.number() })
        let built = 0

        @Injectable({ scope: InjectableScope.Transient, schema })
        class Shard implements OnServiceInit {
          constructor(public readonly args: z.output<typeof schema>) {
            built++
          }

          async onServiceInit() {}
        }
        const FIRST = InjectionToken.create<Shard, typeof schema>('First', schema)
        const BOUND = InjectionToken.create<Shard>('Bound')
        const COMPUTED = InjectionToken.create<Shard>('Computed')
        registerProvider(FIRST, { existing: Shard })
        registerProvider(BOUND, { existing: InjectionToken.bound(FIRST, { id: 2 }) })
        registerProvider(COMPUTED, {
          existing: InjectionToken.factory(FIRST, async () => ({ id: 3 })),
        })

        @Injectable()
        class Service {
          readonly ids = [inject(FIRST, { id: 1 }), inject(BOUND), inject(COMPUTED)]
        }

        const { ids } = await container.get(Service)
        expect(ids.map((shard) => shard.args.id)).toEqual([1, 2, 3])
        expect(built).toBe(3)
      })

      it('fails once, with its own error', async () => {
        let attempts = 0

        @Injectable()
        class Database implements OnServiceInit {
          async onServiceInit() {
            attempts++
            await tick()
            throw new Error('connection refused')
          }
        }
        const DB = InjectionToken.create<Database>('Db')
        registerProvider(DB, { existing: Database })

        @Injectable()
        class Repository {
          readonly db = inject(DB)
        }

        await expect(container.get(Repository)).rejects.toThrow('connection refused')
        expect(attempts).toBe(1)

        @Injectable()
        class Fallback {
          readonly db = this.connect()

          private connect() {
            try {
              return inject(DB)
            } catch {
              return 'fallback'
            }
          }
        }

        expect((await container.get(Fallback)).db).toBe('fallback')
        expect(attempts).toBe(2)
      })

      it('computes the args of a factory token once, also when that fails', async () => {
        const args = z.object({ id: z.number() })
        const KEYED = InjectionToken.create<object, typeof args>('Keyed', args)
        registerProvider(KEYED, { factory: () => ({}) })
        let attempts = 0
        const ALIAS = InjectionToken.create<object>('Alias')
        registerProvider(ALIAS, {
          existing: InjectionToken.factory(KEYED, async () => {
            attempts++
            throw new Error('no args')
          }),
        })

        @Injectable()
        class Service {
          readonly keyed = inject(ALIAS)
        }

        await expect(container.get(Service)).rejects.toThrow('no args')
        expect(attempts).toBe(1)
      })

      it('reports a cycle through the args of a factory token', async () => {
        const args = z.object({ id: z.number() })
        const KEYED = InjectionToken.create<object, typeof args>('Keyed', args)
        registerProvider(KEYED, { factory: () => ({}) })
        const ALIAS = InjectionToken.create<object>('Alias')

        @Injectable()
        class Service {
          readonly keyed = inject(ALIAS)
        }
        registerProvider(ALIAS, {
          existing: InjectionToken.factory(KEYED, async (ctx) => {
            await ctx.inject(Service)
            return { id: 1 }
          }),
        })

        const error = await Promise.race([container.get(Service).catch((e) => e), tick(50)])
        expect(error.code).toBe(DIErrorCode.CircularDependency)
      })
    })

    it('gives way to an instance added for it in every pass', async () => {
      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Adapter {
        id = 1
      }
      container.provide(PORT, { existing: Adapter })

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly port = inject(PORT)
        readonly adapter = inject(Adapter)
        readonly slow = inject(Slow)
      }

      const scope = container.createScope()
      const added = { id: 2 }
      scope.addInstance(PORT, added)
      const handler = await scope.get(Handler)
      expect(handler.port).toBe(added)
      expect(handler.adapter).toBeInstanceOf(Adapter)
      await scope.dispose()
    })

    it('is told apart from an instance added for it', async () => {
      @Injectable()
      class Adapter {
        id = 1
      }
      container.provide(PORT, { existing: Adapter })
      const scope = container.createScope()
      const added = { id: 2 }
      scope.addInstance(PORT, added)
      const inScope = vi.fn()
      const inRoot = vi.fn()
      const off = scope.onInvalidate(PORT, undefined, inScope)
      container.onInvalidate(PORT, undefined, inRoot)

      await scope.invalidate(added)
      expect(inScope).toHaveBeenCalledTimes(1)
      expect(inRoot).not.toHaveBeenCalled()

      expect(await scope.get(PORT)).toBe(await container.get(Adapter))
      await scope.invalidate(await scope.get(PORT))
      expect(inScope).toHaveBeenCalledTimes(2)
      expect(inRoot).toHaveBeenCalledTimes(1)

      off()
      scope.addInstance(PORT, added)
      await scope.invalidate(added)
      await container.get(Adapter).then((adapter) => container.invalidate(adapter))
      expect(inScope).toHaveBeenCalledTimes(2)
      await scope.dispose()
    })
  })

  describe('registerProvider()', () => {
    it('gives a token a default provider', async () => {
      const VALUE = InjectionToken.create<number>('value')
      const PRODUCT = InjectionToken.create<{ value: number }>('product')
      const IMPL = InjectionToken.create<object>('impl')
      const ALIAS = InjectionToken.create<object>('alias')

      class Impl {}

      expect(registerProvider(VALUE, { value: 1 })).toBe(VALUE)
      registerProvider(PRODUCT, { factory: async (ctx) => ({ value: await ctx.inject(VALUE) }) })
      registerProvider(IMPL, Impl, { scope: InjectableScope.Transient })
      registerProvider(ALIAS, { existing: PRODUCT })

      expect(await container.get(PRODUCT)).toEqual({ value: 1 })
      expect(await container.get(IMPL)).toBeInstanceOf(Impl)
      expect(await container.get(IMPL)).not.toBe(await container.get(IMPL))
      expect(await container.get(ALIAS)).toBe(await container.get(PRODUCT))

      const own = new Container({ providers: [provide(VALUE, { value: 2 })] })
      expect(await own.get(PRODUCT)).toEqual({ value: 2 })
      await own.dispose()
    })

    it('refuses a second default', () => {
      const TOKEN = InjectionToken.create<object>('token')
      const factory = () => ({})
      registerProvider(TOKEN, { factory })
      registerProvider(TOKEN, { factory })
      for (const input of [{ value: {} }, class Impl {}, { existing: Container }]) {
        expect(caught(() => registerProvider(TOKEN, input)).code).toBe(DIErrorCode.ProviderConflict)
      }

      const CLASS = InjectionToken.create<object>('class')

      @Injectable({ token: CLASS })
      class Impl {}

      expect(caught(() => registerProvider(CLASS, { value: new Impl() })).code).toBe(
        DIErrorCode.ProviderConflict,
      )
      expect(caught(() => registerProvider(Impl, { value: new Impl() })).code).toBe(
        DIErrorCode.ProviderConflict,
      )
    })
  })

  describe('a module that registers a provider and is evaluated again', () => {
    class Impl {
      id = 1
    }

    const registrations: [string, (token: InjectionToken<any>, version: number) => void][] = [
      ['a factory', (token, id) => registerProvider(token, { factory: () => ({ id }) })],
      ['a value', (token, id) => registerProvider(token, { value: { id } })],
      [
        'an alias',
        (token, id) => {
          const target = InjectionToken.create<object>('target')
          registerProvider(target, { value: { id } })
          registerProvider(token, { existing: target })
        },
      ],
    ]

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    it.each(registrations)('replaces %s', async (_, register) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const TOKEN = InjectionToken.create<{ id: number }>('token')
      register(TOKEN, 1)
      register(TOKEN, 2)
      expect((await container.get(TOKEN)).id).toBe(2)
      expect(warn).not.toHaveBeenCalled()
    })

    it.each(registrations)('is refused in production with %s', (_, register) => {
      vi.stubEnv('NODE_ENV', 'production')
      const TOKEN = InjectionToken.create<{ id: number }>('token')
      register(TOKEN, 1)
      expect(caught(() => register(TOKEN, 2)).code).toBe(DIErrorCode.ProviderConflict)
    })

    it('is warned about when it may well be another module', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const other = InjectionToken.create<object>('other')
      const pairs: [ProviderInput<any>, ProviderInput<any>][] = [
        [{ factory: () => 1 }, { factory: () => 2 }],
        [{ value: 1 }, { value: 2 }],
        [{ value: new Map() }, { value: new Set() }],
        [{ existing: Impl }, { existing: other }],
      ]
      for (const [first, second] of pairs) {
        const TOKEN = InjectionToken.create<any>('SETTINGS')
        registerProvider(TOKEN, first)
        warn.mockClear()
        registerProvider(TOKEN, second)
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toContain('SETTINGS')
      }
    })
  })

  describe('instances()', () => {
    it('lists dependencies before their dependents, in the order they became ready', async () => {
      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(5)
        }
      }

      @Injectable()
      class Db {}

      @Injectable()
      class Repository {
        readonly slow = inject(Slow)
        readonly db = inject(Db)
      }

      const repository = await container.get(Repository)
      expect(container.instances()).toEqual([repository.db, repository.slow, repository])
    })

    it('lists an object that two tokens stand for once', async () => {
      const PORT = InjectionToken.create<object>('Port')

      @Injectable()
      class Impl {}

      container.provide(PORT, { factory: () => inject(Impl) })
      const impl = await container.get(PORT)
      expect(container.instances()).toEqual([impl])
    })
  })

  describe('an instance that many tokens hold', () => {
    const args = z.object({ id: z.number() })
    const KEYED = InjectionToken.create<object, typeof args>('Keyed', args)

    it('is found under all of them, in time that grows with their number', async () => {
      const shared = {}
      const own = new Container({ providers: [provide(KEYED, { factory: () => shared })] })
      const started = performance.now()
      for (let id = 0; id < 30_000; id++) {
        own.getSync(KEYED, { id })
      }
      expect(performance.now() - started).toBeLessThan(2000)
      expect(own.store.size).toBe(30_001)
      await own.invalidate(shared)
      expect(own.store.size).toBe(1)
      await own.dispose()
    })

    it('is not held on to by those that are gone', async () => {
      const shared = {}
      const own = new Container({ providers: [provide(KEYED, { factory: () => shared })] })
      for (let round = 0; round < 1000; round++) {
        own.getSync(KEYED, { id: round })
        own.getSync(KEYED, { id: -round - 1 })
        await own.invalidate(shared)
      }
      expect((own.store as any).byInstance.get(shared).entries.length).toBeLessThan(100)
      own.getSync(KEYED, { id: 1 })
      expect(own.store.findByInstance(shared)).toHaveLength(1)
      await own.dispose()
    })
  })

  describe('invalidate()', () => {
    it('destroys every token that holds the instance', async () => {
      const destroyed = vi.fn()
      const PORT = InjectionToken.create<object>('Port')

      @Injectable()
      class Impl implements OnServiceDestroy {
        onServiceDestroy() {
          destroyed()
        }
      }

      @Injectable()
      class Consumer {
        readonly impl = inject(Impl)
      }

      container.provide(PORT, { factory: () => inject(Impl) })
      const impl = await container.get(Impl)
      const consumer = await container.get(Consumer)
      await container.get(PORT)

      await container.invalidate(impl)
      expect(destroyed).toHaveBeenCalledTimes(1)
      expect(await container.get(Impl)).not.toBe(impl)
      expect(await container.get(PORT)).toBe(await container.get(Impl))
      expect(await container.get(Consumer)).not.toBe(consumer)
    })

    it('reaches the dependents of both values that share an object', async () => {
      const shared = {}
      const A = InjectionToken.create<object>('A')
      const B = InjectionToken.create<object>('B')
      container.provide(A, { value: shared })
      container.provide(B, { value: shared })

      @Injectable()
      class UsesA {
        readonly a = inject(A)
      }

      @Injectable()
      class UsesB {
        readonly b = inject(B)
      }

      const usesA = await container.get(UsesA)
      const usesB = await container.get(UsesB)
      await container.invalidate(shared)
      expect(await container.get(UsesA)).not.toBe(usesA)
      expect(await container.get(UsesB)).not.toBe(usesB)
    })
  })

  describe('inject(ScopedContainer)', () => {
    @Injectable({ scope: InjectableScope.Request })
    class Lazy {}

    @Injectable({ scope: InjectableScope.Request })
    class Handler {
      private readonly scope = inject(ScopedContainer)

      load() {
        return this.scope.get(Lazy)
      }
    }

    it('gives a request-scoped service its scope', async () => {
      const scope = container.createScope()
      const handler = await scope.get(Handler)
      expect(await handler.load()).toBe(await scope.get(Lazy))
      expect(await scope.get(ScopedContainer)).toBe(scope)
      expect(await container.createScope().get(ScopedContainer)).not.toBe(scope)
      await scope.dispose()
    })

    it('is a scope mismatch in the root and in a singleton', async () => {
      @Injectable()
      class Single {
        readonly scope = inject(ScopedContainer)
      }

      for (const token of [ScopedContainer, Single] as const) {
        await expect(container.get(token as any)).rejects.toMatchObject({
          code: DIErrorCode.ScopeMismatchError,
        })
      }
    })

    it('works in a strict container', async () => {
      const strict = new UnitTestContainer({ providers: [{ token: Handler }, { token: Lazy }] })
      const scope = strict.createScope()
      expect(await (await scope.get(Handler)).load()).toBeInstanceOf(Lazy)
      await strict.dispose()
    })
  })

  describe('addInstance()', () => {
    it('stores under the args that the schema makes of nothing', async () => {
      const schema = z.object({ size: z.number() }).default({ size: 1 })
      const TOKEN = InjectionToken.create<string, typeof schema>('token', schema)
      container.addInstance(TOKEN, 'value')
      expect(await container.get(TOKEN)).toBe('value')
      expect(await container.get(TOKEN, { size: 1 })).toBe('value')
    })
  })

  describe('@navios/di/internal', () => {
    @Injectable()
    class Built {}

    const FACTORY = InjectionToken.create<object>('factory')
    const VALUE = InjectionToken.create<object>('value')
    const ADDED = InjectionToken.create<object>('added')
    const REUSED = InjectionToken.create<object>('reused')

    it('constructedInstances() leaves out what the container was given', async () => {
      const value = { onApplicationShutdown() {} }
      const own = new Container({
        providers: [
          provide(FACTORY, { factory: () => ({ product: true }) }),
          provide(VALUE, { value }),
          provide(REUSED, { factory: () => inject(VALUE) }),
        ],
      })
      own.addInstance(ADDED, {})
      const built = await own.get(Built)
      const product = await own.get(FACTORY)
      await own.get(VALUE)
      await own.get(REUSED)

      expect(own.instances()).toHaveLength(4)
      expect(constructedInstances(own)).toEqual([built, product])
      await own.dispose()
    })

    it('constructedInstances() leaves out auto-mocks', async () => {
      @Injectable()
      class Service {
        readonly built = inject(Built)
      }

      const unit = new UnitTestContainer({
        providers: [{ token: Service }, { token: FACTORY, useFactory: () => ({}) }],
        allowUnregistered: true,
      })
      const product = await unit.get(FACTORY)
      await unit.get(Service)
      const constructed = constructedInstances(unit)
      expect(constructed).toHaveLength(2)
      expect(constructed[1]).toBeInstanceOf(Service)
      void product
      await unit.dispose()
    })

    it('setProvider() refuses a token that is already resolved', async () => {
      const first = {}
      expect(hasOwnProvider(container, VALUE)).toBe(false)
      expect(setProvider(container, provide(VALUE, { value: first }))).toBe(true)
      expect(hasOwnProvider(container, VALUE)).toBe(true)
      await container.get(VALUE)
      expect(setProvider(container, provide(VALUE, { value: {} }))).toBe(false)
      expect(await container.get(VALUE)).toBe(first)
    })

    it('setErrorReporter() receives the errors of destroy hooks, unless a logger was passed', async () => {
      @Injectable()
      class Root implements OnServiceDestroy {
        onServiceDestroy() {
          throw new Error('root hook')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Scoped implements OnServiceDestroy {
        async onServiceDestroy() {
          throw new Error('scope hook')
        }
      }

      const run = async (own: Container) => {
        const report = vi.fn()
        // Also a scope that exists already.
        const scope = own.createScope()
        setErrorReporter(own, report)
        await scope.get(Scoped)
        await own.get(Root)
        await scope.dispose()
        await own.dispose()
        return report.mock.calls.map(([error, description]) => [error.message, description])
      }

      expect(await run(new Container())).toEqual([
        ['scope hook', 'A destroy hook of Scoped failed'],
        ['root hook', 'A destroy hook of Root failed'],
      ])
      const logger = { error: vi.fn(), warn: vi.fn() } as unknown as Console
      expect(await run(new Container({ logger }))).toEqual([])
      expect(logger.error).toHaveBeenCalledTimes(2)
      expect(await run(new Container({ logger: null }))).toEqual([])
    })
  })

  describe('args', () => {
    const anything: StandardSchemaV1<any, any> = {
      '~standard': { version: 1, vendor: 'test', validate: (value: unknown) => ({ value }) as any },
    }
    const TOKEN = InjectionToken.create<object, StandardSchemaV1<any, any>>('token', anything)

    const same = async (left: unknown, right: unknown) => {
      const own = new Container({ providers: [provide(TOKEN, { factory: () => ({}) })] })
      const result = (await own.get(TOKEN, left)) === (await own.get(TOKEN, right))
      await own.dispose()
      return result
    }

    it('are compared by value for the types a schema produces anew', async () => {
      expect(await same({ d: new Date(0) }, { d: new Date(0) })).toBe(true)
      expect(await same({ d: new Date(0) }, { d: new Date(1) })).toBe(false)
      expect(await same(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
      expect(await same(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
      expect(await same(new Set([1, 2]), new Set([2, 1]))).toBe(true)
      expect(await same(new Set([1, 2]), new Set([1]))).toBe(false)
      expect(await same(new URL('http://x/'), new URL('http://x'))).toBe(true)
      expect(await same(new URL('http://x/'), new URL('http://y'))).toBe(false)
      expect(await same(/a/g, /a/g)).toBe(true)
      expect(await same(/a/g, /a/i)).toBe(false)
      expect(await same(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
      expect(await same(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
      expect(await same(new Uint8Array([1]), new Uint16Array([1]))).toBe(false)
      // By identity when they are large: their args are not read on each request.
      const [large, copy] = [new Uint8Array(2000), new Uint8Array(2000)]
      expect(await same(large, copy)).toBe(false)
      expect(await same({ large }, { large })).toBe(true)
      expect(await same(Buffer.alloc(1024), Buffer.alloc(1024))).toBe(true)
      expect(await same(new Float64Array(128), new Float64Array(128))).toBe(true)
      expect(await same(new Float64Array(129), new Float64Array(129))).toBe(false)
      // Not a boundary that could be read two ways.
      expect(await same([new Set([1]), 2], [new Set([1, 2])])).toBe(false)
    })

    it('are compared by identity for other objects', async () => {
      class Plain {}
      class Dates extends Date {}
      expect(await same(new Plain(), new Plain())).toBe(false)
      expect(await same(new Dates(0), new Dates(0))).toBe(false)
      const plain = new Plain()
      expect(await same(plain, plain)).toBe(true)
    })

    it('treat an undefined property as absent', async () => {
      expect(await same({ id: 1, opt: undefined }, { id: 1 })).toBe(true)
      expect(await same({ id: 1, opt: null }, { id: 1 })).toBe(false)
      expect(await same([1, undefined], [1])).toBe(false)
    })

    it('include symbol keys', async () => {
      const key = Symbol('tenant')
      expect(await same({ [key]: 1 }, { [key]: 2 })).toBe(false)
      expect(await same({ [key]: 1 }, { [key]: 1 })).toBe(true)
    })
  })
})
