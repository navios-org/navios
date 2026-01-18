import { Injectable } from '@navios/di'
import { treeifyError, ZodError } from 'zod/v4'

import { ValidationErrorResponderToken } from '../tokens/responder.tokens.mjs'

import type { ErrorResponder } from '../interfaces/error-responder.interface.mjs'
import type { ErrorResponse } from '../interfaces/error-response.interface.mjs'

/**
 * Default responder for validation errors (HTTP 400).
 *
 * Converts Zod validation errors to RFC 7807 Problem Details format.
 * Includes the structured validation errors from treeifyError.
 * Registered with low priority (-10) so it can be easily overridden.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: ValidationErrorResponderToken,
 *   priority: 0,
 * })
 * export class CustomValidationResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     const zodError = error as ZodError
 *     return {
 *       statusCode: 422, // Use 422 instead of 400
 *       payload: {
 *         type: 'https://api.myapp.com/errors/validation',
 *         title: 'Unprocessable Entity',
 *         status: 422,
 *         detail: description ?? 'Validation failed',
 *         issues: zodError.issues,
 *       },
 *       headers: { 'Content-Type': 'application/problem+json' },
 *     }
 *   }
 * }
 * ```
 */
@Injectable({
  token: ValidationErrorResponderToken,
  priority: -10,
})
export class ValidationErrorResponderService implements ErrorResponder {
  getResponse(error: unknown, description?: string): ErrorResponse {
    // Handle ZodError specifically
    if (error instanceof ZodError) {
      return {
        statusCode: 400,
        payload: {
          type: 'about:blank',
          title: 'Validation Error',
          status: 400,
          detail: description ?? 'Request validation failed',
          errors: treeifyError(error),
        },
        headers: {
          'Content-Type': 'application/problem+json',
        },
      }
    }

    // Fallback for non-Zod validation errors
    return {
      statusCode: 400,
      payload: {
        type: 'about:blank',
        title: 'Validation Error',
        status: 400,
        detail: description ?? (error instanceof Error ? error.message : 'Validation failed'),
      },
      headers: {
        'Content-Type': 'application/problem+json',
      },
    }
  }
}
