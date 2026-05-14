import { ZodError } from 'zod/v4'

import type { BuilderConfig } from '../types/index.mjs'

/**
 * Handles errors that occur during HTTP requests in `result: 'data'` mode.
 *
 * - Calls `onError` callback if provided.
 * - Calls `onZodError` callback if the error is a {@link ZodError}.
 * - Always re-throws the original error.
 *
 * @param config - Builder configuration containing error handling callbacks
 * @param error - The error that occurred (can be any type)
 * @throws The original error
 */
export function handleError(config: BuilderConfig, error: unknown): never {
  if (config.onError) {
    config.onError(error)
  }
  if (config.onZodError && error instanceof ZodError) {
    config.onZodError(error, undefined, undefined)
  }
  throw error
}
