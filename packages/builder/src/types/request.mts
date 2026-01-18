import type { z, ZodObject, ZodType } from 'zod/v4'

import type { AbstractRequestConfig } from './common.mjs'
import type { AnyEndpointConfig, AnyStreamConfig, BaseStreamConfig } from './config.mjs'

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
// Unified Request Arguments Type (NEW)
// =============================================================================

/**
 * Unified request arguments type for endpoint calls.
 *
 * This is the single source of truth for request parameters.
 * It conditionally includes urlParams, params (query), and data (body)
 * based on the URL and schema types provided.
 *
 * @template Url - URL template string (e.g., '/users/$userId')
 * @template QuerySchema - Zod schema for query parameters
 * @template RequestSchema - Zod schema for request body
 * @template UrlParamsSchema - Optional Zod schema for URL parameters
 * @template IsServer - If true, URL params are string only
 *
 * @example
 * ```ts
 * // GET /users/$userId?page=1
 * type Args = RequestArgs<
 *   '/users/$userId',
 *   z.ZodObject<{ page: z.ZodNumber }>,
 *   undefined
 * >
 * // Result: { urlParams: { userId: string | number }, params: { page: number } } & RequestBase
 * ```
 */
export type RequestArgs<
  Url extends string,
  QuerySchema extends ZodObject | undefined = undefined,
  RequestSchema extends ZodType | undefined = undefined,
  UrlParamsSchema extends ZodObject | undefined = undefined,
  IsServer extends boolean = false,
> = Simplify<
  (IsServer extends false ? RequestBase : {}) &
    // URL Parameters: Use UrlParamsSchema if provided, else default UrlParams type
    (UrlHasParams<Url> extends true
      ? UrlParamsSchema extends ZodObject
        ? IsServer extends true
          ? { urlParams: z.output<UrlParamsSchema> }
          : { urlParams: z.input<UrlParamsSchema> }
        : { urlParams: Simplify<UrlParams<Url, IsServer>> }
      : {}) &
    // Query Parameters
    (QuerySchema extends ZodObject
      ? IsServer extends true
        ? { params: z.output<QuerySchema> }
        : { params: z.input<QuerySchema> }
      : {}) &
    // Request Body
    (RequestSchema extends ZodType
      ? IsServer extends true
        ? { data: z.output<RequestSchema> }
        : { data: z.input<RequestSchema> }
      : {})
>

// =============================================================================
// Legacy Types (Deprecated - Use RequestArgs)
// =============================================================================

/**
 * @deprecated Use RequestArgs instead
 */
export type NaviosZodRequest<Config extends BaseStreamConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['requestSchema'] extends ZodType ? { data: z.input<Config['requestSchema']> } : {}) &
  (Config['querySchema'] extends ZodObject ? { params: z.input<Config['querySchema']> } : {}) &
  NaviosZodRequestBase

/**
 * @deprecated Use RequestArgs instead
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

// =============================================================================
// Abstract Endpoint Types
// =============================================================================

export type AbstractStream<Config extends AnyStreamConfig> = ((params: any) => Promise<Blob>) & {
  config: Config
}

export type AbstractEndpoint<Config extends AnyEndpointConfig> = ((
  params: any,
) => Promise<z.infer<Config['responseSchema']>>) & {
  config: Config
}
