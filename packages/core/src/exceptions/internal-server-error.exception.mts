import { HttpException } from './http.exception.mjs'

/**
 * Exception that represents a 500 Internal Server Error HTTP error.
 *
 * Use this exception when an unexpected error occurs on the server.
 * Generally, you should let unhandled errors bubble up rather than catching
 * and rethrowing as InternalServerErrorException, as Navios will handle them appropriately.
 *
 * @example
 * ```typescript
 * @Endpoint(processPaymentEndpoint)
 * async processPayment(request: EndpointParams<typeof processPaymentEndpoint>) {
 *   try {
 *     return await this.paymentService.process(request.data)
 *   } catch (error) {
 *     this.logger.error('Payment processing failed', error)
 *     throw new InternalServerErrorException('Payment processing failed', error)
 *   }
 * }
 * ```
 */
export class InternalServerErrorException extends HttpException {
  /**
   * Creates a new InternalServerErrorException.
   *
   * @param message - Error message or response object
   * @param error - Optional underlying error for logging
   */
  constructor(message: string | object, error?: Error) {
    super(500, message, error)
  }
}
