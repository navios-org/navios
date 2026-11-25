import type { InferSchemaInput, InferSchemaOutput, Schema } from '../shared/schema.mjs'
import type { Simplify } from '../shared/type-helpers.mjs'
import type { UrlHasParams, UrlParams } from '../shared/url-params.mjs'

import type { AbstractRequestConfig } from './client.mjs'

/**
 * Per-call request options available on every endpoint call.
 */
export interface RequestBase extends Pick<AbstractRequestConfig, 'signal' | 'headers'> {
  /** Timeout in milliseconds for this call. Wins over the endpoint's `timeout`. */
  timeout?: number
}

/**
 * Minimal shape consumed by {@link ClientRequestArgs} / {@link ServerRequestArgs}.
 */
export interface RequestArgsOptions {
  url: string
  querySchema?: Schema
  requestSchema?: Schema
  urlParamsSchema?: Schema
}

/**
 * `{ [Key]: Value }`, with the key optional when `Value` has no required
 * fields or accepts `undefined` — a query schema whose fields are all optional
 * does not force the caller to pass `params: {}`.
 */
type OptionalIfEmpty<Key extends string, Value> = {} extends Value
  ? { [K in Key]?: Value }
  : undefined extends Value
    ? { [K in Key]?: Value }
    : { [K in Key]: Value }

/**
 * Client-side request arguments derived from an endpoint's options.
 *
 * Conditionally includes `urlParams`, `params` (query), and `data` (body) based
 * on the URL template and schema types declared on the endpoint. Uses the
 * schema's input type for schema-typed fields (the pre-validation,
 * user-facing shape) and intersects with {@link RequestBase} so callers can
 * pass `signal` / `headers` / `timeout`.
 *
 * This is the one args type: the endpoint handler, `safe()`, and every
 * `@navios/react-query` surface derive their arguments from it.
 *
 * @example
 * ```ts
 * // GET /users/$userId?page=1
 * type Args = ClientRequestArgs<{
 *   url: '/users/$userId'
 *   querySchema: z.ZodObject<{ page: z.ZodNumber }>
 * }>
 * // Result: { urlParams: { userId: string | number }, params: { page: number } } & RequestBase
 * ```
 */
export type ClientRequestArgs<Options extends RequestArgsOptions> = Simplify<
  RequestBase &
    // URL Parameters: Use urlParamsSchema if provided, else default UrlParams type
    (UrlHasParams<Options['url']> extends true
      ? Options['urlParamsSchema'] extends Schema
        ? { urlParams: InferSchemaInput<Options['urlParamsSchema']> }
        : { urlParams: Simplify<UrlParams<Options['url']>> }
      : {}) &
    // Query Parameters
    (Options['querySchema'] extends Schema
      ? OptionalIfEmpty<'params', InferSchemaInput<Options['querySchema']>>
      : {}) &
    // Request Body
    (Options['requestSchema'] extends Schema
      ? OptionalIfEmpty<'data', InferSchemaInput<Options['requestSchema']>>
      : {})
>

/**
 * Server-side request arguments derived from an endpoint's options.
 *
 * Mirrors {@link ClientRequestArgs} but uses `z.output` (the post-validation,
 * handler-facing shape) and constrains raw URL params to `string` only (no
 * `number`). Does not intersect with {@link RequestBase} — server handlers
 * never receive client cancellation primitives directly via the args object.
 *
 * @example
 * ```ts
 * // GET /users/$userId?page=1 — inside the controller method
 * type Args = ServerRequestArgs<{
 *   url: '/users/$userId'
 *   querySchema: z.ZodObject<{ page: z.ZodNumber }>
 * }>
 * // Result: { urlParams: { userId: string }, params: { page: number } }
 * ```
 */
export type ServerRequestArgs<Options extends RequestArgsOptions> = Simplify<
  // URL Parameters: Use urlParamsSchema if provided, else default UrlParams type
  (UrlHasParams<Options['url']> extends true
    ? Options['urlParamsSchema'] extends Schema
      ? { urlParams: InferSchemaOutput<Options['urlParamsSchema']> }
      : { urlParams: Simplify<UrlParams<Options['url'], true>> }
    : {}) &
    // Query Parameters
    (Options['querySchema'] extends Schema
      ? { params: InferSchemaOutput<Options['querySchema']> }
      : {}) &
    // Request Body
    (Options['requestSchema'] extends Schema
      ? { data: InferSchemaOutput<Options['requestSchema']> }
      : {})
>
