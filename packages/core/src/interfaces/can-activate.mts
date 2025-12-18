import type { AbstractExecutionContext } from '../interfaces/index.mjs'

/**
 * Interface that guards must implement to control access to endpoints.
 * 
 * Guards are used for authentication, authorization, and request validation.
 * They are executed before the endpoint handler and can prevent the request
 * from proceeding by returning `false` or throwing an exception.
 * 
 * @example
 * ```typescript
 * @Injectable()
 * export class AuthGuard implements CanActivate {
 *   async canActivate(context: AbstractExecutionContext): Promise<boolean> {
 *     const request = context.getRequest()
 *     const token = request.headers.authorization
 *     
 *     if (!token) {
 *       throw new UnauthorizedException('Authentication required')
 *     }
 *     
 *     // Validate token
 *     return true
 *   }
 * }
 * ```
 */
export interface CanActivate {
  /**
   * Determines if the current request can proceed to the endpoint handler.
   * 
   * @param executionContext - The execution context containing request, reply, and metadata
   * @returns `true` if the request can proceed, `false` otherwise. Can also throw an exception.
   */
  canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> | boolean
}
