import { Injectable } from '@navios/di'

import type { ErrorResponder } from '../interfaces/error-responder.interface.mjs'
import type { ErrorResponse } from '../interfaces/error-response.interface.mjs'
import { InternalServerErrorResponderToken } from '../tokens/responder.tokens.mjs'

/**
 * Default responder for internal server errors (HTTP 500).
 *
 * Converts generic errors to RFC 7807 Problem Details format.
 * Registered with low priority (-10) so it can be easily overridden.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: InternalServerErrorResponderToken,
 *   priority: 0,
 * })
 * export class CustomInternalErrorResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     return {
 *       statusCode: 500,
 *       payload: {
 *         type: 'https://api.myapp.com/errors/server-error',
 *         title: 'Server Error',
 *         status: 500,
 *         detail: description ?? 'An unexpected error occurred',
 *       },
 *       headers: { 'Content-Type': 'application/problem+json' },
 *     }
 *   }
 * }
 * ```
 */
@Injectable({
  token: InternalServerErrorResponderToken,
  priority: -10,
})
export class InternalServerErrorResponderService implements ErrorResponder {
  getResponse(error: unknown, description?: string): ErrorResponse {
    const message =
      error instanceof Error ? error.message : 'Internal Server Error'

    return {
      statusCode: 500,
      payload: {
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: description ?? message,
      },
      headers: {
        'Content-Type': 'application/problem+json',
      },
    }
  }
}
