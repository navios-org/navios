import type { Schema } from '../shared/schema.mjs'

import type { HttpMethod } from './client.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'

/**
 * Client-specific options for one endpoint (for example axios
 * `withCredentials` or fetch `credentials`).
 *
 * They are merged into the request config handed to the HTTP client. Keys the
 * builder owns (`method`, `url`, `params`, `data`, `headers`, `signal`,
 * `timeout`, `responseType`) cannot be overridden from here — use the
 * endpoint's own `headers` / `timeout` options for those.
 */
export interface ClientOptions {
  [key: string]: unknown
}

/** How the request body is encoded. */
export type EndpointBodyKind = 'json' | 'multipart'

/**
 * What the endpoint resolves to.
 *
 * - `'json'` (default) — parsed and validated with `responseSchema`.
 * - `'blob'` — a `Blob` (file downloads).
 * - `'text'` — a `string`.
 * - `'stream'` — a `ReadableStream<Uint8Array>`.
 * - `'void'` — `undefined`; the body is ignored (204 and other empty replies).
 */
export type EndpointResponseKind = 'json' | 'blob' | 'text' | 'stream' | 'void'

/**
 * Endpoint options accepted by `declareEndpoint`.
 *
 * `responseSchema` is required when `response` is `'json'` (the default) and
 * there are no `responses`, and an error otherwise. {@link EndpointOptions} is
 * the narrower form that has it.
 */
export interface BaseEndpointOptions {
  /** HTTP method for the endpoint */
  method: HttpMethod

  /**
   * URL template. Use `$paramName` for path parameters; a name is a letter
   * or underscore followed by letters, digits or underscores. Any other
   * character ends it, so the rest of a segment may be literal text:
   * `/files/$name.json`, `/carts/$id:checkout`.
   */
  url: string

  /** Optional schema for query parameters */
  querySchema?: Schema

  /** Optional schema for request body. Not for `GET` and `HEAD`, which have none */
  requestSchema?: Schema

  /**
   * Schema for validating and typing a JSON response.
   *
   * A Navios server sends the schema's output, and the client parses it as
   * input: in a shared contract the schema must accept its own output as JSON.
   */
  responseSchema?: Schema

  /**
   * Per-status success schemas, for endpoints whose 2xx replies differ by
   * status. Takes the place of `responseSchema`.
   *
   * - a schema validates and types the body for that status
   * - `null` means the status has no body; the call resolves to `undefined`
   *
   * A 2xx status that is not listed is reported as `response-validation`.
   *
   * @example
   * ```ts
   * responses: {
   *   200: userSchema,     // existing user returned
   *   201: createdSchema,  // user created
   *   204: null,           // nothing to return
   * }
   * ```
   */
  responses?: SuccessSchemaRecord

  /**
   * Optional mapping of HTTP status codes to schemas for error responses.
   *
   * A non-2xx response whose status has an entry is parsed with that schema
   * and reported as an `EndpointError` of kind `'http'` with a typed `body`.
   */
  errorSchema?: ErrorSchemaRecord

  /**
   * Optional schema for URL path parameters.
   *
   * When provided:
   * - Types are inferred from the schema instead of defaulting to `string | number`
   * - Runtime validation is performed on URL params
   * - Schema keys MUST be exactly the `$paramName` names in the URL; a
   *   mismatch throws when the endpoint is declared
   *
   * @example
   * ```ts
   * urlParamsSchema: z.object({
   *   userId: z.string().uuid(),
   *   postId: z.int(),
   * })
   * ```
   */
  urlParamsSchema?: Schema

  /**
   * Encoding of the request body. `'multipart'` converts `data` to `FormData`.
   * @default 'json'
   */
  body?: EndpointBodyKind

  /**
   * Kind of value the endpoint resolves to.
   * @default 'json'
   */
  response?: EndpointResponseKind

  /**
   * Headers sent with every call. Per-call `headers` are merged over these,
   * whatever the case of their names.
   */
  headers?: Record<string, string>

  /** Timeout in milliseconds. A per-call `timeout` wins. */
  timeout?: number

  /** Client-specific options merged into the request config. */
  clientOptions?: ClientOptions

  /**
   * When false, skip the validation of the response. The result is typed as the
   * schema's input. Useful for high-volume reads against a trusted server.
   * @default true
   */
  validateResponse?: boolean
}

/**
 * Endpoint options for a JSON endpoint: {@link BaseEndpointOptions} with a
 * required `responseSchema`.
 */
export interface EndpointOptions extends BaseEndpointOptions {
  /** Schema for validating and typing the response */
  responseSchema: Schema
}

/**
 * Per-status success schemas; `null` marks a status without a body.
 */
export type SuccessSchemaRecord = Record<number, Schema | null>
