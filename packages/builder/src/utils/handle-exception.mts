import type { ZodType } from 'zod'

import { ZodError } from 'zod'

import type { AbstractResponse, BuilderConfig } from '../types.mjs'

export function handleException(
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
