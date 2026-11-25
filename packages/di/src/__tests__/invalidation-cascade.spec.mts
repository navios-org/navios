import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Container, inject, Injectable, InjectableScope, InjectionToken } from '../index.mjs'

import type { OnServiceDestroy, OnServiceInit } from '../index.mjs'

const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('invalidation cascade', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('re-resolving from an onInvalidate listener', () => {
    it('constructs the dependent once when the dependency is destroyed synchronously', async () => {
      let constructed = 0

      @Injectable()
      class Dependency {}

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
      }

      const first = await container.get(Dependent)
      expect(constructed).toBe(1)

      let rebuilt: Promise<Dependent> | null = null
      container.onInvalidate(Dependent, undefined, () => {
        rebuilt = container.get(Dependent)
      })

      await container.invalidate(first.dependency)
      expect(rebuilt).not.toBeNull()
      const second = await rebuilt!

      expect(constructed).toBe(2)
      expect(second).not.toBe(first)
      expect(second.dependency).not.toBe(first.dependency)
      expect(second.dependency).toBeInstanceOf(Dependency)
    })

    it('constructs the dependent once when the dependency has an async onServiceDestroy', async () => {
      let constructed = 0

      @Injectable()
      class Dependency implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
        }
      }

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
      }

      const first = await container.get(Dependent)
      let rebuilt: Promise<Dependent> | null = null
      container.onInvalidate(Dependent, undefined, () => {
        rebuilt = container.get(Dependent)
      })

      await container.invalidate(first.dependency)
      const second = await rebuilt!

      expect(constructed).toBe(2)
      expect(second.dependency).not.toBe(first.dependency)
      expect(second.dependency).toBeInstanceOf(Dependency)
    })

    it('discards one pass when the dependency also initialises asynchronously', async () => {
      let constructed = 0

      @Injectable()
      class Dependency implements OnServiceInit, OnServiceDestroy {
        async onServiceInit() {
          await tick(1)
        }
        async onServiceDestroy() {
          await tick(1)
        }
      }

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
      }

      const first = await container.get(Dependent)
      constructed = 0

      let rebuilt: Promise<Dependent> | null = null
      container.onInvalidate(Dependent, undefined, () => {
        rebuilt ??= container.get(Dependent)
      })
      await container.invalidate(first.dependency)
      await rebuilt!

      expect(constructed).toBe(2)
    })

    it('lets a listener resolve synchronously: the cascade has settled', async () => {
      let constructed = 0

      @Injectable()
      class Dependency {}

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
      }

      const first = await container.get(Dependent)
      let second: Dependent | null = null
      container.onInvalidate(Dependent, undefined, () => {
        second = container.getSync(Dependent)
      })

      await container.invalidate(first.dependency)

      expect(second).not.toBeNull()
      expect(second).not.toBe(first)
      expect(constructed).toBe(2)
    })

    it('constructs every service of a chain once', async () => {
      const constructed = { middle: 0, top: 0 }

      @Injectable()
      class Bottom implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
        }
      }

      @Injectable()
      class Middle {
        bottom = inject(Bottom)
        constructor() {
          constructed.middle++
        }
      }

      @Injectable()
      class Top {
        middle = inject(Middle)
        constructor() {
          constructed.top++
        }
      }

      const first = await container.get(Top)
      const pending: Promise<unknown>[] = []
      container.onInvalidate(Top, undefined, () => {
        pending.push(container.get(Top))
      })
      container.onInvalidate(Middle, undefined, () => {
        pending.push(container.get(Middle))
      })

      await container.invalidate(first.middle.bottom)
      await Promise.all(pending)

      expect(pending).toHaveLength(2)
      expect(constructed).toEqual({ middle: 2, top: 2 })
    })
  })

  describe('listener timing', () => {
    it('notifies after every destroy hook of the cascade has finished', async () => {
      const order: string[] = []

      @Injectable()
      class Dependency implements OnServiceDestroy {
        async onServiceDestroy() {
          order.push('dependency: destroy start')
          await tick()
          order.push('dependency: destroy end')
        }
      }

      @Injectable()
      class Dependent implements OnServiceDestroy {
        dependency = inject(Dependency)
        onServiceDestroy() {
          order.push('dependent: destroy')
        }
      }

      const dependent = await container.get(Dependent)
      container.onInvalidate(Dependent, undefined, () => order.push('dependent: listener'))
      container.onInvalidate(Dependency, undefined, () => order.push('dependency: listener'))

      await container.invalidate(dependent.dependency).then(() => order.push('invalidate resolved'))

      expect(order).toEqual([
        'dependent: destroy',
        'dependency: destroy start',
        'dependency: destroy end',
        'dependent: listener',
        'dependency: listener',
        'invalidate resolved',
      ])
    })

    it('runs the remaining listeners when one throws', async () => {
      @Injectable()
      class Dependency {}

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
      }

      const dependent = await container.get(Dependent)
      let second = 0
      let third = 0
      const stop = container.onInvalidate(Dependent, undefined, () => {
        throw new Error('listener failed')
      })
      container.onInvalidate(Dependent, undefined, () => second++)
      container.onInvalidate(Dependency, undefined, () => third++)

      await expect(container.invalidate(dependent.dependency)).rejects.toThrow('listener failed')
      stop()

      expect(second).toBe(1)
      expect(third).toBe(1)
      // The teardown itself is complete: nothing is left half-destroyed.
      expect(container.peek(Dependent)).toBeNull()
      expect(container.peek(Dependency)).toBeNull()
      const again = await container.get(Dependent)
      expect(again).not.toBe(dependent)
    })
  })

  describe('resolving while the cascade is running', () => {
    it('waits for a dependency that is being destroyed before constructing', async () => {
      let constructed = 0
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })

      @Injectable()
      class Dependency implements OnServiceDestroy {
        onServiceDestroy() {
          return gate
        }
      }

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
      }

      const first = await container.get(Dependent)
      const invalidated = container.invalidate(first.dependency)
      // The dependent is gone, the dependency is still in its destroy hook.
      const rebuilt = container.get(Dependent)
      await tick()
      const whileDestroying = constructed

      release()
      await invalidated
      const second = await rebuilt

      expect(whileDestroying).toBe(1)
      expect(constructed).toBe(2)
      expect(second.dependency).not.toBe(first.dependency)
    })

    it('waits when the destroying dependency is further down the chain', async () => {
      const constructed = { middle: 0, top: 0 }
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })

      @Injectable()
      class Bottom implements OnServiceDestroy {
        onServiceDestroy() {
          return gate
        }
      }

      @Injectable()
      class Middle {
        bottom = inject(Bottom)
        constructor() {
          constructed.middle++
        }
      }

      @Injectable()
      class Top {
        middle = inject(Middle)
        constructor() {
          constructed.top++
        }
      }

      const first = await container.get(Top)
      const invalidated = container.invalidate(first.middle.bottom)
      const rebuilt = container.get(Top)
      await tick()
      release()
      await invalidated
      await rebuilt

      expect(constructed).toEqual({ middle: 2, top: 2 })
    })

    it('constructs once when resolved from a destroy hook of the same cascade', async () => {
      let constructed = 0
      let rebuilt: Promise<unknown> | null = null

      @Injectable()
      class Dependency implements OnServiceDestroy {
        onServiceDestroy() {
          // Runs synchronously inside the cascade, after Dependent is gone.
          rebuilt ??= container.get(Dependent)
        }
      }

      @Injectable()
      class Dependent {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
      }

      const first = await container.get(Dependent)
      await container.invalidate(first.dependency)
      await rebuilt

      expect(constructed).toBe(2)
    })
  })

  describe('scopes', () => {
    describe('building while something out of reach is being destroyed', () => {
      /**
       * A request-scoped service with a dependency resolved by args, and how
       * often the schema of those args has run. Looking for dependencies that
       * are being destroyed runs it once more per build.
       */
      function declare() {
        let validations = 0
        const schema = z.object({ id: z.string().refine(() => ++validations > 0) })
        const Token = InjectionToken.create<{ id: string }, typeof schema>('Keyed', schema)

        @Injectable({ token: Token })
        class Keyed {
          readonly id = 'x'
        }
        void Keyed

        @Injectable({ scope: InjectableScope.Request })
        class Service {
          readonly keyed = inject(Token, { id: 'a' })
        }

        @Injectable({ scope: InjectableScope.Request })
        class Slow {
          onServiceDestroy() {
            return new Promise<void>((resolve) => {
              release = resolve
            })
          }
        }

        let release: () => void = () => {}
        const build = async (from: Container) => {
          const scope = from.createScope()
          scope.getSync(Service)
          const before = validations
          await scope.dispose()
          const next = from.createScope()
          next.getSync(Service)
          const count = validations - before
          await next.dispose()
          return count
        }
        return { Slow, build, finish: () => release() }
      }

      it('does not look at it when it belongs to another scope', async () => {
        const { Slow, build, finish } = declare()
        const idle = await build(container)

        const other = container.createScope()
        other.getSync(Slow)
        const disposed = other.dispose()
        const busy = await build(container)
        finish()
        await disposed

        expect(busy).toBe(idle)
      })

      it('does not look at it when it belongs to another container', async () => {
        const { Slow, build, finish } = declare()
        const idle = await build(container)

        const unrelated = new Container()
        const other = unrelated.createScope()
        other.getSync(Slow)
        const disposed = other.dispose()
        const busy = await build(container)
        finish()
        await disposed
        await unrelated.dispose()

        expect(busy).toBe(idle)
      })
    })

    it('waits in a scope for a singleton that is being destroyed', async () => {
      let constructed = 0

      @Injectable()
      class Shared implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest {
        shared = inject(Shared)
        constructor() {
          constructed++
        }
      }

      const earlier = container.createScope()
      const { shared } = await earlier.get(PerRequest)
      await earlier.dispose()
      constructed = 0

      const invalidated = container.invalidate(shared)
      const scope = container.createScope()
      const service = await scope.get(PerRequest)
      await invalidated

      expect(constructed).toBe(1)
      expect(service.shared).not.toBe(shared)
      await scope.dispose()
    })

    it('constructs a request-scoped dependent once when a singleton is invalidated', async () => {
      let constructed = 0

      @Injectable()
      class Shared implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest {
        shared = inject(Shared)
        constructor() {
          constructed++
        }
      }

      const scope = container.createScope()
      const first = await scope.get(PerRequest)
      let rebuilt: Promise<PerRequest> | null = null
      const stop = scope.onInvalidate(PerRequest, undefined, () => {
        rebuilt = scope.get(PerRequest)
      })

      await container.invalidate(first.shared)
      const second = await rebuilt!
      stop()

      expect(constructed).toBe(2)
      expect(second).not.toBe(first)
      expect(second.shared).not.toBe(first.shared)
      await scope.dispose()
    })

    it('constructs once for a synchronous cascade inside a scope', async () => {
      let constructed = 0

      @Injectable({ scope: InjectableScope.Request })
      class Session {}

      @Injectable({ scope: InjectableScope.Request })
      class Cart {
        session = inject(Session)
        constructor() {
          constructed++
        }
      }

      const scope = container.createScope()
      const first = await scope.get(Cart)
      let second: Cart | null = null
      const stop = scope.onInvalidate(Cart, undefined, () => {
        second = scope.getSync(Cart)
      })

      await scope.invalidate(first.session)
      stop()

      expect(constructed).toBe(2)
      expect(second).not.toBe(first)
      await scope.dispose()
    })

    it('notifies scope listeners once the scope is fully disposed', async () => {
      const order: string[] = []

      @Injectable({ scope: InjectableScope.Request })
      class Session implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
          order.push('session: destroyed')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Cart {
        session = inject(Session)
      }

      const scope = container.createScope()
      await scope.get(Cart)
      let failure: unknown = null
      scope.onInvalidate(Cart, undefined, () => {
        order.push('cart: listener')
        scope.get(Cart).catch((error) => {
          failure = error
        })
      })

      await scope.dispose()
      await tick()

      expect(order).toEqual(['session: destroyed', 'cart: listener'])
      expect(failure).toMatchObject({ code: 'ContainerDisposed' })
    })
  })

  describe('dispose', () => {
    it('rejects, instead of throwing, when a scope listener throws', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Session {}

      const scope = container.createScope()
      await scope.get(Session)
      scope.onInvalidate(Session, undefined, () => {
        throw new Error('listener failed')
      })

      let disposed: Promise<void> | null = null
      expect(() => {
        disposed = scope.dispose()
      }).not.toThrow()
      await expect(disposed).rejects.toThrow('listener failed')
      expect(scope.peek(Session)).toBeNull()
    })

    it('notifies once per instance, after everything is destroyed', async () => {
      const order: string[] = []
      let constructed = 0

      @Injectable()
      class Dependency implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
          order.push('dependency: destroyed')
        }
      }

      @Injectable()
      class Dependent implements OnServiceDestroy {
        dependency = inject(Dependency)
        constructor() {
          constructed++
        }
        onServiceDestroy() {
          order.push('dependent: destroyed')
        }
      }

      const local = new Container()
      await local.get(Dependent)
      let rebuilt: Promise<unknown> | null = null
      local.onInvalidate(Dependent, undefined, () => {
        order.push('dependent: listener')
        rebuilt ??= local.get(Dependent).catch((error) => error.code)
      })

      await local.dispose()

      expect(order).toEqual([
        'dependent: destroyed',
        'dependency: destroyed',
        'dependent: listener',
      ])
      // A disposed container builds nothing more.
      expect(await rebuilt).toBe('ContainerDisposed')
      expect(constructed).toBe(1)
    })
  })
})
