import type { AbstractRequestConfig } from './common.mjs'
import type { InferSchemaInput, InferSchemaOutput, Schema } from './schema.mjs'

// =============================================================================
// URL Parameter Parsing Types
// =============================================================================

type Lower =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type IdentStart = Lower | Uppercase<Lower> | '_'
type IdentChar = IdentStart | Digit

/** Consumes identifier characters from the front of `S`: `[name, rest]`. */
type TakeIdent<S extends string, Acc extends string = ''> = S extends `${infer C}${infer Rest}`
  ? C extends IdentChar
    ? TakeIdent<Rest, `${Acc}${C}`>
    : [Acc, S]
  : [Acc, '']

/**
 * Parses URL path parameters from a URL template string.
 *
 * A parameter is `$` followed by a letter or underscore and then any number
 * of letters, digits or underscores — the same rule `bindUrlParams` applies
 * at runtime. A `$` followed by anything else is literal text.
 *
 * @example
 * ```ts
 * type A = ParsePathParams<'/users/$userId/posts/$postId'> // 'userId' | 'postId'
 * type B = ParsePathParams<'/files/$file_id.json'>         // 'file_id'
 * ```
 */
export type ParsePathParams<T extends string, TAcc = never> = T extends `${string}$${infer After}`
  ? After extends `${infer First}${string}`
    ? First extends IdentStart
      ? TakeIdent<After> extends [infer Name, infer Rest extends string]
        ? ParsePathParams<Rest, TAcc | Name>
        : TAcc
      : ParsePathParams<After, TAcc>
    : TAcc
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
  [key in ParsePathParams<Url> & string]: IsServer extends true ? string : string | number
}

// =============================================================================
// Simplify Utility Type
// =============================================================================

/**
 * Flattens a type for better IDE display and hover information.
 */
export type Simplify<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

// =============================================================================
// Request Arguments
// =============================================================================

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
 * fields — a query schema whose fields are all optional does not force the
 * caller to pass `params: {}`.
 */
type OptionalIfEmpty<Key extends string, Value> = {} extends Value
  ? { [K in Key]?: Value }
  : { [K in Key]: Value }

/**
 * Client-side request arguments derived from an endpoint's options.
 *
 * Conditionally includes `urlParams`, `params` (query), and `data` (body) based
 * on the URL template and schema types declared on the endpoint. Uses
 * `z.input` for schema-typed fields (the pre-validation, user-facing shape) and
 * intersects with {@link RequestBase} so callers can pass `signal` / `headers`
 * / `timeout`.
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

// =============================================================================
// Property helpers (used by the socket and EventSource declarations)
// =============================================================================

/**
 * True when `K` is a key of the inferred object type and is not `undefined`.
 * Handles const-generic inference, which omits optional properties that were
 * not provided.
 */
export type HasProperty<T, K extends string> = K extends keyof T
  ? undefined extends T[K]
    ? T[K] extends undefined
      ? false
      : true
    : true
  : false

/**
 * Safely extract a property type, returning never if not present.
 */
export type SafeGet<T, K extends string> = K extends keyof T ? T[K] : never
