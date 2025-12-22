import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Cross-platform AsyncLocalStorage switcher.
 *
 * Provides the appropriate implementation based on environment:
 * - Production: No-op implementation (circular detection disabled)
 * - Development: Native AsyncLocalStorage from node:async_hooks
 *
 * Browser environments use a separate entry point via package.json exports
 * that directly uses SyncLocalStorage.
 *
 * Uses lazy initialization to avoid import overhead until first use,
 * and works with both ESM and CJS builds.
 */

import type { IAsyncLocalStorage } from './async-local-storage.types.mjs'

export type { IAsyncLocalStorage }

const isProduction = process.env.NODE_ENV === 'production'

// Lazy-loaded module cache
let loadedModule: {
  createAsyncLocalStorage: <T>() => IAsyncLocalStorage<T>
  isUsingNativeAsyncLocalStorage: () => boolean
} | null = null

function getModule() {
  if (loadedModule) {
    return loadedModule
  }

  if (isProduction) {
    // In production, use the noop implementation
    // Inline to avoid any import overhead
    class NoopLocalStorage<T> implements IAsyncLocalStorage<T> {
      run<R>(_store: T, fn: () => R): R {
        return fn()
      }
      getStore(): T | undefined {
        return undefined
      }
    }

    loadedModule = {
      createAsyncLocalStorage: <T,>() => new NoopLocalStorage<T>(),
      isUsingNativeAsyncLocalStorage: () => false,
    }
  } else {
    // In development, use native AsyncLocalStorage

    loadedModule = {
      createAsyncLocalStorage: <T,>() => new AsyncLocalStorage<T>(),
      isUsingNativeAsyncLocalStorage: () => true,
    }
  }

  return loadedModule
}

export function createAsyncLocalStorage<T>(): IAsyncLocalStorage<T> {
  return getModule().createAsyncLocalStorage<T>()
}

export function isUsingNativeAsyncLocalStorage(): boolean {
  return getModule().isUsingNativeAsyncLocalStorage()
}

