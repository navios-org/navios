import { Container, Injectable, InjectableScope } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ScopedContainer } from '@navios/di'

import {
  acquireScope,
  commitScope,
  createCommittedScope,
  disposeScope,
  retainContainer,
  sweepPendingScopes,
  trackSuspense,
} from '../pending-scopes.mjs'

describe('pending scopes', () => {
  let container: Container

  // A slice ends with the next microtask.
  const nextSlice = () => Promise.resolve()

  const isDisposed = (scope: ScopedContainer) => {
    try {
      scope.getSync(Container)
      return false
    } catch {
      return true
    }
  }

  /** Marks the scope the way a suspending child does. */
  const suspendIn = (scope: ScopedContainer) => {
    let settle: () => void = () => {}
    const promise = new Promise<void>((resolve) => {
      settle = resolve
    })
    trackSuspense(scope, promise)
    return async () => {
      settle()
      await promise
    }
  }

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('acquireScope', () => {
    it('stores the effective scope id and the metadata on a new scope', () => {
      const generated = acquireScope(container, { metadata: { user: 'ann' } }, 'generated')
      const named = acquireScope(container, { scopeId: 'named' }, 'ignored')

      expect(generated.getMetadata('scopeId')).toBe('generated')
      expect(generated.getMetadata('user')).toBe('ann')
      expect(named.getMetadata('scopeId')).toBe('named')
    })

    it('does not hand out a scope in which nothing suspended', async () => {
      const first = acquireScope(container, {}, 'a')
      await nextSlice()

      expect(acquireScope(container, {}, 'b')).not.toBe(first)
    })

    it('hands a suspended scope to a later attempt with the same metadata', async () => {
      const first = acquireScope(container, { metadata: { row: { id: 1 } } }, 'a')
      suspendIn(first)
      await nextSlice()

      const second = acquireScope(container, { metadata: { row: { id: 1 } } }, 'b')
      expect(second).toBe(first)
      expect(second.getMetadata('scopeId')).toBe('a')
    })

    it('keeps providers of one synchronous render apart', () => {
      const first = acquireScope(container, {}, 'a')
      suspendIn(first)

      expect(acquireScope(container, {}, 'b')).not.toBe(first)
    })

    it('recognises the same provider element within one synchronous stretch', () => {
      const props = {}
      const first = acquireScope(container, props, 'a')
      suspendIn(first)

      expect(acquireScope(container, props, 'b')).toBe(first)
    })

    it('does not mix up scope ids or metadata', async () => {
      const marker = new Map()
      const first = acquireScope(container, { scopeId: 'one', metadata: { marker } }, 'a')
      suspendIn(first)
      await nextSlice()

      expect(acquireScope(container, { scopeId: 'two', metadata: { marker } }, 'b')).not.toBe(first)
      expect(acquireScope(container, { metadata: { marker } }, 'c')).not.toBe(first)
      expect(
        acquireScope(container, { scopeId: 'one', metadata: { marker: new Map() } }, 'd'),
      ).not.toBe(first)
      expect(acquireScope(container, { scopeId: 'one', metadata: { marker } }, 'e')).toBe(first)
    })

    it('keeps the scopes of different containers apart', async () => {
      const other = new Container()
      const first = acquireScope(container, {}, 'a')
      suspendIn(first)
      await nextSlice()

      const second = acquireScope(other, {}, 'b')
      expect(second).not.toBe(first)
      expect(second.getParent()).toBe(other)
      await other.dispose()
    })
  })

  describe('commitScope', () => {
    it('gives the scope to the first provider that commits', async () => {
      const first = {}
      const second = {}
      const scope = acquireScope(container, {}, 'a')

      expect(commitScope(scope, first)).toBe('committed')
      // The same provider again: StrictMode runs the effect twice.
      expect(commitScope(scope, first)).toBe('committed')
      expect(commitScope(scope, second)).toBe('taken')
    })

    it('takes the scope out of reach of later attempts', async () => {
      const scope = acquireScope(container, {}, 'a')
      suspendIn(scope)
      commitScope(scope, {})
      await nextSlice()

      expect(acquireScope(container, {}, 'b')).not.toBe(scope)
    })

    it('reports a scope that was disposed before the commit', () => {
      const scope = acquireScope(container, {}, 'a')
      disposeScope(scope)

      expect(commitScope(scope, {})).toBe('disposed')
      expect(isDisposed(scope)).toBe(true)
    })

    it('creates a scope for a committed provider outside the pool', async () => {
      const owner = {}
      const scope = createCommittedScope(container, 'named', { user: 'ann' }, 'ignored', owner)
      suspendIn(scope)
      await nextSlice()

      expect(scope.getMetadata('scopeId')).toBe('named')
      expect(commitScope(scope, owner)).toBe('committed')
      expect(
        acquireScope(container, { scopeId: 'named', metadata: { user: 'ann' } }, 'b'),
      ).not.toBe(scope)
      for (let i = 0; i < 3; i++) {
        sweepPendingScopes(container)
        await nextSlice()
      }
      expect(isDisposed(scope)).toBe(false)
    })
  })

  describe('sweepPendingScopes', () => {
    it('disposes an idle pending scope on the second sweep', async () => {
      let destroyed = 0

      @Injectable({ scope: InjectableScope.Request })
      class Draft {
        onServiceDestroy() {
          destroyed++
        }
      }

      const scope = acquireScope(container, {}, 'a')
      await scope.get(Draft)

      sweepPendingScopes(container)
      expect(isDisposed(scope)).toBe(false)
      await nextSlice()

      sweepPendingScopes(container)
      expect(isDisposed(scope)).toBe(true)
      await nextSlice()
      expect(destroyed).toBe(1)
    })

    it('counts the sweeps of one synchronous stretch once', async () => {
      const scope = acquireScope(container, {}, 'a')
      await nextSlice()

      sweepPendingScopes(container)
      sweepPendingScopes(container)
      sweepPendingScopes(container)
      expect(isDisposed(scope)).toBe(false)
    })

    it('leaves a scope alone while a suspended child waits for it', async () => {
      const scope = acquireScope(container, {}, 'a')
      const settle = suspendIn(scope)

      for (let i = 0; i < 3; i++) {
        await nextSlice()
        sweepPendingScopes(container)
      }
      expect(isDisposed(scope)).toBe(false)

      await settle()
      await nextSlice()
      sweepPendingScopes(container)
      expect(isDisposed(scope)).toBe(false)
      await nextSlice()
      sweepPendingScopes(container)
      expect(isDisposed(scope)).toBe(true)
    })

    it('starts over when a render takes the scope again', async () => {
      const scope = acquireScope(container, {}, 'a')
      await suspendIn(scope)()
      await nextSlice()
      sweepPendingScopes(container)
      await nextSlice()

      expect(acquireScope(container, {}, 'b')).toBe(scope)
      await nextSlice()
      sweepPendingScopes(container)
      expect(isDisposed(scope)).toBe(false)
    })

    it('never touches a committed scope', async () => {
      const scope = acquireScope(container, {}, 'a')
      commitScope(scope, {})

      for (let i = 0; i < 3; i++) {
        await nextSlice()
        sweepPendingScopes(container)
      }
      expect(isDisposed(scope)).toBe(false)
    })
  })

  describe('retainContainer', () => {
    it('disposes every pending scope when the last provider is released', async () => {
      const releaseFirst = retainContainer(container)
      const releaseSecond = retainContainer(container)
      const pending = acquireScope(container, {}, 'a')
      const loading = acquireScope(container, {}, 'b')
      suspendIn(loading)
      const committed = acquireScope(container, {}, 'c')
      commitScope(committed, {})

      releaseFirst()
      await nextSlice()
      expect(isDisposed(pending)).toBe(false)

      releaseSecond()
      await nextSlice()
      expect(isDisposed(pending)).toBe(true)
      expect(isDisposed(loading)).toBe(true)
      expect(isDisposed(committed)).toBe(false)
    })

    it('keeps the scopes when a provider is retained again at once', async () => {
      const release = retainContainer(container)
      const pending = acquireScope(container, {}, 'a')

      // StrictMode: cleanup and setup in the same commit.
      release()
      const releaseAgain = retainContainer(container)
      await nextSlice()
      expect(isDisposed(pending)).toBe(false)

      releaseAgain()
      await nextSlice()
      expect(isDisposed(pending)).toBe(true)
    })
  })
})
