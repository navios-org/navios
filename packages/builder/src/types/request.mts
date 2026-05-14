import type { z, ZodObject, ZodType } from 'zod/v4'

import type { AbstractRequestConfig } from './common.mjs'
import type { BaseEndpointOptions } from './config.mjs'

// =============================================================================
// URL Parameter Parsing Types
// =============================================================================

/**
 * Parses URL path parameters from a URL template string.
 *
 * Extracts parameter names from `$paramName` patterns in URLs.
 *
 * @example
 * ```ts
 * type Params = ParsePathParams<'/users/$userId/posts/$postId'>
 * // Result: 'userId' | 'postId'
 * ```
 */
export type ParsePathParams<
  T extends string,
  TAcc = never,
> = T extends `${string}$${infer TPossiblyParam}`
  ? TPossiblyParam extends `${infer TParam}/${infer TRest}`
    ? ParsePathParams<TRest, TParam extends '' ? '_splat' : TParam | TAcc>
    : TPossiblyParam extends ''
      ? '_splat'
      : TPossiblyParam | TAcc
  : TAcc

/**
 * Checks if a URL template has any path parameters.
 *
 * @example
 * ```ts
 * type HasParams = UrlHasParams<'/users/$userId'> // true
 * type NoParams = UrlHasParams<'/users'>          // false
 * ```
 */
export type UrlHasParams<Url extends string> = ParsePathParams<Url> extends never ? false : true

/**
 * Creates an object type for URL parameters with their expected types.
 *
 * @template Url - The URL template string
 * @template IsServer - If true, params are string only; if false, string | number
 *
 * @example
 * ```ts
 * type Params = UrlParams<'/users/$userId'>
 * // Result: { userId: string | number }
 * ```
 */
export type UrlParams<Url extends string, IsServer extends boolean = false> = {
  [key in ParsePathParams<Url>]: IsServer extends true ? string : string | number
}

// =============================================================================
// Simplify Utility Type
// =============================================================================

/**
 * Flattens a type for better IDE display and hover information.
 * Recursively simplifies intersection types into a single object type.
 */
export type Simplify<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

/**
 * Flattens nested object types, preserving urlParams structure.
 * @deprecated Use Simplify instead
 */
export type Util_FlatObject<T> = T extends object
  ? { [K in keyof T]: K extends 'urlParams' ? Util_FlatObject<T[K]> : T[K] }
  : T

// =============================================================================
// Request Base Types
// =============================================================================

/**
 * Base request options available on all endpoint calls.
 * Includes signal for cancellation and custom headers.
 */
export interface RequestBase extends Pick<AbstractRequestConfig, 'signal' | 'headers'> {}

/**
 * @deprecated Use RequestBase instead
 */
export interface NaviosZodRequestBase extends Pick<AbstractRequestConfig, 'signal' | 'headers'> {
  [key: string]: any
}

// =============================================================================
// Unified Request Arguments Types (NEW)
// =============================================================================

/**
 * Minimal shape consumed by {@link ClientRequestArgs} / {@link ServerRequestArgs}.
 *
 * Both `EndpointOptions` and `BaseEndpointOptions` satisfy this constraint, so
 * these types are usable on both the http endpoint surface and the stream /
 * multipart surfaces (which don't require `responseSchema`).
 */
export interface RequestArgsOptions {
  url: string
  querySchema?: ZodObject
  requestSchema?: ZodType
  urlParamsSchema?: ZodObject
}

/**
 * Client-side request arguments derived from an endpoint's options.
 *
 * Conditionally includes `urlParams`, `params` (query), and `data` (body) based
 * on the URL template and schema types declared on the endpoint. Uses
 * `z.input` for schema-typed fields (the pre-validation, user-facing shape) and
 * intersects with {@link RequestBase} so callers can pass `signal` / `headers`.
 *
 * @template Options - Endpoint options object (satisfies {@link RequestArgsOptions}).
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
      ? Options['urlParamsSchema'] extends ZodObject
        ? { urlParams: z.input<Options['urlParamsSchema']> }
        : { urlParams: Simplify<UrlParams<Options['url']>> }
      : {}) &
    // Query Parameters
    (Options['querySchema'] extends ZodObject ? { params: z.input<Options['querySchema']> } : {}) &
    // Request Body
    (Options['requestSchema'] extends ZodType ? { data: z.input<Options['requestSchema']> } : {})
>

/**
 * Server-side request arguments derived from an endpoint's options.
 *
 * Mirrors {@link ClientRequestArgs} but uses `z.output` (the post-validation,
 * handler-facing shape) and constrains raw URL params to `string` only (no
 * `number`). Does not intersect with {@link RequestBase} — server handlers
 * never receive client cancellation primitives directly via the args object.
 *
 * @template Options - Endpoint options object (satisfies {@link RequestArgsOptions}).
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
    ? Options['urlParamsSchema'] extends ZodObject
      ? { urlParams: z.output<Options['urlParamsSchema']> }
      : { urlParams: Simplify<UrlParams<Options['url'], true>> }
    : {}) &
    // Query Parameters
    (Options['querySchema'] extends ZodObject ? { params: z.output<Options['querySchema']> } : {}) &
    // Request Body
    (Options['requestSchema'] extends ZodType ? { data: z.output<Options['requestSchema']> } : {})
>

// =============================================================================
// Legacy Types (Deprecated - Use ClientRequestArgs / ServerRequestArgs)
// =============================================================================

/**
 * @deprecated Use ClientRequestArgs / ServerRequestArgs instead
 */
export type NaviosZodRequest<Config extends BaseEndpointOptions> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['requestSchema'] extends ZodType ? { data: z.input<Config['requestSchema']> } : {}) &
  (Config['querySchema'] extends ZodObject ? { params: z.input<Config['querySchema']> } : {}) &
  NaviosZodRequestBase

/**
 * @deprecated Use ClientRequestArgs / ServerRequestArgs instead
 */
export type EndpointFunctionArgs<
  Url extends string,
  QuerySchema = undefined,
  RequestSchema = undefined,
  IsServer extends boolean = false,
> = (QuerySchema extends ZodObject
  ? {
      params: z.infer<QuerySchema>
    }
  : {}) &
  (RequestSchema extends ZodType
    ? {
        data: z.infer<RequestSchema>
      }
    : {}) &
  (UrlHasParams<Url> extends true
    ? {
        urlParams: UrlParams<Url, IsServer>
      }
    : {}) &
  (IsServer extends false ? NaviosZodRequestBase : {})
