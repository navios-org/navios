import { HttpException } from './http.exception.mjs'

/**
 * Exception that represents a 404 Not Found HTTP error.
 * 
 * Use this exception when the requested resource does not exist.
 * 
 * @example
 * ```typescript
 * @Endpoint(getUserEndpoint)
 * async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *   const user = await this.userService.findById(request.urlParams.userId)
 *   if (!user) {
 *     throw new NotFoundException('User not found')
 *   }
 *   return user
 * }
 * ```
 */
export class NotFoundException extends HttpException {
  /**
   * Creates a new NotFoundException.
   * 
   * @param response - Error message or response object
   * @param error - Optional underlying error for logging
   */
  constructor(
    public readonly response: string | object,
    public readonly error?: Error,
  ) {
    super(404, response, error)
  }
}
