import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Container, inject, Injectable, InjectableScope, InjectionToken } from '../index.mjs'
import { disposeScope } from '../internal/index.mjs'

import type { OnServiceDestroy } from '../index.mjs'

const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// A scope per request: what it links to in the root container, how it is torn
// down, and what it allocates for that, must not outlive it.
describe('scopes created and disposed per request', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('links to singletons', () => {
    it('destroys the dependents in open scopes when a singleton is invalidated, and none of disposed ones', async () => {
      const destroyed: string[] = []

      @Injectable()
      class Shared {}

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest implements OnServiceDestroy {
        readonly shared = inject(Shared)
        name = ''
        onServiceDestroy() {
          destroyed.push(this.name)
        }
      }

      const scopes = Array.from({ length: 5 }, () => container.createScope())
      for (const [index, scope] of scopes.entries()) {
        scope.getSync(PerRequest).name = `scope ${index}`
      }
      await scopes[1].dispose()
      await scopes[3].dispose()
      expect(destroyed).toEqual(['scope 1', 'scope 3'])

      await container.invalidate(container.getSync(Shared))

      expect(destroyed.slice(2).sort()).toEqual(['scope 0', 'scope 2', 'scope 4'])
      for (const scope of scopes) {
        await scope.dispose()
      }
      expect(destroyed).toHaveLength(5)
    })

    it('destroys a dependent that injected the same singleton twice once', async () => {
      let destroyed = 0

      @Injectable()
      class Shared {}

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest implements OnServiceDestroy {
        readonly first = inject(Shared)
        readonly second = inject(Shared)
        onServiceDestroy() {
          destroyed++
        }
      }

      const scope = container.createScope()
      const service = scope.getSync(PerRequest)
      expect(service.first).toBe(service.second)

      await container.invalidate(service.first)
      expect(destroyed).toBe(1)
      await scope.dispose()
      expect(destroyed).toBe(1)
    })

    it('destroys the dependents of a singleton in the order they injected it, in the root and in scopes alike', async () => {
      const destroyed: string[] = []
      const notified: string[] = []

      @Injectable()
      class Shared {}

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest implements OnServiceDestroy {
        readonly shared = inject(Shared)
        name = ''
        onServiceDestroy() {
          destroyed.push(this.name)
        }
      }

      @Injectable()
      class RootDependent implements OnServiceDestroy {
        readonly shared = inject(Shared)
        onServiceDestroy() {
          destroyed.push('root')
        }
      }

      const open = (name: string) => {
        const scope = container.createScope()
        scope.getSync(PerRequest).name = name
        scope.onInvalidate(PerRequest, undefined, () => notified.push(name))
        return scope
      }
      const a = open('a')
      container.getSync(RootDependent)
      const b = open('b')
      const c = open('c')

      await container.invalidate(container.getSync(Shared))

      expect(destroyed).toEqual(['a', 'root', 'b', 'c'])
      expect(notified).toEqual(['a', 'b', 'c'])
      await Promise.all([a.dispose(), b.dispose(), c.dispose()])
    })

    it('reaches a dependent through a request-scoped service in between', async () => {
      const destroyed: string[] = []

      @Injectable()
      class Shared {}

      @Injectable({ scope: InjectableScope.Request })
      class Inner implements OnServiceDestroy {
        readonly shared = inject(Shared)
        onServiceDestroy() {
          destroyed.push('inner')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Outer implements OnServiceDestroy {
        readonly inner = inject(Inner)
        onServiceDestroy() {
          destroyed.push('outer')
        }
      }

      const scope = container.createScope()
      const first = scope.getSync(Outer)
      await container.invalidate(first.inner.shared)

      expect(destroyed).toEqual(['outer', 'inner'])
      const second = scope.getSync(Outer)
      expect(second).not.toBe(first)
      expect(second.inner.shared).not.toBe(first.inner.shared)
      await scope.dispose()
    })

    it('rebuilds a dependent whose singleton was invalidated in a scope that goes on', async () => {
      @Injectable()
      class Shared {}

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest {
        readonly shared = inject(Shared)
      }

      const scope = container.createScope()
      for (let i = 0; i < 3; i++) {
        const before = scope.getSync(PerRequest)
        await container.invalidate(before.shared)
        const after = scope.getSync(PerRequest)
        expect(after).not.toBe(before)
        expect(after.shared).toBe(container.getSync(Shared))
      }
      await scope.dispose()
    })
  })

  describe('disposal', () => {
    it('destroys in reverse creation order, also entries with args', async () => {
      const order: string[] = []
      const schema = z.object({ id: z.string() })
      const KEYED = InjectionToken.create<Keyed, typeof schema>('Keyed', {
        schema,
        scope: InjectableScope.Request,
      })

      @Injectable({ token: KEYED, scope: InjectableScope.Request })
      class Keyed implements OnServiceDestroy {
        constructor(private readonly args: z.output<typeof schema>) {}
        onServiceDestroy() {
          order.push(`keyed ${this.args.id}`)
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Plain implements OnServiceDestroy {
        onServiceDestroy() {
          order.push('plain')
        }
      }

      const scope = container.createScope()
      scope.getSync(KEYED, { id: 'a' })
      scope.getSync(Plain)
      scope.getSync(KEYED, { id: 'b' })
      await scope.dispose()

      expect(order).toEqual(['keyed b', 'plain', 'keyed a'])
    })

    it('says whether there is anything to wait for', async () => {
      let released = false

      @Injectable({ scope: InjectableScope.Request })
      class Sync implements OnServiceDestroy {
        onServiceDestroy() {}
      }

      @Injectable({ scope: InjectableScope.Request })
      class Async implements OnServiceDestroy {
        async onServiceDestroy() {
          await tick()
          released = true
        }
      }

      const plain = container.createScope()
      plain.getSync(Sync)
      expect(disposeScope(plain)).toBeUndefined()

      const empty = container.createScope()
      expect(disposeScope(empty)).toBeUndefined()

      const slow = container.createScope()
      slow.getSync(Async)
      const pending = disposeScope(slow)
      expect(pending).toBeInstanceOf(Promise)
      expect(released).toBe(false)
      await pending
      expect(released).toBe(true)
      // A second call waits for the same disposal.
      expect(disposeScope(slow)).toBe(pending)
    })
  })

  describe('invalidate(instance)', () => {
    it('finds instances made before and after the first lookup', async () => {
      const destroyed: string[] = []

      @Injectable({ scope: InjectableScope.Request })
      class First implements OnServiceDestroy {
        onServiceDestroy() {
          destroyed.push('first')
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class Second implements OnServiceDestroy {
        onServiceDestroy() {
          destroyed.push('second')
        }
      }

      const scope = container.createScope()
      const first = scope.getSync(First)
      await scope.invalidate(first)
      const second = scope.getSync(Second)
      const again = scope.getSync(First)
      await scope.invalidate(second)
      await scope.invalidate(again)
      // Gone already: nothing holds it.
      await scope.invalidate(first)

      expect(destroyed).toEqual(['first', 'second', 'first'])
      await scope.dispose()
    })

    it('finds an instance that two tokens hold', async () => {
      const ALIAS = InjectionToken.create<object>('alias', { scope: InjectableScope.Request })
      const OTHER = InjectionToken.create<object>('other', { scope: InjectableScope.Request })
      const value = {}

      const scope = container.createScope()
      scope.addInstance(ALIAS, value)
      scope.addInstance(OTHER, value)
      await scope.invalidate(value)

      expect(scope.peek(ALIAS)).toBeNull()
      expect(scope.peek(OTHER)).toBeNull()
      await scope.dispose()
    })
  })
})
