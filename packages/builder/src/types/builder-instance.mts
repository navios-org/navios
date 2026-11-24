import type { EndpointErrorOf } from '../errors/endpoint-error.mjs'

import type { Client } from './common.mjs'
import type { BaseEndpointOptions, SuccessSchemaRecord } from './config.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'
import type { ClientRequestArgs } from './request.mjs'
import type { SafeResult } from './result.mjs'
import type { InferSchemaInput, InferSchemaOutput, Schema } from './schema.mjs'

// =============================================================================
// Inference
// =============================================================================

/**
 * The value an endpoint resolves to, derived from its `response` kind and
 * `responseSchema`.
 */
export type InferEndpointReturn<Options extends BaseEndpointOptions> = Options extends {
  response: 'blob'
}
  ? Blob
  : Options extends { response: 'text' }
    ? string
    : Options extends { response: 'stream' }
      ? ReadableStream<Uint8Array>
      : Options extends { response: 'void' }
        ? undefined
        : Options extends { validateResponse: false }
          ? // Validation is skipped, so the body arrives as the server sent it:
            // the schemas' input shape, without their transforms or defaults.
            Options['responses'] extends SuccessSchemaRecord
            ? InferSuccessInput<Options['responses']>
            : Options['responseSchema'] extends Schema
              ? InferSchemaInput<Options['responseSchema']>
              : unknown
          : Options['responses'] extends SuccessSchemaRecord
            ? InferSuccessOutput<Options['responses']>
            : Options['responseSchema'] extends Schema
              ? InferSchemaOutput<Options['responseSchema']>
              : unknown

/**
 * Like {@link InferSuccessOutput}, with each schema's input type: what the
 * call resolves to when `validateResponse` is `false`.
 */
export type InferSuccessInput<R extends SuccessSchemaRecord> = {
  [K in keyof R]: R[K] extends Schema ? InferSchemaInput<R[K]> : undefined
}[keyof R]

/**
 * Union of what each status in a `responses` map resolves to: the schema's
 * output, or `undefined` for a `null` entry.
 */
export type InferSuccessOutput<R extends SuccessSchemaRecord> = {
  [K in keyof R]: R[K] extends Schema ? InferSchemaOutput<R[K]> : undefined
}[keyof R]

/**
 * The error an endpoint throws (and `safe()` returns), typed from its
 * `errorSchema`.
 */
export type InferEndpointError<Options extends BaseEndpointOptions> = EndpointErrorOf<
  Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined
>

/** What `endpoint.safe(args)` resolves to. */
export type InferEndpointSafeResult<Options extends BaseEndpointOptions> = SafeResult<
  InferEndpointReturn<Options>,
  InferEndpointError<Options>
>

/** Options accepted as the second argument of an endpoint call. */
export interface EndpointCallOptions {
  /**
   * HTTP client for this call only. Use it for per-request clients in SSR
   * (cookies, auth) without touching the builder's shared client.
   */
  client?: Client
}

type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

/**
 * Call signature of an endpoint: the args object is optional when the
 * endpoint has no URL params, query schema or request schema.
 */
export type EndpointCallArgs<Options extends BaseEndpointOptions> = [
  RequiredKeys<ClientRequestArgs<Options>>,
] extends [never]
  ? [args?: ClientRequestArgs<Options>, options?: EndpointCallOptions]
  : [args: ClientRequestArgs<Options>, options?: EndpointCallOptions]

/**
 * The handler returned by `declareEndpoint`.
 *
 * - `endpoint(args)` resolves to the data and **throws** an `EndpointError`
 *   on any failure.
 * - `endpoint.safe(args)` **never throws**: it resolves to a `SafeResult`
 *   carrying either the data or the same `EndpointError`.
 * - `endpoint.config` is the options object the endpoint was declared with.
 *
 * @example
 * ```ts
 * const user = await getUser({ urlParams: { userId: '123' } })
 *
 * const res = await getUser.safe({ urlParams: { userId: '123' } })
 * if (res.ok) res.data
 * else res.error.kind
 * ```
 */
