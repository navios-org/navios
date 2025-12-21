import { AsyncLocalStorage } from 'node:async_hooks'

let requestCounter = 0

/**
 * Generates a simple incremental request ID.
 * Much faster than crypto.randomUUID() and sufficient for request tracking.
 *
 * @returns A unique request ID string (e.g., "req-1", "req-2", ...)
 */
export function generateRequestId(): string {
  return `req-${++requestCounter}`
}

/**
 * AsyncLocalStorage store for the current request ID.
 *
 * This allows logging and other services to access the current request ID
 * without explicitly passing it through the call stack.
 *
 * @example
 * ```typescript
 * import { requestIdStore, runWithRequestId, getRequestId } from '@navios/core'
 *
 * // Run code with a request ID in context
 * runWithRequestId('req-123', () => {
 *   // Inside this callback, getRequestId() returns 'req-123'
 *   logger.log('Processing request') // Will include request ID if logger is configured
 * })
 *
 * // Get current request ID (returns undefined if not in a request context)
 * const currentId = getRequestId()
 * ```
 */
let requestIdStore: AsyncLocalStorage<string> | null = null

function getRequestIdStore(): AsyncLocalStorage<string> {
  if (!requestIdStore) {
    requestIdStore = new AsyncLocalStorage<string>()
  }
  return requestIdStore!
}
/**
 * Whether request ID propagation is enabled.
 * When disabled, runWithRequestId is a pass-through for better performance.
 */
let requestIdEnabled = false

/**
 * Enables or disables request ID propagation.
 * Called by NaviosFactory based on the enableRequestId option.
 *
 * @param enabled - Whether to enable request ID propagation
 */
export function setRequestIdEnabled(enabled: boolean): void {
  requestIdEnabled = enabled
}

/**
 * Runs a function with a request ID in the async local storage context.
 * If request ID propagation is disabled, the function is called directly
 * without AsyncLocalStorage overhead.
 *
 * @param requestId - The request ID to set for this context
 * @param fn - The function to run within this context
 * @returns The return value of the function
 */
export function runWithRequestId<R>(requestId: string, fn: () => R): R {
  if (!requestIdEnabled) {
    return fn()
  }
  return getRequestIdStore().run(requestId, fn)
}

/**
 * Gets the current request ID from the async local storage context.
 *
 * @returns The current request ID, or undefined if not in a request context
 */
export function getRequestId(): string | undefined {
  if (!requestIdEnabled) {
    return undefined
  }
  return getRequestIdStore().getStore()
}
