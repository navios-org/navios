import { createContextKey, currentContext } from '@navios/core'
import { context as otelContext, propagation, trace } from '@opentelemetry/api'

import type { Context, Span, TextMapGetter, TextMapSetter } from '@opentelemetry/api'

/**
 * The server span of the current request, stored on the request context by
 * the plugin's interceptor.
 *
 * ```ts
 * getUser = handler(getUser, ({ urlParams }, ctx) => {
 *   ctx.find(RequestSpan)?.setAttribute('user.id', urlParams.id)
 * })
 * ```
 *
 * Read it with `ctx.find()`: the key is not set for ignored routes or when
 * HTTP tracing is turned off.
 */
export const RequestSpan = createContextKey<Span>('OtelRequestSpan')

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
 * Adds the trace context of the current span to outgoing headers
 * (`traceparent`, `tracestate`, baggage) with the registered propagator, so
 * that the service they are sent to continues the trace. Returns `headers`.
 *
 * ```ts
 * await fetch('https://billing.internal/charge', {
 *   method: 'POST',
 *   headers: injectTraceContext({ 'content-type': 'application/json' }),
 *   body: JSON.stringify(body),
 * })
 * ```
 */
export function injectTraceContext<T extends Record<string, string>>(headers: T): T {
  propagation.inject(parentContext(), headers, headersSetter)
  return headers
}