export type EndpointHandler<Options extends BaseEndpointOptions> = ((
  ...args: EndpointCallArgs<Options>
) => Promise<InferEndpointReturn<Options>>) & {
  safe: (...args: EndpointCallArgs<Options>) => Promise<InferEndpointSafeResult<Options>>
  config: Options
}

/**
 * `responseSchema` is required unless the endpoint declares a non-JSON
 * `response` kind or a per-status `responses` map.
 */
export type RequireResponseSchema<Options> = Options extends
  | { response: 'blob' | 'text' | 'stream' | 'void' }
  | { responses: SuccessSchemaRecord }
  ? {}
  : { responseSchema: Schema }

/**
 * Rejects option keys the builder does not know. Inference through a generic
 * parameter skips TypeScript's excess-property check, so without this a typo
 * (`requstSchema`) or a removed option would be accepted and silently ignored.
 */
export type NoUnknownOptions<Options, Known = BaseEndpointOptions> = {
  [K in Exclude<keyof Options, keyof Known>]: never
}

// =============================================================================
// Builder Instance
// =============================================================================

export interface BuilderInstance {
  /**
   * Sets or replaces the HTTP client used by every endpoint declared on this
   * builder. Meant for application start-up; prefer `builder({ client })`.
   * For a per-request client, pass `{ client }` as the second call argument.
   */
  provideClient(client: Client): void

  /**
   * Returns the currently configured HTTP client.
   * Throws NaviosError if no client has been provided.
   */
  getClient(): Client

  /**
   * Returns a new builder with the same configuration and a different
   * client. Endpoints declared on the returned builder use that client;
   * endpoints already declared on this builder are not affected.
   */
  withClient(client: Client): BuilderInstance

  /**
   * Declares a type-safe API endpoint.
   *
   * Uses `const` type parameter inference to derive every type from the
   * options object.
   *
   * @example
   * ```ts
   * // JSON endpoint
   * const getUser = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   *   errorSchema: { 404: z.object({ message: z.string() }) },
   * })
   *
   * // File upload
   * const upload = api.declareEndpoint({
   *   method: 'POST',
   *   url: '/files',
   *   body: 'multipart',
   *   requestSchema: z.object({ file: z.instanceof(File) }),
   *   responseSchema: z.object({ id: z.string() }),
   * })
   *
   * // File download
   * const download = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/files/$fileId',
   *   response: 'blob',
   * })
   *
   * // No response body (204)
   * const remove = api.declareEndpoint({
   *   method: 'DELETE',
   *   url: '/files/$fileId',
   *   response: 'void',
   * })
   * ```
   */
  declareEndpoint<const Options extends BaseEndpointOptions>(
    options: Options & RequireResponseSchema<Options> & NoUnknownOptions<Options>,
  ): EndpointHandler<Options>
}

// =============================================================================
// Helper Types for External Use
// =============================================================================

/**
 * Extracts the args type from an endpoint declaration.
 *
 * @example
 * ```ts
 * const getUser = api.declareEndpoint({ ... })
 * type Args = EndpointParams<typeof getUser>
 * ```
 */
export type EndpointParams<T> = T extends { config: infer C extends BaseEndpointOptions }
  ? ClientRequestArgs<C>
  : never

/**
 * Extracts the resolved data type from an endpoint declaration.
 */
export type EndpointResult<T> = T extends { config: infer C extends BaseEndpointOptions }
  ? InferEndpointReturn<C>
  : never

/**
 * Extracts the typed error from an endpoint declaration.
 */
export type EndpointErrorType<T> = T extends { config: infer C extends BaseEndpointOptions }
  ? InferEndpointError<C>
  : never

/**
 * Extracts the config type from an endpoint declaration.
 */
export type EndpointConfig<T> = T extends { config: infer C } ? C : never
