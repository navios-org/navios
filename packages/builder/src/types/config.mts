import type { ZodObject, ZodType } from 'zod/v4'
import type { $ZodIssue } from 'zod/v4/core'

import type { Client, HttpMethod } from './common.mjs'
import type { EnvelopeError } from './envelope-error.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'

// =============================================================================
// Builder Configuration
// =============================================================================

/**
 * Structured event fired by the unified `onError` hook on every error path.
 *
 * - In envelope mode, fired on validation/http/http-unknown/network outcomes
 *   before the envelope is returned.
 * - In data mode, fired before the error is rethrown.
 */
export interface BuilderErrorEvent {
  /** Variant classification. Matches `EnvelopeError['kind']`. */
  kind: EnvelopeError<ErrorSchemaRecord>['kind']

  /** HTTP method and URL of the endpoint that produced the error. */
  endpoint: {
    method: HttpMethod
    url: string
  }

  /** HTTP status code, when available (absent for `kind: 'network'`). */
  status?: number

  /** Zod validation issues, present when `kind === 'validation'`. */
  zodIssues?: readonly $ZodIssue[]

  /** Original thrown value (e.g. NaviosError, TypeError, AbortError). */
  cause: unknown

  /** Response body for HTTP errors (raw if `http-unknown`, parsed if `http`). */
  body?: unknown
}

export interface BuilderConfig {
  /**
   * Called whenever any error path fires — HTTP error, Zod validation failure,
   * or network failure. In envelope mode, errors are not thrown but this hook
   * still fires for telemetry. In data mode, this fires before the error is
   * rethrown.
   */
  onError?: (event: BuilderErrorEvent) => void

  /** Default behaviour applied to every endpoint declaration unless overridden per-endpoint. */
  defaults?: {
    /** Default result mode; per-endpoint `result` overrides. */
    result?: 'data' | 'envelope'
  }
}

export interface BuilderContext {
  getClient: () => Client
  config: BuilderConfig
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
   * In envelope mode (`result: 'envelope'`), matching status codes are
   * classified as typed `http` errors with parsed bodies.
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

  /**
   * Output mode for this endpoint.
   * - 'data' (default): returns parsed body; throws on error (current behavior).
   * - 'envelope': returns { ok, data, error, response } and never throws. Errors are
   *   classified into typed variants; access status/headers via `response`.
   */
  result?: 'data' | 'envelope'

  /**
   * When false, skip `responseSchema.parse()` at runtime. The static type is still
   * inferred from `responseSchema`. Useful for high-volume reads against a trusted server.
   * @default true
   */
  validateResponse?: boolean
}

/**
 * Endpoint options interface with responseSchema for typed responses.
 * Extends BaseEndpointOptions with the required responseSchema field.
 */
export interface EndpointOptions extends BaseEndpointOptions {
  /** Zod schema for validating and typing the response */
  responseSchema: ZodType
}
