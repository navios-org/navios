/**
 * Tests for the cross-platform AsyncLocalStorage implementation.
 *
 * These tests verify:
 * 1. SyncLocalStorage polyfill works correctly for synchronous code
 * 2. The runtime detection correctly identifies the environment
 * 3. Both implementations provide consistent behavior for sync use cases
 */

import { describe, expect, it } from 'vitest'

import { SyncLocalStorage } from '../internal/context/sync-local-storage.mjs'
import {
  createAsyncLocalStorage,
  isUsingNativeAsyncLocalStorage,
} from '../internal/context/async-local-storage.mjs'

// ============================================================================
// SECTION 1: SyncLocalStorage Unit Tests
// ============================================================================

describe('SyncLocalStorage', () => {
  it('should return undefined when no context is active', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    expect(storage.getStore()).toBeUndefined()
  })

  it('should return the store within a run() call', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    storage.run(store, () => {
      expect(storage.getStore()).toBe(store)
    })
  })

  it('should return undefined after run() completes', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    storage.run(store, () => {
      // Inside context
    })

    expect(storage.getStore()).toBeUndefined()
  })

  it('should handle nested run() calls correctly', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const outer = { value: 1 }
    const inner = { value: 2 }

    storage.run(outer, () => {
      expect(storage.getStore()).toBe(outer)

      storage.run(inner, () => {
        expect(storage.getStore()).toBe(inner)
      })

      // After inner run completes, should be back to outer
      expect(storage.getStore()).toBe(outer)
    })

    // After all runs complete
    expect(storage.getStore()).toBeUndefined()
  })

  it('should handle deeply nested run() calls', () => {
    const storage = new SyncLocalStorage<{ depth: number }>()
    const stores = Array.from({ length: 5 }, (_, i) => ({ depth: i }))

    function nest(depth: number): void {
      if (depth >= stores.length) return

      storage.run(stores[depth], () => {
        expect(storage.getStore()).toBe(stores[depth])
        nest(depth + 1)
        expect(storage.getStore()).toBe(stores[depth])
      })
    }

    nest(0)
    expect(storage.getStore()).toBeUndefined()
  })

  it('should return the value from run()', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    const result = storage.run(store, () => {
      return 'hello'
    })

    expect(result).toBe('hello')
  })

  it('should propagate errors and still restore context', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    expect(() => {
      storage.run(store, () => {
        throw new Error('test error')
      })
    }).toThrow('test error')

    // Context should be restored even after error
    expect(storage.getStore()).toBeUndefined()
  })

  it('should restore context after error in nested run()', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const outer = { value: 1 }
    const inner = { value: 2 }

    storage.run(outer, () => {
      try {
        storage.run(inner, () => {
          throw new Error('inner error')
        })
      } catch {
        // Catch the error
      }

      // Should be back to outer context
      expect(storage.getStore()).toBe(outer)
    })
  })

  it('exit() should clear the context temporarily', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    storage.run(store, () => {
      expect(storage.getStore()).toBe(store)

      storage.exit(() => {
        expect(storage.getStore()).toBeUndefined()
      })

      // After exit, should be back to the original context
      expect(storage.getStore()).toBe(store)
    })
  })

  it('exit() should restore context after error', () => {
    const storage = new SyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    storage.run(store, () => {
      try {
        storage.exit(() => {
          throw new Error('exit error')
        })
      } catch {
        // Catch the error
      }

      // Context should be restored
      expect(storage.getStore()).toBe(store)
    })
  })
})

// ============================================================================
// SECTION 2: createAsyncLocalStorage Tests
// ============================================================================

describe('createAsyncLocalStorage', () => {
  it('should create a storage instance', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()
    expect(storage).toBeDefined()
    expect(typeof storage.run).toBe('function')
    expect(typeof storage.getStore).toBe('function')
  })

  it('should work with run() and getStore()', () => {
    const storage = createAsyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    storage.run(store, () => {
      expect(storage.getStore()).toBe(store)
    })

    expect(storage.getStore()).toBeUndefined()
  })

  it('should handle nested contexts', () => {
    const storage = createAsyncLocalStorage<{ name: string }>()

    storage.run({ name: 'outer' }, () => {
      expect(storage.getStore()?.name).toBe('outer')

      storage.run({ name: 'inner' }, () => {
        expect(storage.getStore()?.name).toBe('inner')
      })

      expect(storage.getStore()?.name).toBe('outer')
    })
  })
})

