import type {
  ClassType,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
  ScopedContainer,
} from '@navios/core'
import type { BunRequest } from 'bun'

import {
  Container,
  ExecutionContext,
  extractControllerMetadata,
  GuardRunnerService,
  HttpException,
  inject,
  Injectable,
  InjectionToken,
  Logger,
  runWithRequestId,
} from '@navios/core'

import type { BunHandlerAdapterInterface } from '../adapters/index.mjs'

import { BunExecutionContext } from '../interfaces/index.mjs'
import { BunRequestToken } from '../tokens/index.mjs'

/**
 * Type definition for Bun route mappings.
 *
 * Maps route paths to HTTP method handlers. Each route path can have
 * multiple HTTP methods (GET, POST, PUT, DELETE, etc.) associated with it.
 */
export type BunRoutes = Record<
  string,
  { [method: string]: (req: BunRequest) => Response | Promise<Response> }
>

/**
 * Service responsible for adapting Navios controllers to Bun route handlers.
 *
 * This service processes controller metadata, sets up route handlers,
 * integrates with guards, and handles request/response lifecycle. It
 * bridges the gap between Navios's controller decorators and Bun's
 * native routing system.
 *
 * @example
 * ```ts
 * // This service is used automatically by the Bun adapter
 * // Controllers are automatically registered when modules are initialized
 * @Module({
 *   controllers: [UserController],
 * })
 * class AppModule {}
 * ```
 */
@Injectable()
export class BunControllerAdapterService {
  private guardRunner = inject(GuardRunnerService)
  private container = inject(Container)
  private logger = inject(Logger, {
    context: BunControllerAdapterService.name,
  })

  /**
   * Sets up route handlers for a controller.
   *
   * This method processes all endpoints defined in a controller, creates
   * appropriate route handlers using the configured adapter services,
   * and registers them with Bun's routing system.
   *
   * @param controller - The controller class to set up.
   * @param routes - The routes object to populate with handlers.
   * @param moduleMetadata - Metadata about the module containing the controller.
   * @param globalPrefix - The global prefix to prepend to all routes.
   *
   * @throws {Error} If an endpoint is malformed (missing URL or adapter token).
   */
  async setupController(
    controller: ClassType,
    routes: BunRoutes,
    moduleMetadata: ModuleMetadata,
    globalPrefix: string,
  ) {
    const controllerMetadata = extractControllerMetadata(controller)
    for (const endpoint of controllerMetadata.endpoints) {
      const { classMethod, url, httpMethod, adapterToken } = endpoint

      if (!url || !adapterToken) {
        throw new Error(
          `[Navios] Malformed Endpoint ${controller.name}:${classMethod}`,
        )
      }
      const adapter = await this.container.get(
        adapterToken as InjectionToken<BunHandlerAdapterInterface>,
      )
      const fullUrl = globalPrefix + url.replaceAll('$', ':')
      if (!routes[fullUrl]) {
        routes[fullUrl] = {}
      }
      routes[fullUrl][httpMethod] = this.wrapHandler(
        adapter.provideHandler(controller, endpoint),
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )

      this.logger.debug(
        `Registered ${httpMethod} ${fullUrl} for ${controller.name}:${classMethod}`,
      )
    }
  }

  /**
   * Wraps a route handler with request context, guards, and error handling.
   *
   * This method creates a complete request handler that:
   * 1. Creates a request-scoped container
   * 2. Sets up execution context
   * 3. Runs guards before executing the handler
   * 4. Handles errors and converts them to appropriate HTTP responses
   * 5. Cleans up request context after handling
   *
   * @param handler - The base handler function from the adapter service.
   * @param moduleMetadata - Metadata about the module.
   * @param controllerMetadata - Metadata about the controller.
   * @param endpoint - Metadata about the endpoint handler.
   * @returns A wrapped handler function that can be registered with Bun.
   * @private
   */
  private wrapHandler(
    handler: (
      context: ScopedContainer,
      request: BunRequest,
    ) => Promise<Response>,
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ) {
    return async (request: BunRequest) => {
      const executionContext = new BunExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
        request,
      )
      const requestId = crypto.randomUUID()
      const requestContainer = this.container.beginRequest(requestId)
      requestContainer.addInstance(BunRequestToken, request)
      requestContainer.addInstance(ExecutionContext, executionContext)

      try {
        return await runWithRequestId(requestId, async () => {
          // Run guards
          const guards = this.guardRunner.makeContext(
            moduleMetadata,
            controllerMetadata,
            endpoint,
          )
          if (guards.size > 0) {
            const canActivate = await this.guardRunner.runGuards(
              guards,
              executionContext,
              requestContainer,
            )
            if (!canActivate) {
              return new Response('Forbidden', { status: 403 })
            }
          }

          const response = await handler(requestContainer, request)
          return response
        })
      } catch (error) {
        // Handle errors
        if (error instanceof HttpException) {
          return new Response(JSON.stringify(error.response), {
            status: error.statusCode,
            headers: { 'Content-Type': 'application/json' },
          })
        } else {
          const err = error as Error
          this.logger.error(`Error: ${err.message}`, err)
          return new Response(
            JSON.stringify({
              statusCode: 500,
              message: err.message || 'Internal Server Error',
              error: 'InternalServerError',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      } finally {
        requestContainer.endRequest().catch((err: any) => {
          this.logger.error(
            `Error ending request context ${requestId}: ${err.message}`,
            err,
          )
        })
      }
    }
  }
}
