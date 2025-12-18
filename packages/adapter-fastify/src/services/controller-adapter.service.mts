import type {
  ClassType,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
  ScopedContainer,
} from '@navios/core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

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

import type { FastifyHandlerAdapterInterface } from '../adapters/index.mjs'

import { FastifyExecutionContext } from '../interfaces/index.mjs'
import { FastifyReplyToken, FastifyRequestToken } from '../tokens/index.mjs'

/**
 * Service responsible for adapting Navios controllers to Fastify route handlers.
 *
 * This service processes controller metadata, sets up route handlers with
 * Fastify's routing system, integrates with guards, and handles request/response
 * lifecycle. It bridges the gap between Navios's controller decorators and
 * Fastify's native routing system, including schema-based route registration.
 *
 * @example
 * ```ts
 * // This service is used automatically by the Fastify adapter
 * // Controllers are automatically registered when modules are initialized
 * @Module({
 *   controllers: [UserController],
 * })
 * class AppModule {}
 * ```
 */
@Injectable()
export class FastifyControllerAdapterService {
  private guardRunner = inject(GuardRunnerService)
  private container = inject(Container)
  private logger = inject(Logger, {
    context: FastifyControllerAdapterService.name,
  })

  /**
   * Sets up route handlers for a controller.
   *
   * This method processes all endpoints defined in a controller, creates
   * appropriate route handlers using the configured adapter services,
   * and registers them with Fastify's routing system. Routes with schemas
   * are registered with Fastify's type provider for enhanced type safety.
   *
   * @param controller - The controller class to set up.
   * @param instance - The Fastify instance to register routes on.
   * @param moduleMetadata - Metadata about the module containing the controller.
   *
   * @throws {Error} If an endpoint is malformed (missing URL or adapter token).
   */
  async setupController(
    controller: ClassType,
    instance: FastifyInstance,
    moduleMetadata: ModuleMetadata,
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
        adapterToken as InjectionToken<FastifyHandlerAdapterInterface>,
      )
      const hasSchema = adapter.hasSchema?.(endpoint) ?? false
      if (hasSchema) {
        instance.withTypeProvider<ZodTypeProvider>().route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          schema: adapter.provideSchema?.(endpoint) ?? {},
          handler: this.wrapHandler(
            adapter.provideHandler(controller, endpoint),
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
        })
      } else {
        instance.route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          handler: this.wrapHandler(
            adapter.provideHandler(controller, endpoint),
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
        })
      }

      this.logger.debug(
        `Registered ${httpMethod} ${url} for ${controller.name}:${classMethod}`,
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
   * @returns A wrapped handler function that can be registered with Fastify.
   * @private
   */
  private wrapHandler(
    handler: (
      context: ScopedContainer,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<any>,
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const executionContext = new FastifyExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
        request,
        reply,
      )
      const requestId = crypto.randomUUID()
      const requestContainer = this.container.beginRequest(requestId)
      requestContainer.addInstance(FastifyRequestToken, request)
      requestContainer.addInstance(FastifyReplyToken, reply)
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
              return reply.status(403).send({ message: 'Forbidden' })
            }
          }

          const response = await handler(requestContainer, request, reply)
          return response
        })
      } catch (error) {
        // Handle errors
        if (error instanceof HttpException) {
          return reply.status(error.statusCode).send(error.response)
        } else {
          const err = error as Error
          this.logger.error(`Error: ${err.message}`, err)
          return reply.status(500).send({
            statusCode: 500,
            message: err.message || 'Internal Server Error',
            error: 'InternalServerError',
          })
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
