import { context as otelContext, propagation } from '@opentelemetry/api'

import type { Context, TextMapGetter } from '@opentelemetry/api'

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

/**
 * Extracts the trace context a request carries in its headers
 * (`traceparent`, `tracestate`, baggage) with the registered propagator.
 */
export function extractTraceContext(headers: HeaderCarrier): Context {
  return propagation.extract(otelContext.active(), headers, headersGetter)
}
