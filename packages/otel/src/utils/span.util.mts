import { currentContext } from '@navios/core'
import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api'

import type { Context, Span } from '@opentelemetry/api'

import { RequestSpan } from '../stores/span-context.store.mjs'

/**
 * The context a new child span should be started in.
 *
 * It is the active OpenTelemetry context. When that holds no span, which is
 * the case without a context manager, the request's server span is used as
 * the parent if the application runs with `asyncContext: true`.
 */
export function parentContext(): Context {
  const active = otelContext.active()
  if (trace.getSpan(active) !== undefined) {
    return active
  }
  const requestSpan = currentContext()?.find(RequestSpan)
  return requestSpan ? trace.setSpan(active, requestSpan) : active
}

/**
 * Records an error on a span and marks the span as failed.
 */
export function recordSpanError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) })
  }
}
