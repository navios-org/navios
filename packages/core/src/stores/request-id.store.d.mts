import { AsyncLocalStorage } from 'node:async_hooks';
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
export declare const requestIdStore: AsyncLocalStorage<string>;
/**
 * Runs a function with a request ID in the async local storage context.
 *
 * @param requestId - The request ID to set for this context
 * @param fn - The function to run within this context
 * @returns The return value of the function
 */
export declare function runWithRequestId<R>(requestId: string, fn: () => R): R;
/**
 * Gets the current request ID from the async local storage context.
 *
 * @returns The current request ID, or undefined if not in a request context
 */
export declare function getRequestId(): string | undefined;
//# sourceMappingURL=request-id.store.d.mts.map