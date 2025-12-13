import type { ZodType } from 'zod/v4'

import { ZodError } from 'zod/v4'

import type { AbstractResponse, BuilderConfig } from '../types/index.mjs'

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
