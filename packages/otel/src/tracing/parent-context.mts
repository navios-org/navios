import { currentContext } from '@navios/core'
import { context as otelContext, trace } from '@opentelemetry/api'

import type { Context } from '@opentelemetry/api'

import { RequestSpan } from './request-span.mjs'

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
