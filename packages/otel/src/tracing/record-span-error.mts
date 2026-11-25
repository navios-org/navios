import { SpanStatusCode } from '@opentelemetry/api'

import type { Span } from '@opentelemetry/api'

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
