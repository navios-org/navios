import { registerInjectable } from '@navios/di'
import { context as otelContext, propagation, trace } from '@opentelemetry/api'

import type { Context, Span, TextMapGetter, TextMapSetter } from '@opentelemetry/api'

import { getCurrentSpan, getCurrentSpanContext, runWithSpanContext } from '../stores/index.mjs'

import type { SpanContext } from '../stores/index.mjs'

/**
 * Anything that can hand out a header by name: a plain record of headers, a
 * web `Headers` object, or `ctx.headers` of a request context.
 */
export type HeaderCarrier =
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null | undefined }

const headersGetter: TextMapGetter<HeaderCarrier> = {
  get(carrier, key) {
    if (typeof carrier.get === 'function') {
      return (carrier as { get(name: string): string | null | undefined }).get(key) ?? undefined
    }
    const value = (carrier as Record<string, string | string[] | undefined>)[key]
    return Array.isArray(value) ? value[0] : value
  },
  keys(carrier) {
    if (typeof carrier.get === 'function') {
      const iterable = carrier as unknown as { keys?: () => Iterable<string> }
      return typeof iterable.keys === 'function' ? [...iterable.keys()] : []
    }
    return Object.keys(carrier)
  },
}

const headersSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value
  },
}

/**
 * Extracts the trace context a request carries in its headers
 * (`traceparent`, `tracestate`, baggage) with the registered propagator.
 */
export function extractTraceContext(headers: HeaderCarrier): Context {
  return propagation.extract(otelContext.active(), headers, headersGetter)
}

/**
 * Service for managing trace context propagation.
 *
 * - Running code with a span as the active span
 * - Extracting trace context from incoming HTTP headers
 * - Injecting trace context into outgoing HTTP headers
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { TraceContextService } from '@navios/otel'
 *
 * @Injectable()
 * class BillingClient {
 *   private readonly traceContext = inject(TraceContextService)
 *
 *   async charge(body: unknown) {
 *     const headers: Record<string, string> = { 'content-type': 'application/json' }
 *     // Adds traceparent, so the billing service continues this trace.
 *     this.traceContext.injectIntoHeaders(headers)
 *     return fetch('https://billing.internal/charge', {
 *       method: 'POST',
 *       headers,
 *       body: JSON.stringify(body),
 *     })
 *   }
 * }
 * ```
 */
export class TraceContextService {
  /**
   * Runs a function with a span as the active span.
   */
  runWithSpan<T>(span: Span, fn: () => T): T {
    return runWithSpanContext({ span }, fn)
  }

  /**
   * The active span, or `undefined` when there is none.
   */
  getCurrentSpan(): Span | undefined {
    return getCurrentSpan()
  }

  /**
   * The active span and baggage, or `undefined` when no span is active.
   */
  getCurrentSpanContext(): SpanContext | undefined {
    return getCurrentSpanContext()
  }

  /**
   * Extracts trace context from HTTP headers.
   *
   * Supports W3C Trace Context (`traceparent`, `tracestate`) and whatever
   * other formats the registered propagator understands.
   *
   * @param headers - A record of headers, a web `Headers` object or `ctx.headers`
   */
  extractFromHeaders(headers: HeaderCarrier): Context {
    return extractTraceContext(headers)
  }

  /**
   * Injects the active trace context into outgoing HTTP headers.
   */
  injectIntoHeaders(headers: Record<string, string>): void {
    const span = getCurrentSpan()
    const active = otelContext.active()
    propagation.inject(span ? trace.setSpan(active, span) : active, headers, headersSetter)
  }

  /**
   * Creates a context with a span set as active.
   *
   * @param span - The span to set in the context
   * @param parent - Optional parent context (defaults to the active context)
   */
  createContextWithSpan(span: Span, parent?: Context): Context {
    return trace.setSpan(parent ?? otelContext.active(), span)
  }
}

registerInjectable(TraceContextService)
