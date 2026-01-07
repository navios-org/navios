/**
 * Enumeration of framework-level error types.
 * Used to explicitly specify which error responder should handle an error.
 *
 * @example
 * ```typescript
 * // In adapter error handling
 * if (error instanceof ZodError) {
 *   return errorProducer.respond(FrameworkError.ValidationError, error)
 * }
 * return errorProducer.handleUnknown(error)
 * ```
 */
export enum FrameworkError {
  /**
   * Resource not found (HTTP 404).
   * Use when a requested resource does not exist.
   */
  NotFound = 'NotFound',

  /**
   * Forbidden (HTTP 403).
   * Use when access to a resource is denied (e.g., guard rejection).
   */
  Forbidden = 'Forbidden',

  /**
   * Internal server error (HTTP 500).
   * Use for unexpected errors that don't fit other categories.
   */
  InternalServerError = 'InternalServerError',

  /**
   * Validation error (HTTP 400).
   * Use when request data fails validation (e.g., Zod errors).
   */
  ValidationError = 'ValidationError',
}
