import { AsyncLocalStorage } from 'node:async_hooks'

import type { Baggage, Span } from '@opentelemetry/api'

/**
 * Context stored in AsyncLocalStorage for span propagation.
 */
export interface SpanContext {
  /**
   * The active span for the current execution context.
   */
  span: Span

  /**
   * Optional baggage for cross-process context propagation.
   */
  baggage?: Baggage
}

/**
 * AsyncLocalStorage instance for span context propagation.
 *
 * This store allows spans to be automatically propagated through
 * async operations without explicitly passing them through the call stack.
 */
let spanContextStore: AsyncLocalStorage<SpanContext> | null = null

/**
 * Gets or creates the span context store.
 * Lazily initialized to avoid overhead when not used.
 */
export function getSpanContextStore(): AsyncLocalStorage<SpanContext> {
  if (!spanContextStore) {
    spanContextStore = new AsyncLocalStorage<SpanContext>()
  }
  return spanContextStore
}

/**
 * Runs a function within a span context.
 *
 * @param context - The span context to set for the execution
 * @param fn - The function to execute
 * @returns The return value of the function
 *
 * @example
 * ```typescript
 * const span = tracer.startSpan('my-operation')
 * const result = runWithSpanContext({ span }, () => {
 *   // getCurrentSpanContext() returns { span } here
 *   return doWork()
 * })
 * span.end()
 * ```
 */
export function runWithSpanContext<T>(context: SpanContext, fn: () => T): T {
  return getSpanContextStore().run(context, fn)
}

/**
 * Gets the current span context from AsyncLocalStorage.
 *
 * @returns The current span context, or undefined if not in a span context
 */
export function getCurrentSpanContext(): SpanContext | undefined {
  return getSpanContextStore().getStore()
}

/**
 * Gets the current active span from AsyncLocalStorage.
 *
 * @returns The current span, or undefined if not in a span context
 */
export function getCurrentSpan(): Span | undefined {
  return getCurrentSpanContext()?.span
}
