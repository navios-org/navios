import type { Client } from './client.mjs'
import type { EndpointError } from './endpoint-error.mjs'

export interface BuilderConfig {
  /**
   * HTTP client used by every endpoint declared on this builder. Can also be
   * supplied later with `provideClient`, or per call with `{ client }`.
   */
  client?: Client

  /**
   * What is sent once `urlParamsSchema`, `querySchema` and `requestSchema`
   * have accepted a call's arguments.
   *
   * - `'input'` — the arguments as the caller passed them. The server parses
   *   them with the same schemas, so transforms, defaults and the removal of
   *   unknown keys happen there.
   * - `'output'` — what the schemas produced. For APIs that are not described
   *   by the schemas' input: the schemas then convert to the format on the
   *   wire, and their transforms and defaults run before sending.
   *
   * @default 'input'
   */
  send?: 'input' | 'output'

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
