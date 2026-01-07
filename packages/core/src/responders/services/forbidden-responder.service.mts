import { Injectable } from '@navios/di'

import type { ErrorResponder } from '../interfaces/error-responder.interface.mjs'
import type { ErrorResponse } from '../interfaces/error-response.interface.mjs'
import { ForbiddenResponderToken } from '../tokens/responder.tokens.mjs'

/**
 * Default responder for forbidden errors (HTTP 403).
 *
 * Converts errors to RFC 7807 Problem Details format.
 * Used when access to a resource is denied (e.g., guard rejection).
 * Registered with low priority (-10) so it can be easily overridden.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: ForbiddenResponderToken,
 *   priority: 0,
 * })
 * export class CustomForbiddenResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     return {
 *       statusCode: 403,
 *       payload: {
 *         type: 'https://api.myapp.com/errors/forbidden',
 *         title: 'Access Denied',
 *         status: 403,
 *         detail: description ?? 'You do not have permission to access this resource',
 *       },
 *       headers: { 'Content-Type': 'application/problem+json' },
 *     }
 *   }
 * }
 * ```
 */
@Injectable({
  token: ForbiddenResponderToken,
  priority: -10,
})
export class ForbiddenResponderService implements ErrorResponder {
  getResponse(error: unknown, description?: string): ErrorResponse {
    // Explicit description takes priority
    if (description) {
      return this.createResponse(description)
    }

    // Try to extract detail from error with a response property (like ForbiddenException)
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response
    ) {
      if (typeof error.response === 'string') {
        return this.createResponse(error.response)
      }
    }

    // Default message
    return this.createResponse('Access to this resource is forbidden')
  }

  private createResponse(detail: string): ErrorResponse {
    return {
      statusCode: 403,
      payload: {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail,
      },
      headers: {
        'Content-Type': 'application/problem+json',
      },
    }
  }
}
