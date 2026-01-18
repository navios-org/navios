import type { ZodError, ZodObject, ZodType } from 'zod/v4'

import type { AbstractResponse, Client, HttpMethod } from './common.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'

// =============================================================================
// Builder Configuration
// =============================================================================

export interface BuilderConfig<UseDiscriminator extends boolean = false> {
  /**
   * If your schema uses discriminatedUnion which works for both success
   * and error responses, you can set this to true to use the discriminator
   * to parse error response using the same schema as success response.
   *
   * When `true`, endpoints with `errorSchema` will return a union type
   * (success response | error responses). When `false` (default), errors
   * are thrown and the return type is only the success response.
   */
  useDiscriminatorResponse?: UseDiscriminator

  /**
   * This method is used to process the error response or to format the
   * error message.
   * @param error unknown or NaviosError
   */
  onError?: (error: unknown) => void

  /**
   * This method is useful to handle the error with the zod schema.
   * You can use this to log the error or to show a message to the user.
   *
   * Please note that this method has lower priority than the onError method.
   * @param error ZodError
   * @param response original response
   * @param originalError original error
   */
  onZodError?: (
    error: ZodError,
    response: AbstractResponse<any> | undefined,
    originalError: unknown,
  ) => void
}

export interface BuilderContext<UseDiscriminator extends boolean = boolean> {
  getClient: () => Client
  config: BuilderConfig<UseDiscriminator>
}

// =============================================================================
// Client Options (Per-Endpoint Configuration)
// =============================================================================

/**
 * Per-endpoint client configuration options.
 *
 * These options are passed through to the HTTP client and can be used
 * to customize behavior for specific endpoints.
 *
 * @example
 * ```ts
 * const createUser = api.declareEndpoint({
 *   method: 'POST',
 *   url: '/users',
 *   responseSchema: userSchema,
 *   clientOptions: {
 *     timeout: 30000,
 *     transformRequest: {
 *       skipFields: ['metadata'], // Don't transform these fields
 *     },
 *   },
 * })
 * ```
 */
export interface ClientOptions {
  /** Request timeout in milliseconds */
  timeout?: number

  /** Additional headers for this endpoint */
  headers?: Record<string, string>

  /**
   * Request transformation options.
   * Use this to skip transformations (like camelCase to snake_case) for specific fields.
   */
  transformRequest?: {
    /** Field names to skip in request transformation */
    skipFields?: string[]
    /** Nested paths to skip (e.g., 'data.metadata.raw') */
    skipPaths?: string[]
  }

  /**
   * Response transformation options.
   * Use this to skip transformations (like snake_case to camelCase) for specific fields.
   */
  transformResponse?: {
    /** Field names to skip in response transformation */
    skipFields?: string[]
    /** Nested paths to skip (e.g., 'data.metadata.raw') */
    skipPaths?: string[]
  }

  /** Allow arbitrary client-specific options */
  [key: string]: unknown
}

// =============================================================================
// Endpoint Options (NEW - Unified Configuration)
// =============================================================================

/**
 * Base endpoint options interface used for const generic inference.
 * This minimal interface is used as the constraint for declareStream and
 * as a base for EndpointOptions. Does not include responseSchema since
 * streams return Blob directly without schema validation.
 *
 * The actual type inference happens through the const generic pattern.
 */
export interface BaseEndpointOptions {
  /** HTTP method for the endpoint */
  method: HttpMethod

  /** URL template (use $paramName for path parameters) */
  url: string

  /** Optional Zod schema for query parameters */
  querySchema?: ZodObject

  /** Optional Zod schema for request body */
  requestSchema?: ZodType

  /**
   * Optional mapping of HTTP status codes to Zod schemas for error responses.
   *
   * When `useDiscriminatorResponse` is enabled:
   * - Matching status codes return parsed error (not thrown)
   * - Non-matching status codes throw `UnknownResponseError`
   */
  errorSchema?: ErrorSchemaRecord

  /**
   * Optional Zod schema for URL path parameters.
   *
   * When provided:
   * - Types are inferred from the schema instead of defaulting to `string | number`
   * - Runtime validation is performed on URL params
   * - Schema keys MUST match all `$paramName` patterns in the URL
   *
   * @example
   * ```ts
   * urlParamsSchema: z.object({
   *   userId: z.string().uuid(),
   *   postId: z.coerce.number().int(),
   * })
   * ```
   */
  urlParamsSchema?: ZodObject

  /**
   * Optional per-endpoint client configuration.
   * These options are passed through to the HTTP client.
   */
  clientOptions?: ClientOptions
}

/**
 * Endpoint options interface with responseSchema for typed responses.
 * Extends BaseEndpointOptions with the required responseSchema field.
 */
export interface EndpointOptions extends BaseEndpointOptions {
  /** Zod schema for validating and typing the response */
  responseSchema: ZodType
}

/**
 * Base stream options interface used for const generic inference.
 * Similar to EndpointOptions but without responseSchema (streams return Blob).
 *
 * @deprecated Use BaseEndpointOptions instead
 */
export type StreamOptions = BaseEndpointOptions

// =============================================================================
// Legacy Config Types (Preserved for Backwards Compatibility)
// =============================================================================

/**
 * @deprecated Use BaseEndpointOptions instead
 */
export interface BaseStreamConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = undefined,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  UrlParamsSchema extends ZodObject | undefined = undefined,
> {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema?: RequestSchema
  /**
   * Optional mapping of HTTP status codes to Zod schemas for error responses.
   *
   * When `useDiscriminatorResponse` is enabled and an error occurs:
   * - If the status code matches a key in errorSchema, parse with that schema and RETURN (not throw)
   * - If the status code does NOT match any key, throw `UnknownResponseError`
   * - If errorSchema is not defined, use current behavior (re-throw or parse with responseSchema)
   */
  errorSchema?: ErrorSchema
  /**
   * Optional Zod schema for URL path parameters.
   * When provided, runtime validation is performed on URL params.
   */
  urlParamsSchema?: UrlParamsSchema
  /**
   * Optional per-endpoint client configuration.
   * These options are passed through to the HTTP client.
   */
  clientOptions?: ClientOptions
}

/**
 * @deprecated Use EndpointOptions instead
 */
export interface BaseEndpointConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  ResponseSchema extends ZodType = ZodType,
  RequestSchema = undefined,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  UrlParamsSchema extends ZodObject | undefined = undefined,
> extends BaseStreamConfig<Method, Url, QuerySchema, RequestSchema, ErrorSchema, UrlParamsSchema> {
  responseSchema: ResponseSchema
}

/**
 * @deprecated Use BaseEndpointOptions instead
 */
export type AnyStreamConfig = BaseStreamConfig<any, any, any, any, any, any>

/**
 * @deprecated Use EndpointOptions instead
 */
export type AnyEndpointConfig = BaseEndpointConfig<any, any, any, any, any, any, any>
