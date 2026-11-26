import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  asyncInject,
  Container,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
} from '../index.mjs'

import type { OnServiceDestroy } from '../index.mjs'

describe('lifecycle', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('runs onServiceDestroy on dispose in reverse creation order', async () => {
    const order: string[] = []

    @Injectable()
    class First implements OnServiceDestroy {
      onServiceDestroy() {
        order.push('first')
      }
    }

    @Injectable()
    class Second implements OnServiceDestroy {
      first = inject(First)
      async onServiceDestroy() {
        await Promise.resolve()
        order.push('second')
      }
    }

    await container.get(Second)
    await container.dispose()
    expect(order).toEqual(['second', 'first'])
  })

  it('destroys dependents first when a service is invalidated', async () => {
    const order: string[] = []

    @Injectable()
    class Base implements OnServiceDestroy {
      onServiceDestroy() {
        order.push('base')
      }
    }

    @Injectable()
    class Uses implements OnServiceDestroy {
      base = inject(Base)
      onServiceDestroy() {
        order.push('uses')
      }
    }

    const uses = await container.get(Uses)
    let notified = 0
    const stop = container.onInvalidate(Uses, undefined, () => notified++)

    await container.invalidate(uses.base)
    expect(order).toEqual(['uses', 'base'])
    expect(notified).toBe(1)

    const again = await container.get(Uses)
    expect(again).not.toBe(uses)
    expect(again.base).not.toBe(uses.base)

    stop()
    await container.invalidate(again)
    expect(notified).toBe(1)
  })

  it('invalidates through an asyncInject cycle without looping', async () => {
    @Injectable()
    class A {
      b = asyncInject(B)
    }

    @Injectable()
    class B {
      a = inject(A)
    }

    const a = await container.get(A)
    await a.b
    await container.invalidate(a)
    expect(container.peek(A)).toBeNull()
    expect(container.peek(B)).toBeNull()
  })

  it('fires onInvalidate only for the scope that owns the instance', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {}

    const a = container.createScope()
    const b = container.createScope()
    const fromA = await a.get(PerRequest)
    await b.get(PerRequest)

    let firedA = 0
    let firedB = 0
    a.onInvalidate(PerRequest, undefined, () => firedA++)
    b.onInvalidate(PerRequest, undefined, () => firedB++)

    await a.invalidate(fromA)
    expect(firedA).toBe(1)
    expect(firedB).toBe(0)
    await a.dispose()
    await b.dispose()
    expect(firedB).toBe(1)
  })

  it('fires a scope listener for a singleton owned by the root', async () => {
    @Injectable()
    class Shared {}

    const scope = container.createScope()
    const shared = await scope.get(Shared)
    let fired = 0
    scope.onInvalidate(Shared, undefined, () => fired++)
    await scope.invalidate(shared)
    expect(fired).toBe(1)
    await scope.dispose()
  })

  it('destroys transients together with the service that injected them', async () => {
    let destroyed = 0

    @Injectable({ scope: InjectableScope.Transient })
    class Transient implements OnServiceDestroy {
      onServiceDestroy() {
        destroyed++
      }
    }

    @Injectable()
    class Owner {
      a = inject(Transient)
      b = inject(Transient)
    }

    const owner = await container.get(Owner)
    await container.invalidate(owner)
    expect(destroyed).toBe(2)
  })

  it('destroys a transient resolved directly from a scope when the scope ends', async () => {
    let destroyed = 0

    @Injectable({ scope: InjectableScope.Transient })
    class Transient implements OnServiceDestroy {
      onServiceDestroy() {
        destroyed++
      }
    }

    const scope = container.createScope()
    await scope.get(Transient)
    scope.getSync(Transient)
    await scope.dispose()
    expect(destroyed).toBe(2)
  })

  it('does not accumulate dependents on a singleton across scopes', async () => {
    @Injectable()
    class Shared {}

    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {
      shared = inject(Shared)
    }

    await container.get(Shared)
    for (let i = 0; i < 10_000; i++) {
      const scope = container.createScope()
      scope.getSync(PerRequest)
      await scope.dispose()
    }
    const entry = (container as any).store.findByInstance(await container.get(Shared))
    expect(entry.dependents?.size ?? 0).toBe(0)
  })

  it('disposes a scope with no destroy hooks without awaiting anything', () => {
    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {}

    const scope = container.createScope()
    scope.getSync(PerRequest)
    void scope.dispose()
    expect(scope.peek(PerRequest)).toBeNull()
  })

  it('waits for services that are still initialising in ready()', async () => {
    let done = false

    @Injectable()
    class Slow {
      async onServiceInit() {
        await new Promise((resolve) => setTimeout(resolve, 5))
        done = true
      }
    }

    void container.get(Slow)
    await container.ready()
    expect(done).toBe(true)
  })

  it('waits in ready() for the cleanup of a build that failed', async () => {
    let released = false
    const TOKEN = InjectionToken.create<object>('failing')
    container.provide(TOKEN, {
      factory: (ctx) => {
        ctx.addDestroyListener(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          released = true
        })
        throw new Error('boom')
      },
    })

    await expect(container.get(TOKEN)).rejects.toThrow('boom')
    expect(released).toBe(false)
    await container.ready()
    expect(released).toBe(true)
  })

  it('keeps going when a destroy hook throws', async () => {
    let destroyed = 0

    @Injectable()
    class Bad implements OnServiceDestroy {
      onServiceDestroy() {
        throw new Error('boom')
      }
    }

    @Injectable()
    class Good implements OnServiceDestroy {
      onServiceDestroy() {
        destroyed++
      }
    }

    await container.get(Good)
    await container.get(Bad)
    await container.dispose()
    expect(destroyed).toBe(1)
  })
})

