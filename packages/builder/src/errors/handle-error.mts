import type { ZodType } from 'zod/v4'

import { ZodError } from 'zod/v4'

import type { AbstractResponse, BuilderConfig } from '../types/index.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'
import { UnknownResponseError } from './unknown-response-error.mjs'

/**
 * Handles errors that occur during HTTP requests.
 *
 * This function implements the error handling strategy based on the builder configuration:
 * - Calls `onError` callback if provided (always called first)
 * - If `useDiscriminatorResponse` is `true` and the error has a response:
 *   - If `errorSchema` is provided and has a matching status code, parse with that schema and RETURN
 *   - If `errorSchema` is provided but no match, throw `UnknownResponseError`
 *   - If no `errorSchema`, attempts to parse using `responseSchema` (existing behavior)
 * - Calls `onZodError` callback if validation fails
 * - Throws the error if it cannot be handled as a discriminated response
 *
 * @param config - Builder configuration containing error handling callbacks
 * @param error - The error that occurred (can be any type)
 * @param responseSchema - Optional Zod schema to validate error responses when
 *   `useDiscriminatorResponse` is enabled and no errorSchema match
 * @param errorSchema - Optional record mapping status codes to Zod schemas for error responses
 * @returns The parsed error response data if `useDiscriminatorResponse` is enabled
 *   and parsing succeeds, otherwise throws the error
 * @throws The original error, UnknownResponseError, or a ZodError if validation fails
 *
 * @example
 * ```ts
 * // With errorSchema
 * const result = handleError(
 *   { useDiscriminatorResponse: true },
 *   { response: { data: { error: 'Not found' }, status: 404 } },
 *   undefined,
 *   { 404: z.object({ error: z.string() }) }
 * )
 * // Returns: { error: 'Not found' }
 * ```
 */
export function handleError(
  config: BuilderConfig<boolean>,
  error: unknown,
  responseSchema?: ZodType,
  errorSchema?: ErrorSchemaRecord,
) {
  if (config.onError) {
    config.onError(error)
  }
  if (!config.useDiscriminatorResponse) {
    if (config.onZodError && error instanceof ZodError) {
      config.onZodError(error, undefined, undefined)
    }
    throw error
  }

  // Check if error has a response
  if (
    typeof error !== 'object' ||
    !error ||
    !('response' in error) ||
    !error.response
  ) {
    throw error
  }

  const response = error.response as AbstractResponse<unknown>

  // Check errorSchema first (has precedence over responseSchema)
  if (errorSchema) {
    const schema = errorSchema[response.status]
    if (schema) {
      try {
        const parsed = schema.parse(response.data) as Record<string, unknown>
        // Inject __status for runtime discrimination of error types
        return { ...parsed, __status: response.status }
      } catch (e) {
        if (config.onZodError) {
          config.onZodError(e as ZodError, response, error)
        }
        throw e
      }
    }
    // No matching status code in errorSchema - throw UnknownResponseError
    throw new UnknownResponseError(response, response.status)
  }

  // Fall back to responseSchema for discriminated unions (existing behavior)
  if (responseSchema) {
    try {
      return responseSchema.parse(response.data)
    } catch (e) {
      if (config.onZodError) {
        config.onZodError(e as ZodError, response, error)
      }
      throw e
    }
  }

  throw error
}

/**
 * @deprecated Use handleError instead. Will be removed in next major version.
 */
export const handleException = handleError
