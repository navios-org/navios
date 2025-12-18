/**
 * Cross-platform AsyncLocalStorage wrapper.
 *
 * Provides AsyncLocalStorage on Node.js/Bun and falls back to
 * a synchronous-only polyfill in browser environments.
 */

import { SyncLocalStorage } from './sync-local-storage.mjs'

/**
 * Interface matching the subset of AsyncLocalStorage API we use.
 */
export interface IAsyncLocalStorage<T> {
  run<R>(store: T, fn: () => R): R
  getStore(): T | undefined
}

/**
 * Detects if we're running in a Node.js-like environment with async_hooks support.
 */
function hasAsyncHooksSupport(): boolean {
  // Check for Node.js
  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node
  ) {
    return true
  }

  // Check for Bun
  if (typeof process !== 'undefined' && process.versions && 'bun' in process.versions) {
    return true
  }

  // Check for Deno (also supports async_hooks via node compat)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).Deno !== 'undefined') {
    return true
  }

  return false
}

// Cache for the AsyncLocalStorage class
let AsyncLocalStorageClass: (new <T>() => IAsyncLocalStorage<T>) | null = null
let initialized = false
let forceSyncMode = false

/**
 * Gets the appropriate AsyncLocalStorage implementation for the current environment.
 *
 * - On Node.js/Bun/Deno: Returns the native AsyncLocalStorage
 * - On browsers: Returns SyncLocalStorage polyfill
 */
function getAsyncLocalStorageClass(): new <T>() => IAsyncLocalStorage<T> {
  if (initialized) {
    return AsyncLocalStorageClass!
  }

  initialized = true

  if (!forceSyncMode && hasAsyncHooksSupport()) {
    try {
      // Dynamic require to avoid bundler issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const asyncHooks = require('node:async_hooks')
      AsyncLocalStorageClass = asyncHooks.AsyncLocalStorage
    } catch {
      // Fallback if require fails (shouldn't happen in Node/Bun)
      AsyncLocalStorageClass = SyncLocalStorage as any
    }
  } else {
    AsyncLocalStorageClass = SyncLocalStorage as any
  }

  return AsyncLocalStorageClass!
}

/**
 * Creates a new AsyncLocalStorage instance appropriate for the current environment.
 */
export function createAsyncLocalStorage<T>(): IAsyncLocalStorage<T> {
  const StorageClass = getAsyncLocalStorageClass()
  return new StorageClass<T>()
}

/**
 * Returns true if we're using the real AsyncLocalStorage (Node/Bun/Deno).
 * Returns false if we're using the sync-only polyfill (browser).
 */
export function isUsingNativeAsyncLocalStorage(): boolean {
  getAsyncLocalStorageClass() // Ensure initialized
  return AsyncLocalStorageClass !== (SyncLocalStorage as any)
}

/**
 * Testing utilities for forcing specific modes.
 * Only exported for testing purposes.
 */
export const __testing__ = {
  /**
   * Resets the initialization state and forces sync mode.
   * Call this before creating new storage instances in tests.
   */
  forceSyncMode: () => {
    initialized = false
    forceSyncMode = true
    AsyncLocalStorageClass = null
  },

  /**
   * Resets to default behavior (auto-detect environment).
   */
  reset: () => {
    initialized = false
    forceSyncMode = false
    AsyncLocalStorageClass = null
  },
}
