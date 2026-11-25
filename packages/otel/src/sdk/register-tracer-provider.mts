import { context as otelContext, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core'

import type { TracerProvider } from '@opentelemetry/api'

/**
 * Makes `provider` the process-wide tracer provider, together with an
 * `AsyncLocalStorage` context manager and the W3C trace-context and baggage
 * propagators. The API keeps what is already registered.
 */
export function registerTracerProvider(provider: TracerProvider): void {
  trace.setGlobalTracerProvider(provider)
  otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  )
}
