import { inject, Injectable } from '@navios/di'

import { FrameworkError } from '../enums/framework-error.enum.mjs'
import type { ErrorResponse } from '../interfaces/error-response.interface.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../tokens/responder.tokens.mjs'

/**
 * Service for producing standardized error responses.
 *
 * This service coordinates error responders to produce RFC 7807 compliant
 * Problem Details responses. Adapters use this service to convert errors
 * into standardized HTTP responses.
 *
 * The caller explicitly specifies which type of error response to produce
 * via the FrameworkError enum, giving full control to the adapter.
 *
 * @example Usage in an adapter:
 * ```typescript
 * @Injectable()
 * class MyAdapter {
 *   private errorProducer = inject(ErrorResponseProducerService)
 *
 *   handleError(error: unknown): Response {
 *     if (error instanceof ZodError) {
 *       const response = this.errorProducer.respond(
 *         FrameworkError.ValidationError,
 *         error,
 *       )
 *       return new Response(JSON.stringify(response.payload), {
 *         status: response.statusCode,
 *         headers: response.headers,
 *       })
 *     }
 *
 *     // Fallback for unknown errors
 *     const response = this.errorProducer.handleUnknown(error)
 *     return new Response(JSON.stringify(response.payload), {
 *       status: response.statusCode,
 *       headers: response.headers,
 *     })
 *   }
 * }
 * ```
 */
@Injectable()
export class ErrorResponseProducerService {
  private readonly forbiddenResponder = inject(ForbiddenResponderToken)
  private readonly internalServerErrorResponder = inject(
    InternalServerErrorResponderToken,
  )
  private readonly notFoundResponder = inject(NotFoundResponderToken)
  private readonly validationErrorResponder = inject(
    ValidationErrorResponderToken,
  )

  /**
   * Produces an error response for a specific framework error type.
   *
   * @param type - The type of framework error (from FrameworkError enum)
   * @param error - The original error that was thrown
   * @param description - Optional custom description to include in the response
   * @returns ErrorResponse with status code, RFC 7807 payload, and headers
   */
  respond(
    type: FrameworkError,
    error: unknown,
    description?: string,
  ): ErrorResponse {
    switch (type) {
      case FrameworkError.NotFound:
        return this.notFoundResponder.getResponse(error, description)
      case FrameworkError.Forbidden:
        return this.forbiddenResponder.getResponse(error, description)
      case FrameworkError.InternalServerError:
        return this.internalServerErrorResponder.getResponse(error, description)
      case FrameworkError.ValidationError:
        return this.validationErrorResponder.getResponse(error, description)
    }
  }

  /**
   * Handles unknown errors by producing an Internal Server Error response.
   *
   * Use this as a fallback when the error type is not known or doesn't
   * match any specific framework error type.
   *
   * @param error - The original error that was thrown
   * @param description - Optional custom description to include in the response
   * @returns ErrorResponse with 500 status code
   */
  handleUnknown(error: unknown, description?: string): ErrorResponse {
    return this.internalServerErrorResponder.getResponse(error, description)
  }

  /**
   * Convenience method to produce a Not Found error response.
   *
   * @param error - The original error that was thrown
   * @param description - Optional custom description
   * @returns ErrorResponse with 404 status code
   */
  notFound(error: unknown, description?: string): ErrorResponse {
    return this.notFoundResponder.getResponse(error, description)
  }

  /**
   * Convenience method to produce a Validation Error response.
   *
   * @param error - The original error (typically a ZodError)
   * @param description - Optional custom description
   * @returns ErrorResponse with 400 status code
   */
  validationError(error: unknown, description?: string): ErrorResponse {
    return this.validationErrorResponder.getResponse(error, description)
  }

  /**
   * Convenience method to produce an Internal Server Error response.
   *
   * @param error - The original error
   * @param description - Optional custom description
   * @returns ErrorResponse with 500 status code
   */
  internalServerError(error: unknown, description?: string): ErrorResponse {
    return this.internalServerErrorResponder.getResponse(error, description)
  }

  /**
   * Convenience method to produce a Forbidden error response.
   *
   * @param error - The original error
   * @param description - Optional custom description
   * @returns ErrorResponse with 403 status code
   */
  forbidden(error: unknown, description?: string): ErrorResponse {
    return this.forbiddenResponder.getResponse(error, description)
  }
}
