/**
 * A synchronous-only polyfill for AsyncLocalStorage.
 *
 * This provides the same API as Node's AsyncLocalStorage but only works
 * for synchronous code paths. It uses a simple stack-based approach.
 *
 * Limitations:
 * - Context does NOT propagate across async boundaries (setTimeout, promises, etc.)
 * - Only suitable for environments where DI resolution is synchronous
 *
 * This is acceptable for browser environments where:
 * 1. Constructors are typically synchronous
 * 2. Circular dependency detection mainly needs sync tracking
 */
export class SyncLocalStorage<T> {
  private stack: T[] = []

  /**
   * Runs a function within the given store context.
   * The context is only available synchronously within the function.
   */
  run<R>(store: T, fn: () => R): R {
    this.stack.push(store)
    try {
      return fn()
    } finally {
      this.stack.pop()
    }
  }

  /**
   * Gets the current store value, or undefined if not in a context.
   */
  getStore(): T | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined
  }

  /**
   * Exits the current context and runs the function without any store.
   * This matches AsyncLocalStorage.exit() behavior.
   */
  exit<R>(fn: () => R): R {
    const savedStack = this.stack
    this.stack = []
    try {
      return fn()
    } finally {
      this.stack = savedStack
    }
  }
}
