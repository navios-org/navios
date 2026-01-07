import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Client } from './common.mjs'
import type { BaseEndpointOptions, EndpointOptions } from './config.mjs'
import type {
  ErrorSchemaRecord,
  InferErrorSchemaOutputWithStatus,
} from './error-schema.mjs'
import type { Simplify, UrlHasParams, UrlParams } from './request.mjs'

// =============================================================================
// Inference Types for const Generic Pattern
// =============================================================================

/**
 * Helper to check if a property key exists in the inferred object type
 * and is not undefined. This handles the case where const generic inference
 * doesn't include optional properties that weren't provided.
 *
 * @example
 * ```ts
 * type Test = HasProperty<{ foo: string }, 'foo'> // true
 * type Test2 = HasProperty<{ foo?: string }, 'foo'> // true (when provided)
 * type Test3 = HasProperty<{}, 'foo'> // false
 * ```
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
 *
 * @example
 * ```ts
 * type Test = SafeGet<{ foo: string }, 'foo'> // string
 * type Test2 = SafeGet<{}, 'foo'> // never
 * ```
 */
export type SafeGet<T, K extends string> = K extends keyof T ? T[K] : never

/**
 * Infers the function parameters from endpoint options.
 * Uses urlParamsSchema if provided, otherwise defaults to string | number.
 *
 * @example
 * ```ts
 * const options = {
 *   method: 'GET',
 *   url: '/users/$userId',
 *   querySchema: z.object({ page: z.number() }),
 *   responseSchema: userSchema,
 * } as const
 *
 * type Params = InferEndpointParams<typeof options>
 * // { urlParams: { userId: string | number }, params: { page: number }, signal?: ... }
 * ```
 */
export type InferEndpointParams<Options extends EndpointOptions> = Simplify<
  // URL Parameters
  (UrlHasParams<Options['url']> extends true
    ? HasProperty<Options, 'urlParamsSchema'> extends true
      ? { urlParams: z.input<SafeGet<Options, 'urlParamsSchema'>> }
      : { urlParams: UrlParams<Options['url']> }
    : {}) &
    // Query Parameters
    (HasProperty<Options, 'querySchema'> extends true
      ? { params: z.input<SafeGet<Options, 'querySchema'>> }
      : {}) &
    // Request Body
    (HasProperty<Options, 'requestSchema'> extends true
      ? { data: z.input<SafeGet<Options, 'requestSchema'>> }
      : {}) &
    // Base request options (signal, headers)
    { signal?: AbortSignal | null; headers?: Record<string, string> }
>

/**
 * Infers the function parameters from stream options.
 *
 * @example
 * ```ts
 * const options = {
 *   method: 'GET',
 *   url: '/files/$fileId/download',
 * } as const
 *
 * type Params = InferStreamParams<typeof options>
 * // { urlParams: { fileId: string | number }, signal?: ... }
 * ```
 */
export type InferStreamParams<Options extends BaseEndpointOptions> = Simplify<
  // URL Parameters
  (UrlHasParams<Options['url']> extends true
    ? HasProperty<Options, 'urlParamsSchema'> extends true
      ? { urlParams: z.input<SafeGet<Options, 'urlParamsSchema'> & ZodObject> }
      : { urlParams: UrlParams<Options['url']> }
    : {}) &
    // Query Parameters
    (HasProperty<Options, 'querySchema'> extends true
      ? { params: z.input<SafeGet<Options, 'querySchema'> & ZodObject> }
      : {}) &
    // Request Body
    (HasProperty<Options, 'requestSchema'> extends true
      ? { data: z.input<SafeGet<Options, 'requestSchema'> & ZodType> }
      : {}) &
    // Base request options
    { signal?: AbortSignal | null; headers?: Record<string, string> }
>

/**
 * Infers the return type based on responseSchema, errorSchema, and UseDiscriminator.
 *
 * When UseDiscriminator is true and errorSchema is provided, the return type
 * is a union of the success response and all error responses.
 *
 * @example
 * ```ts
 * const options = {
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: userSchema,
 *   errorSchema: { 404: notFoundSchema },
 * } as const
 *
 * // Without discriminator: z.output<userSchema>
 * type Result1 = InferEndpointReturn<typeof options, false>
 *
 * // With discriminator: z.output<userSchema> | z.output<notFoundSchema>
 * type Result2 = InferEndpointReturn<typeof options, true>
 * ```
 */
export type InferEndpointReturn<
  Options extends EndpointOptions,
  UseDiscriminator extends boolean,
> = UseDiscriminator extends true
  ? Options['errorSchema'] extends ErrorSchemaRecord
    ?
        | z.output<Options['responseSchema']>
        | InferErrorSchemaOutputWithStatus<Options['errorSchema']>
    : z.output<Options['responseSchema']>
  : z.output<Options['responseSchema']>

/**
 * Infers the return type for stream endpoints.
 *
 * Streams always return Blob, but with UseDiscriminator, error responses
 * can be returned as part of the union.
 */
export type InferStreamReturn<
  Options extends BaseEndpointOptions,
  UseDiscriminator extends boolean,
