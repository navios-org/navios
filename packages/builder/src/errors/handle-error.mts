import type { HttpMethod } from '../types/common.mjs'
import type { BuilderConfig } from '../types/index.mjs'

import { buildErrorEvent } from './build-error-event.mjs'
import { classifyError } from './classify-error.mjs'

/**
 * Handles errors that occur during HTTP requests in `result: 'data'` mode.
 *
 * - Classifies the thrown error and fires the unified `onError` event hook
 *   (if provided) with the structured {@link BuilderErrorEvent}.
 * - Always re-throws the original error.
 *
 * @param config - Builder configuration containing error handling callback
 * @param error - The error that occurred (can be any type)
 * @param endpoint - HTTP method and URL of the endpoint that produced the error
 * @throws The original error
 */
export function handleError(
  config: BuilderConfig,
  error: unknown,
  endpoint: { method: HttpMethod; url: string },
): never {
  if (config.onError) {
    const classified = classifyError(error, undefined)
    config.onError(buildErrorEvent(classified, endpoint, error))
  }
  throw error
}
