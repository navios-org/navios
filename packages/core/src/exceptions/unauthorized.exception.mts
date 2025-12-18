import { HttpException } from './http.exception.mjs'

/**
 * Exception that represents a 401 Unauthorized HTTP error.
 * 
 * Use this exception when the client is not authenticated or authentication failed.
 * 
 * @example
 * ```typescript
 * @Endpoint(getUserEndpoint)
 * @UseGuards(AuthGuard)
 * async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *   if (!request.headers.authorization) {
 *     throw new UnauthorizedException('Authentication required')
 *   }
 *   // ...
 * }
 * ```
 */
export class UnauthorizedException extends HttpException {
  /**
   * Creates a new UnauthorizedException.
   * 
   * @param message - Error message or response object
   * @param error - Optional underlying error for logging
   */
  constructor(message: string | object, error?: Error) {
    super(401, message, error)
  }
}
