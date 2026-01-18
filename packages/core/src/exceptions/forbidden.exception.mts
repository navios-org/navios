import { HttpException } from './http.exception.mjs'

/**
 * Exception that represents a 403 Forbidden HTTP error.
 *
 * Use this exception when the client is authenticated but does not have
 * permission to access the requested resource.
 *
 * @example
 * ```typescript
 * @Endpoint(deleteUserEndpoint)
 * @UseGuards(AuthGuard, RoleGuard)
 * async deleteUser(request: EndpointParams<typeof deleteUserEndpoint>) {
 *   if (!this.userService.hasPermission(request.user, 'delete')) {
 *     throw new ForbiddenException('Insufficient permissions')
 *   }
 *   // ...
 * }
 * ```
 */
export class ForbiddenException extends HttpException {
  /**
   * Creates a new ForbiddenException.
   *
   * @param message - Error message
   */
  constructor(message: string) {
    super(403, message)
  }
}
