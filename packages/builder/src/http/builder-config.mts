import type { AbstractRequestConfig, Client } from './client.mjs'
import type { EndpointError } from './endpoint-error.mjs'

/**
 * The second argument of the builder's `onError` hook.
 */
export interface EndpointErrorContext {
  /**
   * The request config handed to the client: the bound URL, the query, the
   * body and the headers. `null` when the call failed before a request was
   * built (invalid input, no client, a URL parameter that cannot be bound).
   *
   * It is not part of the `EndpointError` on purpose: the headers may carry
   * credentials, and the error is meant to be safe to log with `toJSON()`.
   */
  request: AbstractRequestConfig | null
}

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
   * The second argument has the request that was sent, when there was one,
   * for logs that need the bound URL or the query.
   *
   * The hook is for telemetry. An exception thrown inside it is caught and
   * logged; it never changes the outcome of the call.
   *
   * @example
   * ```ts
   * builder({
   *   onError: (error, { request }) => {
   *     if (error.kind === 'response-validation') {
   *       console.error(`Invalid response from ${request?.url}`, error.issues)
   *     }
   *   },
   * })
   * ```
   */
  onError?: (error: EndpointError, context: EndpointErrorContext) => void
}

export interface BuilderContext {
  getClient: () => Client
  config: BuilderConfig
}
