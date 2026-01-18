import type {
  AbstractExecutionContext,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Execution context for Fastify adapter requests.
 *
 * This class provides access to metadata about the current request's
 * module, controller, handler, request, and reply objects. It's used by guards,
 * interceptors, and other request-scoped services to access context
 * information and interact with Fastify's request/reply objects.
 *
 * @implements {AbstractExecutionContext}
 *
 * @example
 * ```ts
 * @Injectable()
 * class AuthGuard implements CanActivate {
 *   canActivate(context: FastifyExecutionContext): boolean {
 *     const request = context.getRequest()
 *     const reply = context.getReply()
 *     const handler = context.getHandler()
 *     // Check authentication based on handler metadata
 *     return true
 *   }
 * }
 * ```
 */
export class FastifyExecutionContext implements AbstractExecutionContext {
  constructor(
    private readonly module: ModuleMetadata,
    private readonly controller: ControllerMetadata,
    private readonly handler: HandlerMetadata,
    private readonly request: FastifyRequest,
    private readonly reply: FastifyReply,
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
   * Gets the current Fastify request object.
   *
   * @returns The Fastify request object for the current request.
   * @throws {Error} If the request is not set.
   */
  getRequest(): FastifyRequest {
    if (!this.request) {
      throw new Error('[Navios] Request is not set. Make sure to set it before using it.')
    }
    return this.request
  }

  /**
   * Gets the current Fastify reply object.
   *
   * The reply object provides methods for sending responses, setting headers,
   * and controlling the response stream.
   *
   * @returns The Fastify reply object for the current request.
   * @throws {Error} If the reply is not set.
   */
  getReply(): FastifyReply {
    if (!this.reply) {
      throw new Error('[Navios] Reply is not set. Make sure to set it before using it.')
    }
    return this.reply
  }
}
