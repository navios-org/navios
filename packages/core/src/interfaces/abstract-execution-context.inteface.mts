import type { ControllerMetadata, HandlerMetadata, ModuleMetadata } from '../metadata/index.mjs'

/**
 * Interface providing access to the execution context during request handling.
 *
 * The execution context provides access to metadata and request/reply objects
 * for the current request. It is available in guards and can be injected into
 * services if needed.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class AuthGuard implements CanActivate {
 *   async canActivate(context: AbstractExecutionContext): Promise<boolean> {
 *     const request = context.getRequest()
 *     const handler = context.getHandler()
 *     // Access request and handler metadata
 *     return true
 *   }
 * }
 * ```
 */
export interface AbstractExecutionContext {
  /**
   * Gets the metadata for the module containing the current endpoint.
   */
  getModule(): ModuleMetadata
  /**
   * Gets the metadata for the controller containing the current endpoint.
   */
  getController(): ControllerMetadata
  /**
   * Gets the metadata for the current endpoint handler.
   */
  getHandler(): HandlerMetadata
  /**
   * Gets the HTTP request object (adapter-specific).
   */
  getRequest(): any
  /**
   * Gets the HTTP reply object (adapter-specific).
   */
  getReply(): any
}
