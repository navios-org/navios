import type { AbstractRequestConfig, Client } from './client.mjs'
import type { EndpointError } from './endpoint-error.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'

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

export interface BuilderConfig<Errors extends ErrorSchemaRecord = {}> {
  /**
   * HTTP client used by every endpoint declared on this builder. Can also be
   * supplied later with `provideClient`, or per call with `{ client }`.
   */
  client?: Client

  /**
   * Error schemas every endpoint of this builder shares, by status: the error
   * bodies a backend sends from anywhere, such as 401, 403 or 500.
   *
   * Each endpoint gets them merged under its own `errorSchema`, where the
   * endpoint's entry wins for a status both declare. A response with one of
   * these statuses is then a typed `http` error on every endpoint instead of
   * `http-unknown`, and `endpoint.config.errorSchema` holds the merged record.
   *
   * @example
   * ```ts
   * const apiError = z.object({ error: z.object({ message: z.string(), type: z.string() }) })
   *
   * const API = builder({ errorSchema: { 401: apiError, 403: apiError, 500: apiError } })
   *
   * const getUser = API.declareEndpoint({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   *   errorSchema: { 404: z.object({ message: z.string() }) }, // adds to the shared ones
   * })
   * ```
   */
  errorSchema?: Errors

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
  config: BuilderConfig<ErrorSchemaRecord>
}