> = UseDiscriminator extends true
  ? Options['errorSchema'] extends ErrorSchemaRecord
    ? Blob | InferErrorSchemaOutputWithStatus<Options['errorSchema']>
    : Blob
  : Blob

/**
 * The handler function type returned by declareEndpoint.
 *
 * This is the type of the function returned by `api.declareEndpoint()`.
 * It includes both the callable function and the attached config.
 *
 * @example
 * ```ts
 * const getUser: EndpointHandler<typeof options, false> = api.declareEndpoint(options)
 * const result = await getUser({ urlParams: { userId: '123' } })
 * const config = getUser.config // Access the original config
 * ```
 */
export type EndpointHandler<
  Options extends EndpointOptions,
  UseDiscriminator extends boolean,
> = ((
  params: InferEndpointParams<Options>,
) => Promise<InferEndpointReturn<Options, UseDiscriminator>>) & {
  config: Options
}

/**
 * The handler function type returned by declareStream.
 *
 * Similar to EndpointHandler but for streaming endpoints that return Blob.
 */
export type StreamHandler<
  Options extends BaseEndpointOptions,
  UseDiscriminator extends boolean,
> = ((
  params: InferStreamParams<Options>,
) => Promise<InferStreamReturn<Options, UseDiscriminator>>) & {
  config: Options
}

// =============================================================================
// Builder Instance Interface (NEW - Using const Generic Pattern)
// =============================================================================

/**
 * The main builder instance interface.
 *
 * Uses TypeScript's `const` type parameter inference to reduce overloads
 * while maintaining full type safety. All schema combinations are handled
 * by a single generic method per endpoint type.
 *
 * @template UseDiscriminator - When true, error responses are returned as part
 *   of a union type. When false (default), errors are thrown.
 */
export interface BuilderInstance<UseDiscriminator extends boolean = false> {
  /**
   * Provides the HTTP client instance to use for requests.
   * Must be called before making any API calls.
   */
  provideClient(client: Client): void

  /**
   * Returns the currently configured HTTP client.
   * Throws NaviosError if no client has been provided.
   */
  getClient(): Client

  /**
   * Declares a type-safe API endpoint.
   *
   * Uses `const` type parameter inference to automatically infer types
   * from the configuration object. All schema fields are optional except
   * `method`, `url`, and `responseSchema`.
   *
   * @example
   * ```ts
   * // Simple GET endpoint
   * const getUsers = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users',
   *   responseSchema: z.array(userSchema),
   * })
   *
   * // POST with URL params, query, body, and error handling
   * const updateUser = api.declareEndpoint({
   *   method: 'PATCH',
   *   url: '/users/$userId',
   *   querySchema: z.object({ notify: z.boolean().optional() }),
   *   requestSchema: z.object({ name: z.string() }),
   *   responseSchema: userSchema,
   *   urlParamsSchema: z.object({ userId: z.string().uuid() }),
   *   errorSchema: {
   *     404: z.object({ error: z.literal('User not found') }),
   *     403: z.object({ error: z.literal('Forbidden') }),
   *   },
   * })
   * ```
   */
  declareEndpoint<const Options extends EndpointOptions>(
    options: Options,
  ): EndpointHandler<Options, UseDiscriminator>

  /**
   * Declares a multipart/form-data endpoint for file uploads.
   *
   * Similar to `declareEndpoint`, but the request body is automatically
   * converted to FormData. Files can be passed directly in the data object.
   *
   * @example
   * ```ts
   * const uploadFile = api.declareMultipart({
   *   method: 'POST',
   *   url: '/files',
   *   requestSchema: z.object({
   *     file: z.instanceof(File),
   *     description: z.string().optional(),
   *   }),
   *   responseSchema: z.object({ fileId: z.string() }),
   * })
   * ```
   */
  declareMultipart<const Options extends EndpointOptions>(
    options: Options,
  ): EndpointHandler<Options, UseDiscriminator>

  /**
   * Declares a streaming endpoint that returns a Blob.
   *
   * Use this for file downloads or binary data. The response is returned
   * as a Blob without schema validation.
   *
   * @example
   * ```ts
   * const downloadFile = api.declareStream({
   *   method: 'GET',
   *   url: '/files/$fileId/download',
   * })
   *
   * const blob = await downloadFile({ urlParams: { fileId: '123' } })
   * ```
   */
  declareStream<const Options extends BaseEndpointOptions>(
    options: Options,
  ): StreamHandler<Options, UseDiscriminator>
}

// =============================================================================
// Export Helper Types for External Use
// =============================================================================

/**
 * Extracts the parameter type from an endpoint declaration.
 *
 * @example
 * ```ts
 * const getUser = api.declareEndpoint({ ... })
 * type Params = EndpointParams<typeof getUser>
 * ```
 */
export type EndpointParams<T> = T extends (params: infer P) => any ? P : never

/**
 * Extracts the return type from an endpoint declaration.
 *
 * @example
 * ```ts
 * const getUser = api.declareEndpoint({ ... })
 * type Result = EndpointResult<typeof getUser>
 * ```
 */
export type EndpointResult<T> = T extends (params: any) => Promise<infer R>
  ? R
  : never

/**
 * Extracts the config type from an endpoint declaration.
 */
export type EndpointConfig<T> = T extends { config: infer C } ? C : never
