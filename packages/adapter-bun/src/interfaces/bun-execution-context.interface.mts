import type {
  AbstractExecutionContext,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'

/**
 * Execution context for Bun adapter requests.
 *
 * This class provides access to metadata about the current request's
 * module, controller, handler, and request object. It's used by guards,
 * interceptors, and other request-scoped services to access context
 * information.
 *
 * @implements {AbstractExecutionContext}
 *
 * @example
 * ```ts
 * @Injectable()
 * class AuthGuard implements CanActivate {
 *   canActivate(context: BunExecutionContext): boolean {
 *     const request = context.getRequest()
 *     const handler = context.getHandler()
 *     // Check authentication based on handler metadata
 *     return true
 *   }
 * }
 * ```
 */
export class BunExecutionContext implements AbstractExecutionContext {
  constructor(
    private readonly module: ModuleMetadata,
    private readonly controller: ControllerMetadata,
    private readonly handler: HandlerMetadata,
    private readonly request: Request,
  ) {}

  /**
   * Gets the module metadata for the current request.
   *
   * @returns The module metadata containing module configuration and dependencies.
   */
  getModule(): ModuleMetadata {
    return this.module
  }

  /**
   * Gets the controller metadata for the current request.
   *
   * @returns The controller metadata containing controller configuration.
   */
  getController(): ControllerMetadata {
    return this.controller
  }

  /**
   * Gets the handler metadata for the current request.
   *
   * @returns The handler metadata containing endpoint configuration, schemas, and method information.
   */
  getHandler(): HandlerMetadata {
    return this.handler
  }

  /**
   * Gets the current HTTP request object.
   *
   * @returns The Bun Request object for the current request.
   * @throws {Error} If the request is not set.
   */
  getRequest(): Request {
    if (!this.request) {
      throw new Error(
        '[Navios] Request is not set. Make sure to set it before using it.',
      )
    }
    return this.request
  }

  /**
   * Gets the reply object (not available in Bun adapter).
   *
   * Bun uses the standard Web API Response object instead of a custom reply interface.
   * Use `getRequest()` and return a `Response` object from your handlers instead.
   *
   * @throws {Error} Always throws, as reply is not available in Bun adapter.
   */
  getReply(): never {
    throw new Error('[Navios] Reply is not available in Bun adapter.')
  }
}
