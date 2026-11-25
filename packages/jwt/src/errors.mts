/**
 * Error thrown when a token cannot be trusted.
 *
 * Thrown by `verify()` and `verifyAsync()` for a malformed token, a wrong signature, an
 * algorithm that is not accepted, an unknown key, or a claim that does not match. It is the
 * base class of `TokenExpiredError` and `NotBeforeError`. A wrong configuration is never
 * reported with this class.
 *
 * @example
 * ```ts
 * try {
 *   jwtService.verify(token)
 * } catch (error) {
 *   if (error instanceof JsonWebTokenError) {
 *     console.error('JWT error:', error.message)
 *   }
 * }
 * ```
 */
export class JsonWebTokenError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'JsonWebTokenError'
  }
}

/**
 * Error thrown when a JWT token has expired.
 *
 * This error is thrown by `verify()` and `verifyAsync()` when the token's
 * expiration time (exp claim) has passed or the token is older than `maxAge`.
 *
 * @example
 * ```ts
 * try {
 *   jwtService.verify(token)
 * } catch (error) {
 *   if (error instanceof TokenExpiredError) {
 *     console.error('Token expired at:', error.expiredAt)
 *   }
 * }
 * ```
 */
export class TokenExpiredError extends JsonWebTokenError {
  constructor(
    message: string,
    public readonly expiredAt: Date,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TokenExpiredError'
  }
}

/**
 * Error thrown when a JWT token is not yet valid.
 *
 * This error is thrown by `verify()` and `verifyAsync()` when the token's
 * "not before" time (nbf claim) is in the future.
 *
 * @example
 * ```ts
 * try {
 *   jwtService.verify(token)
 * } catch (error) {
 *   if (error instanceof NotBeforeError) {
 *     console.error('Token not valid until:', error.date)
 *   }
 * }
 * ```
 */
export class NotBeforeError extends JsonWebTokenError {
  constructor(
    message: string,
    public readonly date: Date,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'NotBeforeError'
  }
}