// ============================================================================
// SECTION 3: Environment Detection Tests
// ============================================================================

describe('isUsingNativeAsyncLocalStorage', () => {
  it('should return a boolean', () => {
    const result = isUsingNativeAsyncLocalStorage()
    expect(typeof result).toBe('boolean')
  })

  it('should return true in Node.js environment', () => {
    // Since we're running in Node.js (vitest), this should be true
    expect(isUsingNativeAsyncLocalStorage()).toBe(true)
  })
})

// ============================================================================
// SECTION 4: Integration with resolution context pattern
// ============================================================================

describe('Resolution Context Pattern', () => {
  interface ResolutionContextData {
    waiterName: string
    depth: number
  }

  it('should work with the resolution context pattern', () => {
    const resolutionContext = createAsyncLocalStorage<ResolutionContextData>()

    function withResolutionContext<T>(
      waiterName: string,
      depth: number,
      fn: () => T,
    ): T {
      return resolutionContext.run({ waiterName, depth }, fn)
    }

    function getCurrentContext(): ResolutionContextData | undefined {
      return resolutionContext.getStore()
    }

    // Simulate nested service resolution
    withResolutionContext('ServiceA', 0, () => {
      const ctxA = getCurrentContext()
      expect(ctxA?.waiterName).toBe('ServiceA')
      expect(ctxA?.depth).toBe(0)

      withResolutionContext('ServiceB', 1, () => {
        const ctxB = getCurrentContext()
        expect(ctxB?.waiterName).toBe('ServiceB')
        expect(ctxB?.depth).toBe(1)
      })

      // Back to ServiceA context
      const ctxAfter = getCurrentContext()
      expect(ctxAfter?.waiterName).toBe('ServiceA')
    })

    // Outside all contexts
    expect(getCurrentContext()).toBeUndefined()
  })

  it('should handle withoutResolutionContext pattern', () => {
    const resolutionContext = createAsyncLocalStorage<ResolutionContextData>()

    function withoutResolutionContext<T>(fn: () => T): T {
      return resolutionContext.run(undefined as any, fn)
    }

    resolutionContext.run({ waiterName: 'Service', depth: 0 }, () => {
      expect(resolutionContext.getStore()?.waiterName).toBe('Service')

      withoutResolutionContext(() => {
        // Context should be cleared (undefined-ish)
        const store = resolutionContext.getStore()
        expect(store === undefined || store === null).toBe(true)
      })

      // Context should be restored
      expect(resolutionContext.getStore()?.waiterName).toBe('Service')
    })
  })
})

// ============================================================================
// SECTION 5: Async behavior tests (Node.js native only)
// ============================================================================

describe('Async behavior (native AsyncLocalStorage)', () => {
  it('should propagate context through async/await in Node.js', async () => {
    // Skip if not using native (though in Node.js vitest, it should be native)
    if (!isUsingNativeAsyncLocalStorage()) {
      return
    }

    const storage = createAsyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    await storage.run(store, async () => {
      // Sync check
      expect(storage.getStore()).toBe(store)

      // After await
      await Promise.resolve()
      expect(storage.getStore()).toBe(store)

      // After setTimeout wrapped in promise
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(storage.getStore()).toBe(store)
    })
  })

  it('should propagate context through Promise.all in Node.js', async () => {
    if (!isUsingNativeAsyncLocalStorage()) {
      return
    }

    const storage = createAsyncLocalStorage<{ value: number }>()
    const store = { value: 42 }

    await storage.run(store, async () => {
      const results = await Promise.all([
        Promise.resolve().then(() => storage.getStore()?.value),
        Promise.resolve().then(() => storage.getStore()?.value),
        Promise.resolve().then(() => storage.getStore()?.value),
      ])

      expect(results).toEqual([42, 42, 42])
    })
  })
})
