import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import {
  asyncInject,
  Container,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
} from '../index.mjs'

import type { OnServiceInit } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const failure = (promise: Promise<unknown>, ms = 200): Promise<any> =>
  Promise.race([
    promise.then(
      () => 'resolved',
      (error) => error,
    ),
    tick(ms).then(() => 'hang'),
  ])

describe('cycles', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('are reported between transients that use asyncInject on one side', async () => {
    let built = 0

    @Injectable({ scope: InjectableScope.Transient })
    class A {
      readonly b: Promise<unknown>

      constructor() {
        // Without the check this never ends, and starves the event loop.
        if (++built > 1000) {
          throw new Error('too many')
        }
        this.b = asyncInject(B)
      }
    }

    @Injectable({ scope: InjectableScope.Transient })
    class B {
      readonly a: unknown = inject(A)
    }

    const a = await container.get(A)
    const error = await failure(a.b)
    expect(error.code).toBe(DIErrorCode.CircularDependency)
    expect(error.context.cycle).toEqual(['A', 'B', 'A'])
    expect(built).toBe(1)
  })

  it('are reported between transients that use asyncInject on both sides', async () => {
    let built = 0

    @Injectable({ scope: InjectableScope.Transient })
    class A {
      readonly b: Promise<any>

      constructor() {
        if (++built > 1000) {
          throw new Error('too many')
        }
        this.b = asyncInject(B)
      }
    }

    @Injectable({ scope: InjectableScope.Transient })
    class B {
      readonly a: Promise<any> = asyncInject(A)
    }

    const a = await container.get(A)
    const b = await a.b
    const error = await failure(b.a)
    expect(error.code).toBe(DIErrorCode.CircularDependency)
    expect(error.context.cycle).toEqual(['A', 'B', 'A'])
    expect(built).toBe(1)
  })

  it('end at a stored service, which is built once', async () => {
    @Injectable({ scope: InjectableScope.Transient })
    class Helper {
      readonly service: Promise<any> = asyncInject(Service)
    }

    @Injectable()
    class Service {
      readonly helper = inject(Helper)
    }

    const helper = await container.get(Helper)
    const service = await helper.service
    expect(await service.helper.service).toBe(service)
  })

  it('are reported between transient factories that use ctx.inject()', async () => {
    const A = InjectionToken.create<unknown>('A')
    const B = InjectionToken.create<unknown>('B')
    container.provide(A, { scope: InjectableScope.Transient, factory: (ctx) => ctx.inject(B) })
    container.provide(B, { scope: InjectableScope.Transient, factory: (ctx) => ctx.inject(A) })

    const error = await failure(container.get(A))
    expect(error.code).toBe(DIErrorCode.CircularDependency)
    expect(error.context.cycle).toEqual(['A', 'B', 'A'])
  })

  it('are not seen in a product that injects its own token later', async () => {
    interface Node {
      child: () => Promise<Node>
    }
    const NODE = InjectionToken.create<Node>('Node')
    container.provide(NODE, {
      scope: InjectableScope.Transient,
      factory: (ctx) => ({ child: () => ctx.inject(NODE) }),
    })

    const node = await container.get(NODE)
    expect(await (await node.child()).child()).toHaveProperty('child')
  })

  it('are reported through the value of a factory token', async () => {
    const schema = z.object({ id: z.number() })
    const TOKEN = InjectionToken.create<object, typeof schema>('Token', schema)
    container.provide(TOKEN, { factory: () => ({}) })
    const COMPUTED = InjectionToken.factory(TOKEN, async (ctx) => {
      await ctx.inject(Service)
      return { id: 1 }
    })

    @Injectable()
    class Service {
      readonly value: unknown = inject(COMPUTED)
    }

    const error = await failure(container.get(Service))
    expect(error.code).toBe(DIErrorCode.CircularDependency)
    expect(error.context.cycle).toContain('Service')
    expect(error.context.cycle).toContain('Token')
  })

  it('are left to the caller when onServiceInit() uses container.get()', async () => {
    @Injectable()
    class A implements OnServiceInit {
      private readonly container = inject(Container)
      b: Promise<unknown> | null = null

      async onServiceInit() {
        // Not awaited, so there is no cycle: B waits for A, and A for nothing.
        this.b = this.container.get(B)
      }
    }

    @Injectable()
    class B {
      readonly a = inject(A)
    }

    const a = await container.get(A)
    expect(await a.b).toMatchObject({ a })
  })

  it('are no reason to build an asynchronous transient of asyncInject() twice', async () => {
    let built = 0

    @Injectable({ scope: InjectableScope.Transient })
    class Slow implements OnServiceInit {
      constructor() {
        built++
      }

      async onServiceInit() {
        await tick()
      }
    }

    @Injectable()
    class Service {
      readonly slow = asyncInject(Slow)
    }

    const service = await container.get(Service)
    expect(await service.slow).toBeInstanceOf(Slow)
    expect(built).toBe(1)
  })
})
