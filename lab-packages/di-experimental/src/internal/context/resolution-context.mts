import type { InstanceHolder } from '../holder/instance-holder.mjs'
import type { IAsyncLocalStorage } from './async-local-storage.types.mjs'

import { createAsyncLocalStorage } from './async-local-storage.mjs'

/**
 * Data stored in the resolution context during service instantiation.
 */
export interface ResolutionContextData {
  /** The holder that is currently being instantiated */
  waiterHolder: InstanceHolder
  /** Function to get a holder by name (for cycle detection) */
  getHolder: (name: string) => InstanceHolder | undefined
}

/**
 * AsyncLocalStorage for tracking the current resolution context.
 *
 * This allows tracking which service is being instantiated even across
 * async boundaries (like when inject() is called inside a constructor).
 * Essential for circular dependency detection.
 *
 * The actual implementation varies by environment:
 * - Production: No-op (returns undefined, run() just calls fn directly)
 * - Development: Real AsyncLocalStorage with full async tracking
 * - Browser: SyncLocalStorage for synchronous-only tracking
 */
let resolutionContext: IAsyncLocalStorage<ResolutionContextData> | null = null

function getResolutionContext(): IAsyncLocalStorage<ResolutionContextData> {
  if (!resolutionContext) {
    resolutionContext = createAsyncLocalStorage<ResolutionContextData>()
  }
  return resolutionContext
}

/**
 * Runs a function within a resolution context.
 *
 * The context tracks which holder is currently being instantiated,
 * allowing circular dependency detection to work correctly.
 *
 * @param waiterHolder The holder being instantiated
 * @param getHolder Function to retrieve holders by name
 * @param fn The function to run within the context
 */
export function withResolutionContext<T>(
  waiterHolder: InstanceHolder,
  getHolder: (name: string) => InstanceHolder | undefined,
  fn: () => T,
): T {
  return getResolutionContext().run({ waiterHolder, getHolder }, fn)
}

/**
 * Gets the current resolution context, if any.
 *
 * Returns undefined if we're not inside a resolution context
 * (e.g., when resolving a top-level service that has no parent).
 */
export function getCurrentResolutionContext():
  | ResolutionContextData
  | undefined {
  return getResolutionContext().getStore()
}

/**
 * Runs a function outside any resolution context.
 *
 * This is useful for async injections that should not participate
 * in circular dependency detection since they don't block.
 *
 * @param fn The function to run without resolution context
 */
export function withoutResolutionContext<T>(fn: () => T): T {
  // Run with undefined context to clear any current context
  return getResolutionContext().run(
    undefined as unknown as ResolutionContextData,
    fn,
  )
}

