import type { ZodType } from 'zod'

import { NaviosError } from 'navios'

import { ZodError, ZodObject } from 'zod'

import type { DeclareAPIConfig } from '../types.mjs'

export function handleException(
  config: DeclareAPIConfig,
  error: unknown,
  responseSchema: ZodType,
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
  if (error instanceof NaviosError && error.response) {
    try {
      if (config.useWholeResponse) {
        return responseSchema.parse(error.response)
      }
      return responseSchema.parse(error.response.data)
    } catch (e) {
      if (config.onZodError) {
        config.onZodError(e as ZodError, error.response, error)
      }
      throw e
    }
  }
  throw error
}
