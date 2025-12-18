import { AsyncLocalStorage } from 'node:async_hooks'

import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

/**
 * Resolution context tracks the current service being instantiated.
 * This is used for circular dependency detection - when a service is being
 * created and it requests another dependency, we need to know who the "waiter" is.
 */
export interface ResolutionContextData {
  /** The holder that is currently being instantiated */
  waiterHolder: ServiceLocatorInstanceHolder
  /** Function to get a holder by name (for cycle detection) */
  getHolder: (name: string) => ServiceLocatorInstanceHolder | undefined
}

/**
 * AsyncLocalStorage for tracking the current resolution context.
 * This allows us to track which service is being instantiated even across
 * async boundaries (like when inject() is called inside a constructor).
 */
export const resolutionContext = new AsyncLocalStorage<ResolutionContextData>()

/**
 * Runs a function within a resolution context.
 * The context tracks which holder is currently being instantiated,
 * allowing circular dependency detection to work correctly.
 *
 * @param waiterHolder The holder being instantiated
 * @param getHolder Function to retrieve holders by name
 * @param fn The function to run within the context
 */
export function withResolutionContext<T>(
  waiterHolder: ServiceLocatorInstanceHolder,
  getHolder: (name: string) => ServiceLocatorInstanceHolder | undefined,
  fn: () => T,
): T {
  return resolutionContext.run({ waiterHolder, getHolder }, fn)
}

/**
 * Gets the current resolution context, if any.
 * Returns undefined if we're not inside a resolution context
 * (e.g., when resolving a top-level service that has no parent).
 */
export function getCurrentResolutionContext(): ResolutionContextData | undefined {
  return resolutionContext.getStore()
}
