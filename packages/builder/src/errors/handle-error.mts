import type { ZodType } from 'zod/v4'

import { ZodError } from 'zod/v4'

import type { AbstractResponse, BuilderConfig } from '../types/index.mjs'

/**
 * Handles errors that occur during HTTP requests.
 *
 * This function implements the error handling strategy based on the builder configuration:
 * - Calls `onError` callback if provided (always called first)
 * - If `useDiscriminatorResponse` is `true` and the error has a response, attempts to parse
 *   the error response using the same `responseSchema` as success responses
 * - Calls `onZodError` callback if validation fails
 * - Throws the error if it cannot be handled as a discriminated response
 *
 * @param config - Builder configuration containing error handling callbacks
 * @param error - The error that occurred (can be any type)
 * @param responseSchema - Optional Zod schema to validate error responses when
 *   `useDiscriminatorResponse` is enabled
 * @returns The parsed error response data if `useDiscriminatorResponse` is enabled
 *   and parsing succeeds, otherwise throws the error
 * @throws The original error or a ZodError if validation fails
 *
 * @example
 * ```ts
 * // With useDiscriminatorResponse: true
 * const result = handleError(
 *   { useDiscriminatorResponse: true },
 *   { response: { data: { status: 'error', message: 'Not found' } } },
 *   z.discriminatedUnion('status', [
 *     z.object({ status: z.literal('success'), data: z.any() }),
 *     z.object({ status: z.literal('error'), message: z.string() })
 *   ])
 * )
 * // Returns: { status: 'error', message: 'Not found' }
 * ```
 */
export function handleError(
  config: BuilderConfig,
  error: unknown,
  responseSchema?: ZodType,
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
  if (
    responseSchema &&
    typeof error === 'object' &&
    error &&
    'response' in error &&
    error.response
  ) {
    const response = error.response as AbstractResponse<any>
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
