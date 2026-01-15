import type { Context, Span, TextMapGetter, TextMapSetter } from '@opentelemetry/api'

import { Injectable } from '@navios/di'
import {
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api'

import type { SpanContext } from '../stores/index.mjs'

import {
  getCurrentSpan,
  getCurrentSpanContext,
  runWithSpanContext,
} from '../stores/index.mjs'

/**
 * HTTP headers getter for context propagation.
 */
const httpHeadersGetter: TextMapGetter<Record<string, string | string[] | undefined>> = {
  get(carrier, key) {
    const value = carrier[key]
    if (Array.isArray(value)) {
      return value[0]
    }
    return value
  },
  keys(carrier) {
    return Object.keys(carrier)
  },
}

/**
 * HTTP headers setter for context propagation.
 */
const httpHeadersSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value
  },
}

/**
 * Service for managing trace context propagation.
 *
 * This service provides utilities for:
 * - Running code within a span context (AsyncLocalStorage)
 * - Extracting trace context from incoming HTTP headers
 * - Injecting trace context into outgoing HTTP headers
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { TraceContextService, TracerToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   private readonly traceContext = inject(TraceContextService)
 *   private readonly tracer = inject(TracerToken)
 *
 *   async handleRequest(headers: Record<string, string>) {
 *     // Extract parent context from incoming headers
 *     const parentContext = this.traceContext.extractFromHeaders(headers)
 *
 *     // Create a span with the parent context
 *     const span = this.tracer.startSpan('handle-request', {}, parentContext)
 *
 *     // Run code within the span context
 *     return this.traceContext.runWithSpan(span, async () => {
 *       // getCurrentSpan() returns this span here
 *       const result = await this.doWork()
 *
 *       // Inject context into outgoing headers
 *       const outgoingHeaders: Record<string, string> = {}
 *       this.traceContext.injectIntoHeaders(outgoingHeaders)
 *
 *       return result
 *     })
 *   }
 * }
 * ```
 */
@Injectable()
export class TraceContextService {

  /**
   * Runs a function within a span context.
   *
   * The span will be available via `getCurrentSpan()` within the function
   * and any nested async operations.
   *
   * @param span - The span to set as active
   * @param fn - The function to execute
   * @returns The return value of the function
   */
  runWithSpan<T>(span: Span, fn: () => T): T {
    return runWithSpanContext({ span }, fn)
  }

  /**
   * Gets the current active span from the execution context.
   *
   * @returns The current span, or undefined if not in a span context
   */
  getCurrentSpan(): Span | undefined {
    return getCurrentSpan()
  }

  /**
   * Gets the current span context from the execution context.
   *
   * @returns The current span context, or undefined if not in a span context
   */
  getCurrentSpanContext(): SpanContext | undefined {
    return getCurrentSpanContext()
  }

  /**
   * Extracts trace context from HTTP headers.
   *
   * Supports W3C Trace Context (traceparent, tracestate) and
   * other propagation formats configured in OpenTelemetry.
   *
   * @param headers - HTTP headers object
   * @returns OpenTelemetry Context with extracted trace info
   */
  extractFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Context {
    return propagation.extract(otelContext.active(), headers, httpHeadersGetter)
  }

  /**
   * Injects trace context into HTTP headers.
   *
   * Adds W3C Trace Context headers (traceparent, tracestate) and
   * other propagation headers configured in OpenTelemetry.
   *
   * @param headers - HTTP headers object to modify
   */
  injectIntoHeaders(headers: Record<string, string>): void {
    const currentSpan = this.getCurrentSpan()
    if (currentSpan) {
      const ctx = trace.setSpan(otelContext.active(), currentSpan)
      propagation.inject(ctx, headers, httpHeadersSetter)
    } else {
      propagation.inject(otelContext.active(), headers, httpHeadersSetter)
    }
  }

  /**
   * Creates a child context with a span set as active.
   *
   * Useful for creating nested spans with proper parent-child relationships.
   *
   * @param span - The span to set in the context
   * @param parentContext - Optional parent context (defaults to current context)
   * @returns A new context with the span set as active
   */
  createContextWithSpan(span: Span, parentContext?: Context): Context {
    const ctx = parentContext ?? otelContext.active()
    return trace.setSpan(ctx, span)
  }
}
