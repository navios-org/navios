import { Injectable } from '@navios/di'

import { NotFoundResponderToken } from '../tokens/responder.tokens.mjs'

import type { ErrorResponder } from '../interfaces/error-responder.interface.mjs'
import type { ErrorResponse } from '../interfaces/error-response.interface.mjs'

/**
 * Default responder for not found errors (HTTP 404).
 *
 * Converts errors to RFC 7807 Problem Details format.
 * Registered with low priority (-10) so it can be easily overridden.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: NotFoundResponderToken,
 *   priority: 0,
 * })
 * export class CustomNotFoundResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     return {
 *       statusCode: 404,
 *       payload: {
 *         type: 'https://api.myapp.com/errors/not-found',
 *         title: 'Resource Not Found',
 *         status: 404,
 *         detail: description ?? 'The requested resource was not found',
 *       },
 *       headers: { 'Content-Type': 'application/problem+json' },
 *     }
 *   }
 * }
 * ```
 */
@Injectable({
  token: NotFoundResponderToken,
  priority: -10,
})
export class NotFoundResponderService implements ErrorResponder {
  getResponse(error: unknown, description?: string): ErrorResponse {
    // Explicit description takes priority
    if (description) {
      return this.createResponse(description)
    }

    // Try to extract detail from error with a response property (like NotFoundException)
    if (error && typeof error === 'object' && 'response' in error && error.response) {
      if (typeof error.response === 'string') {
        return this.createResponse(error.response)
      }
    }

    // Default message
    return this.createResponse('The requested resource was not found')
  }

  private createResponse(detail: string): ErrorResponse {
    return {
      statusCode: 404,
      payload: {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail,
      },
      headers: {
        'Content-Type': 'application/problem+json',
      },
    }
  }
}
