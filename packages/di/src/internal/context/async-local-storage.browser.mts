/**
 * Browser implementation using SyncLocalStorage.
 *
 * This module is used in browser environments where async_hooks is not available.
 * It provides synchronous-only context tracking which is sufficient for
 * browser-based DI resolution.
 */

import { SyncLocalStorage } from './sync-local-storage.mjs'

export type { IAsyncLocalStorage } from './async-local-storage.types.mjs'

export function createAsyncLocalStorage<T>() {
  return new SyncLocalStorage<T>()
}

export function isUsingNativeAsyncLocalStorage(): boolean {
  return false
}
