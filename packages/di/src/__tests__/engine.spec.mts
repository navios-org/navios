import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import {
  asyncInject,
  Container,
  DIError,
  DIErrorCode,
  Factory,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  optional,
  provide,
} from '../index.mjs'

import type { FactoryContext, OnServiceInit } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('engine: sync-first resolution', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('constructs a class with synchronous dependencies exactly once', async () => {
    let constructed = 0

    @Injectable()
    class Dep {}

    @Injectable()
    class Service {
      dep = inject(Dep)
      constructor() {
        constructed++
      }
    }

    const service = await container.get(Service)
    expect(service.dep).toBeInstanceOf(Dep)
    expect(constructed).toBe(1)
  })

  it('resolves synchronously with getSync when nothing is async', () => {
    @Injectable()
    class Dep {}

    @Injectable()
    class Service {
      dep = inject(Dep)
    }

    const service = container.getSync(Service)
    expect(service.dep).toBeInstanceOf(Dep)
    expect(container.getSync(Service)).toBe(service)
  })

  it('throws AsyncInitRequired from getSync when an initialiser is async', async () => {
    @Injectable()
    class Slow implements OnServiceInit {
      async onServiceInit() {
        await tick()
      }
    }

    expect(() => container.getSync(Slow)).toThrow(
      expect.objectContaining({ code: DIErrorCode.AsyncInitRequired }),
    )
    await container.ready()
    expect(container.getSync(Slow)).toBeInstanceOf(Slow)
  })

  it('constructs twice cold and once warm when a dependency initialises asynchronously', async () => {
    let constructed = 0

    @Injectable()
    class Slow implements OnServiceInit {
      ready = false
      async onServiceInit() {
        await tick()
        this.ready = true
      }
    }

    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {
      slow = inject(Slow)
      constructor() {
        constructed++
      }
    }

    const first = container.createScope()
    const a = await first.get(PerRequest)
    expect(a.slow.ready).toBe(true)
    expect(constructed).toBe(2)

    constructed = 0
    const second = container.createScope()
    const b = await second.get(PerRequest)
    expect(b.slow).toBe(a.slow)
    expect(constructed).toBe(1)

    await first.dispose()
    await second.dispose()
  })

  it('constructs once per build after the first when a request-scoped dependency is always async', async () => {
    let constructed = 0

    @Injectable({ scope: InjectableScope.Request })
    class SlowPerRequest implements OnServiceInit {
      async onServiceInit() {
        await tick()
      }
    }

    @Injectable({ scope: InjectableScope.Request })
    class Uses {
      dep = inject(SlowPerRequest)
      constructor() {
        constructed++
      }
    }

    const first = container.createScope()
    await first.get(Uses)
    expect(constructed).toBe(2)

    constructed = 0
    const second = container.createScope()
    const uses = await second.get(Uses)
    expect(uses.dep).toBeInstanceOf(SlowPerRequest)
    expect(constructed).toBe(1)

    await first.dispose()
    await second.dispose()
  })

  it('never exposes a dependency before its onServiceInit has finished', async () => {
    @Injectable()
    class Slow implements OnServiceInit {
      ready = false
      async onServiceInit() {
        await tick()
        this.ready = true
      }
    }

    @Injectable()
    class Service implements OnServiceInit {
      slow = inject(Slow)
      seen = false
      onServiceInit() {
        this.seen = this.slow.ready
      }
    }

    const service = await container.get(Service)
    expect(service.seen).toBe(true)
  })

  it('gives each inject() of a transient its own instance', async () => {
    @Injectable({ scope: InjectableScope.Transient })
    class Transient {}

    @Injectable()
    class Service {
      a = inject(Transient)
      b = inject(Transient)
    }

    const service = await container.get(Service)
    expect(service.a).toBeInstanceOf(Transient)
    expect(service.a).not.toBe(service.b)
  })

  it('does not construct a transient twice because of a replay', async () => {
    let transients = 0

    @Injectable()
    class Slow implements OnServiceInit {
      async onServiceInit() {
        await tick()
      }
    }

    @Injectable({ scope: InjectableScope.Transient })
    class Transient {
      constructor() {
        transients++
      }
    }

    @Injectable()
    class Service {
      t = inject(Transient)
      slow = inject(Slow)
    }

    const service = await container.get(Service)
    expect(service.t).toBeInstanceOf(Transient)
    expect(transients).toBe(1)
  })

  it('constructs a transient with an async initialiser once', async () => {
    let transients = 0

    @Injectable({ scope: InjectableScope.Transient })
    class SlowTransient implements OnServiceInit {
      ready = false
      constructor() {
        transients++
      }
      async onServiceInit() {
        await tick()
        this.ready = true
      }
    }

    @Injectable()
    class Service {
      t = inject(SlowTransient)
    }

    const service = await container.get(Service)
    expect(service.t.ready).toBe(true)
    expect(transients).toBe(1)
  })

  it('allows conditional inject() calls', async () => {
    @Injectable()
    class A {}

    @Injectable()
    class B {}

    let useB = false

    @Injectable({ scope: InjectableScope.Transient })
    class Service {
      dep: A | B = useB ? inject(B) : inject(A)
    }

    expect((await container.get(Service)).dep).toBeInstanceOf(A)
    useB = true
    expect((await container.get(Service)).dep).toBeInstanceOf(B)
  })

  it('detects a synchronous cycle with the path, in production too', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      @Injectable()
      class A {
        b: unknown = inject(B)
      }

      @Injectable()
      class B {
        a: unknown = inject(A)
      }

      const error = await container.get(A).catch((e) => e)
      expect(error).toBeInstanceOf(DIError)
      expect(error.code).toBe(DIErrorCode.CircularDependency)
      expect(error.message).toContain('A -> B -> A')
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('fails a cross-task cycle instead of hanging', async () => {
    @Injectable()
    class Slow implements OnServiceInit {
      async onServiceInit() {
        await tick(5)
      }
    }

    @Injectable()
    class A {
      slow = inject(Slow)
      b: unknown = inject(B)
    }

    @Injectable()
    class B {
      slow = inject(Slow)
      a: unknown = inject(A)
    }

    const outcome = await Promise.race([
      Promise.allSettled([container.get(A), container.get(B)]),
      tick(500).then(() => 'timeout' as const),
    ])
    expect(outcome).not.toBe('timeout')
    const results = outcome as PromiseSettledResult<unknown>[]
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(rejected.length).toBeGreaterThan(0)
    expect(rejected[0].reason.code).toBe(DIErrorCode.CircularDependency)
  })

  it('lets asyncInject break a cycle', async () => {
    @Injectable()
    class A {
      b = asyncInject(B)
    }

    @Injectable()
    class B {
      a = inject(A)
    }

    const a = await container.get(A)
    const b = await a.b
    expect(b.a).toBe(a)
  })

  describe('asyncInject awaited while the requester is still initialising', () => {
    const settle = <T,>(promise: Promise<T>) =>
      Promise.race([
        promise.then(
          (value) => ({ value }) as const,
          (error) => ({ error }) as const,
        ),
        tick(300).then(() => 'timeout' as const),
      ])

    const expectCycle = (outcome: unknown, path: string) => {
      expect(outcome).not.toBe('timeout')
      const { error } = outcome as { error: DIError }
      expect(error).toBeInstanceOf(DIError)
      expect(error.code).toBe(DIErrorCode.CircularDependency)
      expect(error.message).toContain(path)
    }

    it('fails when onServiceInit awaits a dependency that injects the service back', async () => {
      @Injectable()
      class A implements OnServiceInit {
        b = asyncInject(B)

        async onServiceInit() {
          await this.b
        }
      }

      @Injectable()
      class B {
        a: unknown = inject(A)
      }

      expectCycle(await settle(container.get(A)), 'A -> B -> A')
    })

    it('fails the same cycle when it is entered from the other side', async () => {
      @Injectable()
      class A implements OnServiceInit {
        b = asyncInject(B)

        async onServiceInit() {
          await this.b
        }
      }

      @Injectable()
      class B {
        a: unknown = inject(A)
      }

      expectCycle(await settle(container.get(B)), 'A -> B -> A')
    })

    it('fails when the await comes late in onServiceInit', async () => {
      @Injectable()
      class A implements OnServiceInit {
        b = asyncInject(B)

        async onServiceInit() {
          await tick(5)
          await this.b
        }
      }

      @Injectable()
      class B {
        a: unknown = inject(A)
      }

      expectCycle(await settle(container.get(A)), 'A -> B -> A')
    })

    it('reports the whole path of a longer cycle', async () => {
      @Injectable()
      class A implements OnServiceInit {
        b = asyncInject(B)

        async onServiceInit() {
          await this.b
        }
      }

      @Injectable()
      class B {
        c: unknown = inject(C)
      }

      @Injectable()
      class C {
        a: unknown = inject(A)
      }

      expectCycle(await settle(container.get(A)), 'A -> B -> C -> A')
    })

    it('fails when an asynchronous factory awaits it', async () => {
      const TOKEN = InjectionToken.create<{ b: unknown }>('AsyncFactoryCycle')

      @Injectable()
      class B {
        made: unknown = inject(TOKEN)
      }

      container.provide(TOKEN, {
        factory: async () => ({ b: await asyncInject(B) }),
      })

      expectCycle(await settle(container.get(TOKEN)), 'AsyncFactoryCycle -> B -> AsyncFactoryCycle')
    })

    it('can be resolved again after the cycle was reported', async () => {
      let awaitInInit = true

      @Injectable()
      class A implements OnServiceInit {
        b = asyncInject(B)

        async onServiceInit() {
          if (awaitInInit) {
            await this.b
          }
        }
      }

      @Injectable()
      class B {
        a: unknown = inject(A)
      }

      expectCycle(await settle(container.get(A)), 'A -> B -> A')
      awaitInInit = false
      const a = await container.get(A)
      expect((await a.b).a).toBe(a)
    })

    it('still resolves when onServiceInit awaits a dependency without a cycle', async () => {
      @Injectable()
      class B implements OnServiceInit {
        ready = false

        async onServiceInit() {
          await tick(2)
          this.ready = true
        }
      }

      @Injectable()
      class A implements OnServiceInit {
        b = asyncInject(B)
        seen = false

        async onServiceInit() {
          this.seen = (await this.b).ready
        }
      }

      expect((await container.get(A)).seen).toBe(true)
    })

    it('does not treat a then() attached in the constructor as a wait', async () => {
      @Injectable()
      class A {
        b: B | null = null

        constructor() {
          void asyncInject(B).then((b) => {
            this.b = b
          })
        }
      }

      @Injectable()
      class B {
        a: A = inject(A)
      }

      const a = await container.get(A)
      const b = await container.get(B)
      await tick()
      expect(a.b).toBe(b)
      expect(b.a).toBe(a)
    })
  })

  it('returns null from optional() only when nothing provides the token', async () => {
    const Missing = InjectionToken.create<{ x: number }>('Missing')

    @Injectable()
    class Broken {
      constructor() {
        throw new Error('bug in constructor')
      }
    }

    @Injectable()
    class UsesMissing {
      dep = optional(Missing)
    }

    @Injectable()
    class UsesBroken {
      dep = optional(Broken)
    }

    expect((await container.get(UsesMissing)).dep).toBeNull()
    const error = await container.get(UsesBroken).catch((e) => e)
    expect(error).toBeInstanceOf(DIError)
    expect(error.message).toContain('bug in constructor')
  })

  it.each([0, '', false, null])('injects the falsy value %j as itself', async (value) => {
    const Token = InjectionToken.create<unknown>('Falsy')
    container.addInstance(Token, value)

    @Injectable({ scope: InjectableScope.Transient })
    class Service {
      value = inject(Token)
    }

    expect((await container.get(Service)).value).toBe(value)
    expect(await container.get(Token)).toBe(value)
  })

  it('builds one instance for concurrent get() calls', async () => {
    let inits = 0

    @Injectable()
    class Slow implements OnServiceInit {
      async onServiceInit() {
        inits++
        await tick()
      }
    }

    const [a, b, c] = await Promise.all([
      container.get(Slow),
      container.get(Slow),
      container.get(Slow),
    ])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(inits).toBe(1)
  })

  it('retries after a constructor throws', async () => {
    let attempts = 0

    @Injectable()
    class Flaky {
      constructor() {
        attempts++
        if (attempts === 1) {
          throw new Error('first attempt fails')
        }
      }
    }

    const error = await container.get(Flaky).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.InitializationError)
    expect(error.cause).toBeInstanceOf(Error)
    expect(container.tryGetSync(Flaky)).toBeNull()
    expect(await container.get(Flaky)).toBeInstanceOf(Flaky)
    expect(attempts).toBe(2)
  })

  it('retries after an async initialiser rejects', async () => {
    let attempts = 0

    @Injectable()
    class Flaky implements OnServiceInit {
      async onServiceInit() {
        attempts++
        await tick()
        if (attempts === 1) {
          throw new Error('init failed')
        }
      }
    }

    await expect(container.get(Flaky)).rejects.toThrow('init failed')
    expect(await container.get(Flaky)).toBeInstanceOf(Flaky)
  })

  it('resolves a factory token once per container', async () => {
    const schema = z.object({ n: z.number() })
    const Config = InjectionToken.create<{ n: number }, typeof schema>('Config', schema)

    @Injectable({ token: Config })
    class ConfigImpl {
      n: number
      constructor(args: z.output<typeof schema>) {
        this.n = args.n
      }
    }
    void ConfigImpl

    let calls = 0
    const FromFactory = InjectionToken.factory(Config, async () => ({ n: ++calls }))

    expect((await container.get(FromFactory)).n).toBe(1)
    expect((await container.get(FromFactory)).n).toBe(1)

    const other = new Container()
    expect((await other.get(FromFactory)).n).toBe(2)
    expect(calls).toBe(2)
    await other.dispose()
  })

  it('distinguishes instances by nested args and ignores key order', async () => {
    const schema = z.object({ nested: z.object({ x: z.number(), y: z.number() }) })

    @Injectable({ schema })
    class WithArgs {
      constructor(public readonly args: z.output<typeof schema>) {}
    }

    const a = await container.get(WithArgs, { nested: { x: 1, y: 2 } })
    const b = await container.get(WithArgs, { nested: { x: 2, y: 2 } })
    const c = await container.get(WithArgs, { nested: { y: 2, x: 1 } })
    expect(a).not.toBe(b)
    expect(a).toBe(c)
  })

  it('rejects invalid args with TokenValidationError', async () => {
    const schema = z.object({ n: z.number() })

    @Injectable({ schema })
    class WithArgs {
      constructor(public readonly args: z.output<typeof schema>) {}
    }

    // @ts-expect-error wrong args on purpose
    const error = await container.get(WithArgs, { n: 'nope' }).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.TokenValidationError)
  })

  it('wraps instances with decorate() before anyone observes them', async () => {
    @Injectable()
    class Greeter {
      greet() {
        return 'hi'
      }
    }

    @Injectable()
    class Uses {
      greeter = inject(Greeter)
    }

    container.decorate(Greeter, (instance) => {
      const wrapped = Object.create(instance) as Greeter
      wrapped.greet = () => `${instance.greet()}!`
      return wrapped
    })

    expect((await container.get(Uses)).greeter.greet()).toBe('hi!')
    expect((await container.get(Greeter)).greet()).toBe('hi!')
  })

  it('uses provide() over the default provider', async () => {
    @Injectable()
    class Mailer {
      send() {
        return 'smtp'
      }
    }

    @Injectable()
    class FakeMailer {
      send() {
        return 'fake'
      }
    }

    const Clock = InjectionToken.create<() => number>('Clock')

    const local = new Container({
      providers: [provide(Mailer, FakeMailer), provide(Clock, { value: () => 42 })],
    })

    @Injectable()
    class Uses {
      mailer = inject(Mailer)
      clock = inject(Clock)
    }

    const uses = await local.get(Uses)
    expect(uses.mailer.send()).toBe('fake')
    expect(uses.clock()).toBe(42)
    expect((await container.get(Mailer)).send()).toBe('smtp')
    await local.dispose()
  })

  it('refuses provide() once the token is resolved', async () => {
    @Injectable()
    class Service {}

    @Injectable()
    class Other {}

    await container.get(Service)
    expect(() => container.provide(Service, Other)).toThrow(/already resolved/)
  })

  it('supports @Factory classes with a tracked ctx.inject', async () => {
    @Injectable()
    class Dep {
      value = 7
    }

    @Factory()
    class NumberFactory {
      dep = inject(Dep)
      async create(ctx?: FactoryContext) {
        const again = await ctx!.inject<Dep>(Dep)
        return { total: this.dep.value + again.value }
      }
    }

    expect(await container.get(NumberFactory)).toEqual({ total: 14 })
  })

  it('supports function providers', async () => {
    const Token = InjectionToken.create<{ id: number }>('Fn')
    let calls = 0
    const local = new Container({
      providers: [provide(Token, { factory: () => ({ id: ++calls }) })],
    })
    expect(await local.get(Token)).toEqual({ id: 1 })
    expect(local.getSync(Token)).toEqual({ id: 1 })
    await local.dispose()
  })

  it('injects the container itself', async () => {
    @Injectable()
    class Service {
      container = inject(Container)
    }

    expect((await container.get(Service)).container).toBe(container)
  })

  it('throws when inject() is used outside construction', () => {
    @Injectable()
    class Service {}

    expect(() => inject(Service)).toThrow(/outside of a injectable context/)
  })
})
