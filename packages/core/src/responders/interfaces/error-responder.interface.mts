import type { ErrorResponse } from './error-response.interface.mjs'

/**
 * Interface for error responders that convert errors to HTTP responses.
 * Each responder handles a specific type of framework error and produces
 * an RFC 7807 compliant response.
 *
 * Implementations are registered with low priority (-10) so they can be
 * easily overridden by consumers.
 *
 * @example
 * ```typescript
 * @Injectable({
 *   token: InternalServerErrorResponderToken,
 *   priority: 0, // Override default implementation
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
export interface ErrorResponder {
  /**
   * Converts an error to an ErrorResponse with RFC 7807 Problem Details.
   *
   * @param error - The original error that was thrown
   * @param description - Optional custom description to include in the response
   * @returns ErrorResponse with status code, payload, and headers
   */
  getResponse(error: unknown, description?: string): ErrorResponse
}
