import { InjectionToken } from '@navios/di'

import type { ErrorResponder } from '../interfaces/error-responder.interface.mjs'

/**
 * Injection token for the Internal Server Error responder.
 * Default implementation returns HTTP 500 with RFC 7807 Problem Details.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: InternalServerErrorResponderToken,
 *   priority: 0, // Higher than default -10
 * })
 * export class CustomInternalErrorResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     // Custom implementation
 *   }
 * }
 * ```
 */
export const InternalServerErrorResponderToken =
  InjectionToken.create<ErrorResponder>('InternalServerErrorResponder')

/**
 * Injection token for the Not Found responder.
 * Default implementation returns HTTP 404 with RFC 7807 Problem Details.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: NotFoundResponderToken,
 *   priority: 0, // Higher than default -10
 * })
 * export class CustomNotFoundResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     // Custom implementation
 *   }
 * }
 * ```
 */
export const NotFoundResponderToken =
  InjectionToken.create<ErrorResponder>('NotFoundResponder')

/**
 * Injection token for the Validation Error responder.
 * Default implementation returns HTTP 400 with RFC 7807 Problem Details
 * and includes validation errors from ZodError.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: ValidationErrorResponderToken,
 *   priority: 0, // Higher than default -10
 * })
 * export class CustomValidationResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     // Custom implementation
 *   }
 * }
 * ```
 */
export const ValidationErrorResponderToken =
  InjectionToken.create<ErrorResponder>('ValidationErrorResponder')

/**
 * Injection token for the Forbidden responder.
 * Default implementation returns HTTP 403 with RFC 7807 Problem Details.
 *
 * @example Override with custom implementation:
 * ```typescript
 * @Injectable({
 *   token: ForbiddenResponderToken,
 *   priority: 0, // Higher than default -10
 * })
 * export class CustomForbiddenResponder implements ErrorResponder {
 *   getResponse(error: unknown, description?: string): ErrorResponse {
 *     // Custom implementation
 *   }
 * }
 * ```
 */
export const ForbiddenResponderToken =
  InjectionToken.create<ErrorResponder>('ForbiddenResponder')
