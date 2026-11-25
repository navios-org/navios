import jwt from 'jsonwebtoken'

/**
 * Error thrown when a JWT token has expired.
 *
 * This error is thrown by `verify()` and `verifyAsync()` when the token's
 * expiration time (exp claim) has passed.
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
export const TokenExpiredError = jwt.TokenExpiredError
// The type of an instance, so the name works in type positions as well.
export type TokenExpiredError = jwt.TokenExpiredError

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
export const NotBeforeError = jwt.NotBeforeError
// The type of an instance, so the name works in type positions as well.
export type NotBeforeError = jwt.NotBeforeError

/**
 * Base error class for JWT-related errors.
 *
 * This is the base class for all JWT errors including `TokenExpiredError`
 * and `NotBeforeError`. It's thrown for invalid or malformed tokens.
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
export const JsonWebTokenError = jwt.JsonWebTokenError
// The type of an instance, so the name works in type positions as well.
export type JsonWebTokenError = jwt.JsonWebTokenError
