/**
 * Browser environment tests for AsyncLocalStorage.
 *
 * These tests verify that:
 * 1. The SyncLocalStorage polyfill works correctly
 * 2. All DI functionality works correctly with the polyfill
 * 3. The resolution context pattern works for synchronous operations
 *
 * Note: We use __testing__.forceSyncMode() to simulate browser behavior
 * since happy-dom still runs on Node.js and has process.versions.node.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createAsyncLocalStorage,
  isUsingNativeAsyncLocalStorage,
  __testing__,
} from '../internal/context/async-local-storage.mjs'
import {
  getCurrentResolutionContext,
  withResolutionContext,
  withoutResolutionContext,
} from '../internal/context/resolution-context.mjs'
import type { InstanceHolder } from '../internal/holder/instance-holder.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import { InjectableScope } from '../enums/index.mjs'

// Force sync mode for all tests in this file to simulate browser behavior
beforeAll(() => {
  __testing__.forceSyncMode()
})

afterAll(() => {
  __testing__.reset()
})

// ============================================================================
// SECTION 1: Environment Detection
// ============================================================================

describe('Browser Environment Detection (forced sync mode)', () => {
  it('should use sync polyfill when forced', () => {
    // After forcing sync mode, native AsyncLocalStorage should not be used
    expect(isUsingNativeAsyncLocalStorage()).toBe(false)
  })

  it('should create a working storage instance', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()
    expect(storage).toBeDefined()
    expect(typeof storage.run).toBe('function')
    expect(typeof storage.getStore).toBe('function')
  })
})

// ============================================================================
// SECTION 2: SyncLocalStorage Behavior in Browser
// ============================================================================

describe('SyncLocalStorage in Browser', () => {
  it('should store and retrieve context synchronously', () => {
    const storage = createAsyncLocalStorage<{ name: string }>()

    expect(storage.getStore()).toBeUndefined()

    storage.run({ name: 'test' }, () => {
      expect(storage.getStore()?.name).toBe('test')
    })

    expect(storage.getStore()).toBeUndefined()
  })

  it('should handle nested contexts', () => {
    const storage = createAsyncLocalStorage<{ depth: number }>()

    storage.run({ depth: 1 }, () => {
      expect(storage.getStore()?.depth).toBe(1)

      storage.run({ depth: 2 }, () => {
        expect(storage.getStore()?.depth).toBe(2)

        storage.run({ depth: 3 }, () => {
          expect(storage.getStore()?.depth).toBe(3)
        })

        expect(storage.getStore()?.depth).toBe(2)
      })

      expect(storage.getStore()?.depth).toBe(1)
    })

    expect(storage.getStore()).toBeUndefined()
  })

  it('should restore context after exceptions', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()

    storage.run({ value: 1 }, () => {
      try {
        storage.run({ value: 2 }, () => {
          throw new Error('test error')
        })
      } catch {
        // Expected
      }

      // Should be back to outer context
      expect(storage.getStore()?.value).toBe(1)
    })
  })
})

// ============================================================================
// SECTION 3: Resolution Context Integration
// ============================================================================

describe('Resolution Context in Browser', () => {
  function createMockHolder(name: string): InstanceHolder {
    return {
      status: InstanceStatus.Creating,
      name,
      instance: null,
      creationPromise: null,
      destroyPromise: null,
      type: class {} as unknown as InstanceHolder['type'],
      scope: InjectableScope.Singleton,
      deps: new Set(),
      destroyListeners: [],
      createdAt: Date.now(),
      waitingFor: new Set(),
    }
  }

  it('should track resolution context correctly', () => {
    const holderA = createMockHolder('ServiceA')
    const getHolder = () => undefined

    expect(getCurrentResolutionContext()).toBeUndefined()

    withResolutionContext(holderA, getHolder, () => {
      const ctx = getCurrentResolutionContext()
      expect(ctx).toBeDefined()
      expect(ctx?.waiterHolder).toBe(holderA)
    })

    expect(getCurrentResolutionContext()).toBeUndefined()
  })

  it('should handle nested resolution contexts', () => {
    const holderA = createMockHolder('ServiceA')
    const holderB = createMockHolder('ServiceB')
    const getHolder = () => undefined

    withResolutionContext(holderA, getHolder, () => {
      expect(getCurrentResolutionContext()?.waiterHolder.name).toBe('ServiceA')

      withResolutionContext(holderB, getHolder, () => {
        expect(getCurrentResolutionContext()?.waiterHolder.name).toBe(
          'ServiceB',
        )
      })

      expect(getCurrentResolutionContext()?.waiterHolder.name).toBe('ServiceA')
    })
  })

  it('should clear context with withoutResolutionContext', () => {
    const holderA = createMockHolder('ServiceA')
    const getHolder = () => undefined

    withResolutionContext(holderA, getHolder, () => {
      expect(getCurrentResolutionContext()).toBeDefined()

      withoutResolutionContext(() => {
        expect(getCurrentResolutionContext()).toBeUndefined()
      })

      expect(getCurrentResolutionContext()).toBeDefined()
    })
  })
})

// ============================================================================
// SECTION 4: Async Limitations in Browser
// ============================================================================

describe('Async Limitations in Browser (expected behavior)', () => {
  it('should NOT propagate context across microtasks', async () => {
    const storage = createAsyncLocalStorage<{ value: number }>()

    let valueInMicrotask: number | undefined

    storage.run({ value: 42 }, () => {
      // Queue a microtask
      Promise.resolve().then(() => {
        // In browser with SyncLocalStorage, context is lost
        valueInMicrotask = storage.getStore()?.value
      })
    })

    // Wait for microtask to complete
    await Promise.resolve()
    await Promise.resolve()

    // Context should be undefined because SyncLocalStorage doesn't propagate
    expect(valueInMicrotask).toBeUndefined()
  })

  it('should NOT propagate context across setTimeout', async () => {
    const storage = createAsyncLocalStorage<{ value: number }>()

    const valuePromise = new Promise<number | undefined>((resolve) => {
      storage.run({ value: 42 }, () => {
        setTimeout(() => {
          resolve(storage.getStore()?.value)
        }, 0)
      })
    })

    const value = await valuePromise
    // Context should be undefined
    expect(value).toBeUndefined()
  })

  it('should still work for synchronous code in async functions', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()

    // This is the key behavior: even in browser, synchronous access works
    storage.run({ value: 42 }, () => {
      // Synchronous access within the run callback works
      expect(storage.getStore()?.value).toBe(42)

      // Nested synchronous calls work
      function nestedCall() {
        return storage.getStore()?.value
      }
      expect(nestedCall()).toBe(42)
    })
  })
})
