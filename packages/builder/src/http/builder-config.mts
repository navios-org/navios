import type { Client } from './client.mjs'
import type { EndpointError } from './endpoint-error.mjs'

export interface BuilderConfig {
  /**
   * HTTP client used by every endpoint declared on this builder. Can also be
   * supplied later with `provideClient`, or per call with `{ client }`.
   */
  client?: Client

  /**
   * Called once for every failed call, with the same {@link EndpointError}
   * the caller receives — whether it is thrown by `endpoint(args)` or
   * returned by `endpoint.safe(args)`.
   *
   * The hook is for telemetry. An exception thrown inside it is caught and
   * logged; it never changes the outcome of the call.
   */
  onError?: (error: EndpointError) => void
}

export interface BuilderContext {
  getClient: () => Client
  config: BuilderConfig
}