describe('lifecycle: ownership edge cases', () => {
  it('destroys a transient obtained with asyncInject together with its owner', async () => {
    let destroyed = 0

    @Injectable({ scope: InjectableScope.Transient })
    class Transient implements OnServiceDestroy {
      onServiceDestroy() {
        destroyed++
      }
    }

    @Injectable()
    class Owner {
      later = asyncInject(Transient)
    }

    const container = new Container()
    const owner = await container.get(Owner)
    await owner.later
    await container.invalidate(owner)
    expect(destroyed).toBe(1)
  })

  it('recomputes a factory token after a testing container is cleared', async () => {
    const { InjectionToken } = await import('../index.mjs')
    const { TestContainer } = await import('../testing/index.mjs')
    const { z } = await import('zod/v4')
    const schema = z.object({ n: z.number() })
    const Token = InjectionToken.create<{ n: number }, typeof schema>('Cfg', schema)

    @Injectable({ token: Token })
    class Impl {
      n: number
      constructor(args: { n: number }) {
        this.n = args.n
      }
    }
    void Impl

    let calls = 0
    const FromFactory = InjectionToken.factory(Token, () => ({ n: ++calls }))
    const container = new TestContainer()
    expect((await container.get(FromFactory)).n).toBe(1)
    await container.clear()
    expect((await container.get(FromFactory)).n).toBe(2)
    await container.dispose()
  })
})

describe('lifecycle: onInvalidate with bound and factory tokens', () => {
  it('fires for instances addressed through a bound or a factory token', async () => {
    const { InjectionToken } = await import('../index.mjs')
    const { z } = await import('zod/v4')
    const schema = z.object({ id: z.number() })
    const Token = InjectionToken.create<{ id: number }, typeof schema>('Thing', schema)

    @Injectable({ token: Token })
    class Impl {
      id: number
      constructor(args: { id: number }) {
        this.id = args.id
      }
    }
    void Impl

    const container = new Container()
    const Bound = InjectionToken.bound(Token, { id: 2 })
    const FromFactory = InjectionToken.factory(Token, () => ({ id: 1 }))

    let early = 0
    container.onInvalidate(FromFactory, undefined, () => early++)

    const viaFactory = await container.get(FromFactory)
    const viaBound = await container.get(Bound)

    let late = 0
    let bound = 0
    container.onInvalidate(FromFactory, undefined, () => late++)
    container.onInvalidate(Bound, undefined, () => bound++)

    await container.invalidate(viaFactory)
    expect(early).toBe(1)
    expect(late).toBe(1)
    expect(bound).toBe(0)

    await container.invalidate(viaBound)
    expect(bound).toBe(1)
    expect(late).toBe(1)
  })
})
