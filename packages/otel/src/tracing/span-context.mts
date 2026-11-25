import { currentContext } from '@navios/core'
import { context as otelContext, propagation, trace } from '@opentelemetry/api'

import type { Baggage, Span } from '@opentelemetry/api'

import { RequestSpan } from './request-span.mjs'

/**
 * A span and, optionally, the baggage that travels with it.
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
 * Runs a function with a span as the active OpenTelemetry span.
 *
 * This is `context.with()` from `@opentelemetry/api`. The span stays active
 * across `await` only when a context manager is registered, which the plugin
 * does by default.
 *
 * @example
 * ```typescript
 * const span = tracer.startSpan('my-operation')
 * const result = runWithSpanContext({ span }, () => {
 *   // getCurrentSpan() returns span here
 *   return doWork()
 * })
 * span.end()
 * ```
 */
export function runWithSpanContext<T>(spanContext: SpanContext, fn: () => T): T {
  let active = trace.setSpan(otelContext.active(), spanContext.span)
  if (spanContext.baggage) {
    active = propagation.setBaggage(active, spanContext.baggage)
  }
  return otelContext.with(active, fn)
}

/**
 * The active span.
 *
 * It is taken from the active OpenTelemetry context. When that holds no span
 * (no context manager is registered) and the application runs with
 * `asyncContext: true`, the request's server span is returned instead.
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getSpan(otelContext.active()) ?? currentContext()?.find(RequestSpan)
}

/**
 * The active span together with the active baggage, or `undefined` when no
 * span is active.
 */
export function getCurrentSpanContext(): SpanContext | undefined {
  const span = getCurrentSpan()
  if (!span) {
    return undefined
  }
  const baggage = propagation.getBaggage(otelContext.active())
  return baggage ? { span, baggage } : { span }
}
