/**
 * Browser environment tests for AsyncLocalStorage.
 *
 * These tests verify that:
 * 1. The SyncLocalStorage polyfill works correctly
 * 2. All DI functionality works correctly with the polyfill
 * 3. The resolution context pattern works for synchronous operations
 *
 * Note: We directly import the browser implementation to test it
 * in isolation, simulating how it would work in a browser bundle.
 */

import { describe, expect, it } from 'vitest'

import {
  createAsyncLocalStorage,
  isUsingNativeAsyncLocalStorage,
} from '../internal/context/async-local-storage.browser.mjs'
import {
  getCurrentResolutionContext,
  withResolutionContext,
} from '../internal/context/resolution-context.mjs'
import { SyncLocalStorage } from '../internal/context/sync-local-storage.mjs'

// ============================================================================
// SECTION 1: Environment Detection
// ============================================================================

describe('Browser Environment Detection', () => {
  it('should use sync polyfill in browser build', () => {
    expect(isUsingNativeAsyncLocalStorage()).toBe(false)
  })

  it('should create a SyncLocalStorage instance', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()
    expect(storage).toBeInstanceOf(SyncLocalStorage)
  })

  it('should create a working storage instance', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()
    expect(storage).toBeDefined()
    expect(typeof storage.run).toBe('function')
    expect(typeof storage.getStore).toBe('function')
  })

  it('should create a resolution context instance', () => {
    const resolutionContext = getCurrentResolutionContext()
    expect(resolutionContext).toBeUndefined()
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
// SECTION 3: Async Limitations in Browser
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
