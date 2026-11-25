import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  asyncInject,
  Container,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  provide,
  registerInjectable,
} from '../index.mjs'

import type { ClassType, OnServiceDestroy, OnServiceInit } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** What a promise came to, or `hang` when it did not settle in time. */
const outcome = async (promise: Promise<unknown>, ms = 100): Promise<unknown> =>
  Promise.race([
    promise.then(
      () => 'resolved',
      (error) => error?.code ?? String(error),
    ),
    tick(ms).then(() => 'hang'),
  ])

describe('resolutions in flight', () => {
  let container: Container
  let unhandled: unknown[]
  const onUnhandled = (reason: unknown) => unhandled.push(reason)

  beforeEach(() => {
    container = new Container()
    unhandled = []
    process.on('unhandledRejection', onUnhandled)
  })

  afterEach(async () => {
    process.off('unhandledRejection', onUnhandled)
    await container.dispose()
  })

  describe('asyncInject() that nobody awaits', () => {
    it('does not reject when its scope ends before a singleton is ready', async () => {
      @Injectable()
      class Audit implements OnServiceInit {
        async onServiceInit() {
          await tick(5)
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly audit = asyncInject(Audit)
      }

      const scope = container.createScope()
      const handler = await scope.get(Handler)
      await scope.dispose()

      // The singleton outlives the scope, so the promise still delivers it.
      expect(await handler.audit).toBe(await container.get(Audit))
      await tick()
      expect(unhandled).toEqual([])
    })

    it('leaves no unhandled rejection when its scope ends in the same tick', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Dependency {}

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly dependency = asyncInject(Dependency)
      }

      const scope = container.createScope()
      const handler = scope.getSync(Handler)
      await scope.dispose()
      await tick(5)

      expect(unhandled).toEqual([])
      await expect(handler.dependency).rejects.toMatchObject({
        code: DIErrorCode.ContainerDisposed,
      })
    })

    it('leaves no unhandled rejection for the promise of a discarded constructor pass', async () => {
      @Injectable()
      class Config implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }
      }

      @Injectable()
      class Broken implements OnServiceInit {
        async onServiceInit() {
          throw new Error('broken')
        }
      }

      @Injectable()
      class Service implements OnServiceInit {
        private readonly config = inject(Config)
        private readonly broken = asyncInject(Broken)
        fallback = false

        async onServiceInit() {
          try {
            await this.broken
          } catch {
            this.fallback = true
          }
        }
      }

      expect((await container.get(Service)).fallback).toBe(true)
      await tick(5)
      expect(unhandled).toEqual([])
    })
  })

  describe('invalidate() while a dependent is being built', () => {
    it('does not wait for a half-built dependent', async () => {
      @Injectable()
      class Config {}

      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(5)
        }
      }

      @Injectable()
      class Service {
        readonly config = inject(Config)
        readonly slow = inject(Slow)
      }

      const config = await container.get(Config)
      const service = container.get(Service)
      const invalidation = container.invalidate(config)

      expect(await outcome(service)).toBe('resolved')
      expect(await outcome(invalidation)).toBe('resolved')
      expect((await service).config).not.toBe(config)
      expect((await service).config).toBe(await container.get(Config))
    })

    it('does not block a request or the requests after it', async () => {
      @Injectable()
      class Config {}

      @Injectable({ scope: InjectableScope.Request })
      class Db implements OnServiceInit {
        async onServiceInit() {
          await tick(5)
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly config = inject(Config)
        readonly db = inject(Db)
      }

      const config = await container.get(Config)
      const first = container.createScope()
      const second = container.createScope()
      const handled = first.get(Handler)
      const invalidation = container.invalidate(config)

      expect(await outcome(handled)).toBe('resolved')
      expect(await outcome(invalidation)).toBe('resolved')
      expect(await outcome(second.get(Handler))).toBe('resolved')
      expect(await outcome(first.dispose())).toBe('resolved')
      expect(await outcome(second.dispose())).toBe('resolved')
    })

    it('does not hang an asynchronous factory that injects the dependency twice', async () => {
      @Injectable()
      class Config {}

      const TOKEN = InjectionToken.create<{ first: Config; second: Config }>('twice')
      container.provide(TOKEN, {
        factory: async (ctx) => {
          const first = await ctx.inject(Config)
          await tick(5)
          return { first, second: await ctx.inject(Config) }
        },
      })

      const config = await container.get(Config)
      const product = container.get(TOKEN)
      await tick()
      const invalidation = container.invalidate(config)

      expect(await outcome(product)).toBe('resolved')
      expect(await outcome(invalidation)).toBe('resolved')
      // What it was first built from is gone, so it was built again.
      const { first, second } = await product
      expect(first).toBe(second)
      expect(first).not.toBe(config)
    })

    it('hands out the instance built after the invalidation, not the doomed one', async () => {
      const destroyed: unknown[] = []

      @Injectable()
      class Dependency {}

      @Injectable()
      class Service implements OnServiceInit, OnServiceDestroy {
        readonly dependency = inject(Dependency)

        async onServiceInit() {
          await tick(5)
        }

        onServiceDestroy() {
          destroyed.push(this)
        }
      }

      const dependency = await container.get(Dependency)
      const pending = container.get(Service)
      await container.invalidate(dependency)
      const service = await pending

      expect(destroyed).toHaveLength(1)
      expect(destroyed).not.toContain(service)
      expect(service.dependency).not.toBe(dependency)
      expect(await container.get(Service)).toBe(service)
    })

    it('gives a dependent of the half-built service the new instance as well', async () => {
      @Injectable()
      class Dependency {}

      @Injectable()
      class Middle implements OnServiceInit {
        readonly dependency = inject(Dependency)

        async onServiceInit() {
          await tick(5)
        }
      }

      @Injectable()
      class Top {
        readonly middle = inject(Middle)
      }

      const dependency = await container.get(Dependency)
      const pending = container.get(Top)
      await container.invalidate(dependency)

      const top = await pending
      expect(top.middle.dependency).not.toBe(dependency)
      expect(top.middle).toBe(await container.get(Middle))
    })

    it('rebuilds a transient whose dependency went away between two passes', async () => {
      @Injectable()
      class Dependency {}

      @Injectable({ scope: InjectableScope.Transient })
      class Helper {
        readonly dependency = inject(Dependency)
      }

      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(5)
        }
      }

      @Injectable()
      class Service {
        readonly helper = inject(Helper)
        readonly slow = inject(Slow)
      }

      const dependency = await container.get(Dependency)
      const pending = container.get(Service)
      await container.invalidate(dependency)
      const service = await pending
      expect(service.helper.dependency).toBe(await container.get(Dependency))

      // The link through the transient survives the discarded passes.
      await container.invalidate(service.helper.dependency)
      expect(await container.get(Service)).not.toBe(service)
    })

    it('gives up when the service does so synchronously each time', async () => {
      let built = 0

      @Injectable()
      class Config {}

      @Injectable()
      class Service implements OnServiceInit {
        private readonly config = inject(Config)

        onServiceInit() {
          if (++built > 100) {
            throw new Error('never gave up')
          }
          void container.invalidate(this.config)
        }
      }

      await expect(container.get(Service)).rejects.toThrow('times in a row')
    })

    it('gives up when the service invalidates what it depends on each time', async () => {
      let built = 0

      @Injectable()
      class Dependency {}

      @Injectable()
      class Service implements OnServiceInit {
        private readonly dependency = inject(Dependency)
        private readonly container = inject(Container)

        async onServiceInit() {
          built++
          await this.container.invalidate(this.dependency)
        }
      }

      await expect(container.get(Service)).rejects.toThrow(/Service was invalidated .* being built/)
      expect(built).toBeLessThan(100)
    })
  })

  describe('transients reused by a replay', () => {
    const schema = z.object({ baseUrl: z.string().default('http://default') })

    it('are reused only for equal args', async () => {
      @Injectable({ scope: InjectableScope.Transient, schema })
      class Http {
        constructor(public readonly args: z.output<typeof schema>) {}
      }

      @Injectable()
      class Config implements OnServiceInit {
        region = ''

        async onServiceInit() {
          await tick()
          this.region = 'eu'
        }
      }

      @Injectable()
      class Api {
        readonly urls: string[] = []

        constructor() {
          const config = inject(Config)
          const regions: string[] = []
          try {
            regions.push(config.region)
          } catch {
            // Not ready in the first pass.
          }
          for (const baseUrl of [...regions, 'fixed']) {
            this.urls.push(inject(Http, { baseUrl }).args.baseUrl)
          }
        }
      }

      expect((await container.get(Api)).urls).toEqual(['eu', 'fixed'])
    })

    it('do not keep a callback of the discarded instance', async () => {
      const callbacks = z.object({ onChange: z.custom<() => void>() })

      @Injectable({ scope: InjectableScope.Transient, schema: callbacks })
      class Subscription {
        constructor(public readonly args: z.output<typeof callbacks>) {}
      }

      @Injectable()
      class Config implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }
      }

      @Injectable()
      class Widget {
        count = 0
        readonly subscription = inject(Subscription, { onChange: () => void this.count++ })
        readonly config = inject(Config)
      }

      const widget = await container.get(Widget)
      widget.subscription.args.onChange()
      expect(widget.count).toBe(1)
    })

    it('makes every use of a placeholder fail', async () => {
      const uses: Record<string, unknown> = {}

      @Injectable()
      class Config implements OnServiceInit {
        token = 'secret'

        async onServiceInit() {
          await tick()
        }
      }

      const attempt = (name: string, use: () => unknown) => {
        try {
          use()
          uses[name] ??= 'worked'
        } catch (error) {
          uses[name] ??= (error as { code?: string }).code
        }
      }

      @Injectable()
      class Service {
        constructor() {
          const config = inject(Config) as any
          attempt('spread', () => ({ ...config }))
          attempt('keys', () => Object.keys(config))
          attempt('in', () => 'token' in config)
          attempt('set', () => (config.token = 'x'))
          attempt('define', () => Object.defineProperty(config, 'x', { value: 1 }))
          attempt('delete', () => delete config.token)
        }
      }

      await container.get(Service)
      expect(uses).toEqual({
        spread: DIErrorCode.AccessBeforeInit,
        keys: DIErrorCode.AccessBeforeInit,
        in: DIErrorCode.AccessBeforeInit,
        set: DIErrorCode.AccessBeforeInit,
        define: DIErrorCode.AccessBeforeInit,
        delete: DIErrorCode.AccessBeforeInit,
      })
    })

    it('names a transient that never settles because its args differ on every pass', async () => {
      const callbacks = z.object({ onChange: z.custom<() => void>() })

      @Injectable({ scope: InjectableScope.Transient, schema: callbacks })
      class Subscription implements OnServiceInit {
        constructor(public readonly args: z.output<typeof callbacks>) {}

        async onServiceInit() {}
      }

      @Injectable()
      class Widget {
        readonly subscription = inject(Subscription, { onChange: () => void this })
      }

      const error = await container.get(Widget).catch((e) => e)
      expect(error.message).toContain('Widget')
      expect(error.message).toContain('Subscription')
      expect(error.message).toContain('args')
    })

    describe('hold what they asked for with asyncInject()', () => {
      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(30)
        }
      }

      @Injectable()
      class Failing implements OnServiceInit {
        async onServiceInit() {
          throw new Error('bad')
        }
      }

      it('while it is still being built', async () => {
        let built = 0

        @Injectable({ scope: InjectableScope.Transient })
        class Helper implements OnServiceInit {
          readonly slow = asyncInject(Slow)

          constructor() {
            built++
          }

          async onServiceInit() {}
        }

        @Injectable()
        class Service {
          readonly helper = inject(Helper)
        }

        const service = await container.get(Service)
        expect(built).toBe(1)
        expect(await service.helper.slow).toBe(await container.get(Slow))
      })

      it('after it failed and the failure was dealt with', async () => {
        let built = 0

        @Injectable({ scope: InjectableScope.Transient })
        class Helper implements OnServiceInit {
          readonly failing = asyncInject(Failing)

          constructor() {
            built++
          }

          async onServiceInit() {
            await this.failing.catch(() => {})
          }
        }

        @Injectable()
        class Service {
          readonly helper = inject(Helper)
        }

        expect(await outcome(container.get(Service))).toBe('resolved')
        expect(built).toBe(1)
      })

      it('when it is what they belong to', async () => {
        let built = 0

        @Injectable({ scope: InjectableScope.Transient })
        class Helper implements OnServiceInit {
          readonly owner: Promise<Service> = asyncInject(Service)

          constructor() {
            built++
          }

          async onServiceInit() {}
        }

        @Injectable()
        class Service {
          readonly helper: Helper = inject(Helper)
        }

        const service = await container.get(Service)
        expect(built).toBe(1)
        expect(await service.helper.owner).toBe(service)
      })

      it('also when that is doomed before it is ready', async () => {
        let built = 0

        @Injectable()
        class Config {}

        @Injectable()
        class Loader implements OnServiceInit {
          readonly config = inject(Config)

          async onServiceInit() {
            await tick(30)
          }
        }

        @Injectable({ scope: InjectableScope.Transient })
        class Helper implements OnServiceInit {
          readonly loader = asyncInject(Loader)

          constructor() {
            built++
          }

          async onServiceInit() {
            await tick(5)
          }
        }

        @Injectable()
        class Service {
          readonly helper = inject(Helper)
        }

        const config = await container.get(Config)
        const pending = container.get(Service)
        await tick()
        await container.invalidate(config)
        const service = await pending
        expect(built).toBe(1)
        expect((await service.helper.loader).config).toBe(await container.get(Config))
      })
    })

    it('connect their owner with what they injected', async () => {
      @Injectable()
      class Config {}

      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Inner {
        readonly config = inject(Config)
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper {
        readonly inner = inject(Inner)
      }

      @Injectable()
      class Service {
        readonly helper = inject(Helper)
        readonly db = inject(Db)
      }

      const service = await container.get(Service)
      await container.invalidate(service.helper.inner.config)
      const next = await container.get(Service)
      expect(next).not.toBe(service)
      expect(next.helper.inner.config).toBe(await container.get(Config))
    })

    it('do not go on being built for an owner that failed', async () => {
      let passes = 0

      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(10)
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper {
        readonly slow = inject(Slow)

        constructor() {
          passes++
        }
      }

      @Injectable()
      class Bad implements OnServiceInit {
        async onServiceInit() {
          throw new Error('bad')
        }
      }

      @Injectable()
      class Service {
        readonly helper = inject(Helper)
        readonly bad = inject(Bad)
      }

      await expect(container.get(Service)).rejects.toThrow('bad')
      const before = passes
      await container.get(Slow)
      await tick(5)
      expect(passes).toBe(before)
    })

    it('are destroyed when a later pass does not ask for them', async () => {
      const log: string[] = []
      let passes = 0

      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper implements OnServiceDestroy {
        onServiceDestroy() {
          log.push('destroyed')
        }
      }

      @Injectable()
      class Service {
        readonly helper = passes++ === 0 ? inject(Helper) : null
        readonly db = inject(Db)
      }

      expect((await container.get(Service)).helper).toBeNull()
      expect(log).toEqual(['destroyed'])
    })

    it('are destroyed when a later pass fails before it asks for them', async () => {
      const log: string[] = []
      let passes = 0

      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper implements OnServiceDestroy {
        onServiceDestroy() {
          log.push('destroyed')
        }
      }

      @Injectable()
      class Service {
        readonly helper = this.ask()
        readonly db = inject(Db)

        private ask() {
          if (passes++ > 0) {
            throw new Error('second pass')
          }
          return inject(Helper)
        }
      }

      await expect(container.get(Service)).rejects.toThrow('second pass')
      expect(log).toEqual(['destroyed'])
    })
  })

  describe('a constructor pass that is discarded', () => {
    it.each<[string, (token: ClassType) => unknown]>([
      ['inject', inject],
      ['asyncInject', asyncInject],
    ])('leaves no link to what only it asked for with %s()', async (_, ask) => {
      let passes = 0

      @Injectable()
      class First {}

      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable()
      class Service {
        readonly first = passes++ === 0 ? ask(First) : null
        readonly db = inject(Db)
      }

      const service = await container.get(Service)
      expect(service.first).toBeNull()
      await container.invalidate(await container.get(First))
      expect(await container.get(Service)).toBe(service)
    })

    it('builds no transient for its asyncInject()', async () => {
      let built = 0

      @Injectable({ scope: InjectableScope.Request })
      class Db implements OnServiceInit {
        async onServiceInit() {}
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Connection {
        constructor() {
          built++
        }
      }

      const CONNECTION = InjectionToken.create<Connection>('connection')
      container.provide(CONNECTION, { existing: Connection })

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly connection = asyncInject(Connection)
        readonly alias = asyncInject(CONNECTION)
        readonly db = inject(Db)
      }

      for (let request = 1; request <= 3; request++) {
        const scope = container.createScope()
        const handler = await scope.get(Handler)
        expect(await handler.connection).toBeInstanceOf(Connection)
        expect(await handler.alias).toBeInstanceOf(Connection)
        expect(built).toBe(2 * request)
        await scope.dispose()
      }
    })

    it('starts what is stored, which the next pass only waits for', async () => {
      const order: string[] = []

      @Injectable()
      class Db implements OnServiceInit {
        async onServiceInit() {
          await tick(20)
          order.push('db')
        }
      }

      @Injectable()
      class Cache implements OnServiceInit {
        async onServiceInit() {
          order.push('cache')
        }
      }

      @Injectable()
      class Service {
        readonly cache = asyncInject(Cache)
        readonly db = inject(Db)
      }

      await (
        await container.get(Service)
      ).cache
      expect(order).toEqual(['cache', 'db'])
    })
  })

  describe('a build that needs many passes', () => {
    const services = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        class Service implements OnServiceInit {
          readonly index = index

          async onServiceInit() {}
        }
        registerInjectable(Service)
        return Service
      })

    it('goes on as long as each of them gets further', async () => {
      const many = services(70)
      const REGISTRY = InjectionToken.create<object[]>('registry')
      container.provide(REGISTRY, { factory: () => many.map((service) => inject(service)) })
      expect(await container.get(REGISTRY)).toHaveLength(70)

      const others = services(70)

      @Injectable()
      class Registry {
        readonly sum = others.reduce((sum, service) => sum + inject(service).index, 0)
      }

      expect((await container.get(Registry)).sum).toBe((69 * 70) / 2)
    })

    it('goes on in a transient that nobody owns, and for args of one token', async () => {
      const many = services(40)
      const id = z.object({ id: z.number() })
      const SHARD = InjectionToken.create<object, typeof id>('shard', id)
      container.provide(SHARD, { factory: async (_, args) => args })

      @Injectable({ scope: InjectableScope.Transient })
      class Loose {
        readonly sum = many.reduce((sum, service) => sum + inject(service).index, 0)
      }

      expect((await container.get(Loose)).sum).toBe((39 * 40) / 2)

      const SHARDS = InjectionToken.create<object[]>('shards')
      container.provide(SHARDS, {
        factory: () => Array.from({ length: 40 }, (_, index) => inject(SHARD, { id: index })),
      })
      expect(await container.get(SHARDS)).toHaveLength(40)
    })

    it('gives up when they do not', async () => {
      const id = z.object({ id: z.number() })
      let next = 0

      @Injectable({ schema: id })
      class Keyed implements OnServiceInit {
        constructor(public readonly args: z.output<typeof id>) {}

        async onServiceInit() {}
      }

      @Injectable()
      class Service {
        readonly keyed = inject(Keyed, { id: next++ })
      }

      const error = await container.get(Service).catch((e) => e)
      expect(error.message).toContain('Service did not settle')
      expect(error.message).toContain('Keyed')
      expect(next).toBeLessThan(50)
    })
  })

  describe('what a transient of asyncInject() leaves behind', () => {
    it.each([InjectableScope.Singleton, InjectableScope.Request])(
      'is nothing when its %s owner fails first',
      async (scope) => {
        const log: string[] = []

        @Injectable({ scope: InjectableScope.Transient })
        class Connection implements OnServiceInit, OnServiceDestroy {
          async onServiceInit() {
            await tick(5)
            log.push('opened')
          }

          onServiceDestroy() {
            log.push('closed')
          }
        }

        @Injectable({ scope })
        class Service implements OnServiceInit {
          readonly connection = asyncInject(Connection)

          async onServiceInit() {
            await tick()
            throw new Error('failed')
          }
        }

        const request = container.createScope()
        await expect(request.get(Service)).rejects.toThrow('failed')
        await tick(20)
        expect(log).toEqual(['opened', 'closed'])
        await request.dispose()
      },
    )

    it('is nothing when the factory that called ctx.inject() fails first', async () => {
      const log: string[] = []

      @Injectable({ scope: InjectableScope.Transient })
      class Connection implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick()
        }

        onServiceDestroy() {
          log.push('closed')
        }
      }

      const TOKEN = InjectionToken.create<object>('token')
      container.provide(TOKEN, {
        factory: async (ctx) => {
          void ctx.inject(Connection)
          throw new Error('failed')
        },
      })
      await expect(container.get(TOKEN)).rejects.toThrow('failed')
      await tick(10)
      expect(log).toEqual(['closed'])
    })

    it('is nothing when its owner is a transient that a scope handed out', async () => {
      const log: string[] = []

      @Injectable({ scope: InjectableScope.Transient })
      class Connection implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick()
        }

        onServiceDestroy() {
          log.push('closed')
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Loose {
        readonly connection = asyncInject(Connection)
      }

      const scope = container.createScope()
      await (
        await scope.get(Loose)
      ).connection
      await scope.dispose()
      expect(log).toEqual(['closed'])
    })

    it('is nothing when its owner is destroyed first', async () => {
      const log: string[] = []
      let open = () => {}
      const opened = new Promise<void>((resolve) => {
        open = resolve
      })

      @Injectable({ scope: InjectableScope.Transient })
      class Connection implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await opened
        }

        onServiceDestroy() {
          log.push('closed')
        }
      }

      @Injectable()
      class Service {
        readonly connection = asyncInject(Connection)
      }

      await container.invalidate(await container.get(Service))
      open()
      await tick(5)
      expect(log).toEqual(['closed'])
    })
  })

  describe('conditional dependencies', () => {
    it('are not built for a request that does not ask for them', async () => {
      const log: string[] = []
      const IS_ADMIN = InjectionToken.create<boolean>('isAdmin', {
        scope: InjectableScope.Request,
      })

      @Injectable({ scope: InjectableScope.Request })
      class User implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class AdminTransaction implements OnServiceInit {
        async onServiceInit() {
          log.push('BEGIN')
          await tick()
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly user = inject(User)
        readonly admin = inject(IS_ADMIN) ? inject(AdminTransaction) : null
      }

      const request = async (admin: boolean) => {
        const scope = container.createScope()
        scope.addInstance(IS_ADMIN, admin)
        await scope.get(Handler)
        await scope.dispose()
      }

      await request(true)
      log.length = 0
      await request(false)
      await request(false)
      expect(log).toEqual([])
    })

    it('are not built in a container whose configuration does not ask for them', async () => {
      const USE_REDIS = InjectionToken.create<boolean>('useRedis')
      let hang = false
      const connected = vi.fn()

      @Injectable()
      class Config implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }
      }

      @Injectable()
      class Redis implements OnServiceInit {
        async onServiceInit() {
          connected()
          if (hang) {
            await new Promise(() => {})
          }
        }
      }

      @Injectable()
      class Service {
        readonly config = inject(Config)
        readonly redis = inject(USE_REDIS) ? inject(Redis) : null
      }

      const first = new Container({ providers: [provide(USE_REDIS, { value: true })] })
      await first.get(Service)
      connected.mockClear()
      hang = true

      const second = new Container({ providers: [provide(USE_REDIS, { value: false })] })
      expect(await outcome(second.get(Service))).toBe('resolved')
      expect(connected).not.toHaveBeenCalled()
      await first.dispose()
      await second.dispose()
    })
  })

  describe('links', () => {
    it('are kept once, however often a factory product injects the same service', async () => {
      @Injectable()
      class Db {}

      const TOKEN = InjectionToken.create<{ next: () => Promise<Db> }>('lazy')
      container.provide(TOKEN, { factory: (ctx) => ({ next: () => ctx.inject(Db) }) })

      const product = await container.get(TOKEN)
      for (let i = 0; i < 50; i++) {
        await product.next()
      }
      expect((container as any).store.get(TOKEN, null).deps).toHaveLength(1)
    })

    it('are not added by an owner that is gone', async () => {
      @Injectable()
      class Db {}

      const TOKEN = InjectionToken.create<{ next: () => Promise<Db> }>('lazy')
      container.provide(TOKEN, { factory: (ctx) => ({ next: () => ctx.inject(Db) }) })
      await container.get(Db)

      for (let i = 0; i < 10; i++) {
        const product = await container.get(TOKEN)
        await container.invalidate(product)
        await product.next()
      }
      const entry = (container as any).store.entries().find((e: any) => e.token.name === Db)
      expect(entry.dependents?.size ?? 0).toBe(0)
    })

    it('are not added by a transient that is still initialising when its request fails', async () => {
      @Injectable()
      class Single {}

      @Injectable({ scope: InjectableScope.Request })
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(2)
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Failing implements OnServiceInit {
        async onServiceInit() {
          throw new Error('db down')
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper {
        readonly slow = inject(Slow)
        readonly single = inject(Single)
      }

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly helper = inject(Helper)
        readonly failing = inject(Failing)
      }

      for (let i = 0; i < 5; i++) {
        const scope = container.createScope()
        await expect(scope.get(Handler)).rejects.toThrow('db down')
        await scope.dispose()
      }
      await tick(10)
      const entry = (container as any).store.entries().find((e: any) => e.token.name === Single)
      expect(entry?.dependents?.size ?? 0).toBe(0)
    })

    it('connect a service with what its asynchronously injected transient uses', async () => {
      const order: string[] = []

      @Injectable()
      class Db implements OnServiceDestroy {
        onServiceDestroy() {
          order.push('db')
        }
      }

      @Injectable({ scope: InjectableScope.Transient })
      class Helper implements OnServiceDestroy {
        private readonly db = inject(Db)

        onServiceDestroy() {
          order.push('helper')
        }
      }

      @Injectable()
      class Service implements OnServiceInit {
        private readonly helper = asyncInject(Helper)

        async onServiceInit() {
          await this.helper
        }
      }

      await container.get(Service)
      await container.dispose()
      expect(order).toEqual(['helper', 'db'])
      container = new Container()
    })
  })

  describe('a dependency that fails', () => {
    it.each(['synchronously', 'asynchronously'])(
      'can be replaced when it fails %s',
      async (how) => {
        class Bad implements OnServiceInit {
          onServiceInit(): void | Promise<void> {
            if (how === 'synchronously') {
              throw new Error('bad')
            }
            return tick().then(() => {
              throw new Error('bad')
            })
          }
        }
        const BAD = InjectionToken.create<Bad>('bad')
        container.provide(BAD, Bad)

        @Injectable()
        class Service {
          readonly dependency: unknown

          constructor() {
            try {
              this.dependency = inject(BAD)
            } catch {
              this.dependency = 'fallback'
            }
          }
        }

        expect((await container.get(Service)).dependency).toBe('fallback')
      },
    )

    it('fails the build at once, without waiting for a slower dependency', async () => {
      @Injectable()
      class Slow implements OnServiceInit {
        async onServiceInit() {
          await tick(200)
        }
      }

      @Injectable()
      class Bad implements OnServiceInit {
        async onServiceInit() {
          throw new Error('bad')
        }
      }

      @Injectable()
      class Service {
        readonly slow = inject(Slow)
        readonly bad = inject(Bad)
      }

      expect(await outcome(container.get(Service), 50)).toBe(DIErrorCode.InitializationError)
    })
  })

  describe('getSync() of a transient with an asynchronous initialiser', () => {
    it('destroys the transient it could not hand out', async () => {
      const log: string[] = []

      @Injectable({ scope: InjectableScope.Transient })
      class Slow implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick()
          log.push('init')
        }

        onServiceDestroy() {
          log.push('destroy')
        }
      }

      const scope = container.createScope()
      expect(() => scope.getSync(Slow)).toThrow(
        expect.objectContaining({ code: DIErrorCode.AsyncInitRequired }),
      )
      await scope.dispose()
      expect(log).toEqual(['init', 'destroy'])
    })
  })

  describe('getSync() of something that is being destroyed', () => {
    it('says so', async () => {
      @Injectable()
      class Service implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
        }
      }

      const invalidation = container.invalidate(await container.get(Service))
      expect(() => container.getSync(Service)).toThrow('being destroyed')
      await invalidation
    })
  })

  describe('callbacks that run while a class is being built', () => {
    it('keeps inject() out of the factory of a factory token', async () => {
      const TENANT = InjectionToken.create<string>('tenant', { scope: InjectableScope.Request })
      const schema = z.object({ tenant: z.string() })
      const REPO = InjectionToken.create<{ tenant: string }, typeof schema>('repo', schema)
      const CURRENT = InjectionToken.factory(REPO, () => ({ tenant: inject(TENANT) }))
      container.provide(REPO, {
        factory: (_ctx, args) => args as { tenant: string },
        scope: InjectableScope.Request,
      })

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly repo = inject(CURRENT)
      }

      for (const tenant of ['acme', 'globex']) {
        const scope = container.createScope()
        scope.addInstance(TENANT, tenant)
        // It used to be cached with the tenant of the first request.
        await expect(scope.get(Handler)).rejects.toMatchObject({
          code: DIErrorCode.OutsideInjectionContext,
        })
        await scope.dispose()
      }
    })

    it('keeps inject() out of the onServiceInit() of a dependency', async () => {
      @Injectable()
      class Other {}

      @Injectable()
      class Dependency implements OnServiceInit {
        onServiceInit() {
          inject(Other)
        }
      }

      @Injectable()
      class Service {
        readonly dependency = inject(Dependency)
      }

      await expect(container.get(Dependency)).rejects.toMatchObject({
        code: DIErrorCode.OutsideInjectionContext,
      })
      await expect(container.get(Service)).rejects.toMatchObject({
        code: DIErrorCode.OutsideInjectionContext,
      })
    })
  })
})
