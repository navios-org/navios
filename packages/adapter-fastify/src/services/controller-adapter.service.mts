import type {
  CanActivate,
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
  InstanceResolverService,
  Logger,
  runWithRequestId,
} from '@navios/core'

import type {
  FastifyDynamicHandler,
  FastifyHandlerAdapterInterface,
  FastifyHandlerResult,
  FastifyStaticHandler,
} from '../adapters/index.mjs'

import { FastifyExecutionContext } from '../interfaces/index.mjs'
import { FastifyReplyToken, FastifyRequestToken } from '../tokens/index.mjs'

import '../types/fastify.mjs'

type PreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>
type RouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<any>

interface RouteHandlers {
  preHandler?: PreHandler
  handler: RouteHandler
}

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
  private instanceResolver = inject(InstanceResolverService)
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

      // Pre-resolve guards (reversed order: module → controller → endpoint)
      const guards = this.guardRunner.makeContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )
      const guardResolution =
        await this.instanceResolver.resolveMany<CanActivate>(
          Array.from(guards).reverse() as ClassType[],
        )

      const hasSchema = adapter.hasSchema?.(endpoint) ?? false
      const handlerResult = await adapter.provideHandler(controller, endpoint)
      const { preHandler, handler } = this.wrapHandler(
        handlerResult,
        guardResolution,
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )

      if (hasSchema) {
        instance.withTypeProvider<ZodTypeProvider>().route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          schema: adapter.provideSchema?.(endpoint) ?? {},
          preHandler,
          handler,
        })
      } else {
        instance.route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          preHandler,
          handler,
        })
      }

      this.logger.debug(
        `Registered ${httpMethod} ${url} for ${controller.name}:${classMethod}`,
      )
    }
  }

  /**
   * Creates a scoped container and attaches it to the request.
   * Used when handler or guards need request-scoped resolution.
   * @private
   */
  private createRequestContainer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): ScopedContainer {
    const container = this.container.beginRequest(request.id)
    request.scopedContainer = container
    container.addInstance(FastifyRequestToken, request)
    container.addInstance(FastifyReplyToken, reply)
    return container
  }

  /**
   * Creates execution context and optionally adds it to container.
   * @private
   */
  private createExecutionContext(
    request: FastifyRequest,
    reply: FastifyReply,
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
    container?: ScopedContainer,
  ): FastifyExecutionContext {
    const context = new FastifyExecutionContext(
      moduleMetadata,
      controllerMetadata,
      endpoint,
      request,
      reply,
    )
    if (container) {
      container.addInstance(ExecutionContext, context)
    }
    return context
  }

  /**
   * Creates a static handler wrapper (no scoped container needed).
   * @private
   */
  private makeStaticHandler(handlerResult: FastifyStaticHandler): RouteHandler {
    return async (request, reply) => {
      if (reply.sent) return
      try {
        return await runWithRequestId(request.id, () =>
          handlerResult.handler(request, reply),
        )
      } catch (error) {
        return this.handleError(error, reply)
      }
    }
  }

  /**
   * Creates a dynamic handler wrapper (uses scoped container from request).
   * @private
   */
  private makeDynamicHandler(
    handlerResult: FastifyDynamicHandler,
  ): RouteHandler {
    return async (request, reply) => {
      if (reply.sent) return
      try {
        return await runWithRequestId(request.id, () =>
          handlerResult.handler(request.scopedContainer!, request, reply),
        )
      } catch (error) {
        return this.handleError(error, reply)
      }
    }
  }

  /**
   * Creates a preHandler that runs static guards.
   * @private
   */
  private makeStaticGuardsPreHandler(
    guardInstances: CanActivate[],
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
    setupContainer: boolean,
  ): PreHandler {
    return async (request, reply) => {
      try {
        if (setupContainer) {
          this.createRequestContainer(request, reply)
        }
        await runWithRequestId(request.id, async () => {
          const context = this.createExecutionContext(
            request,
            reply,
            moduleMetadata,
            controllerMetadata,
            endpoint,
            request.scopedContainer,
          )
          await this.guardRunner.runGuardsStatic(guardInstances, context)
        })
      } catch (error) {
        return this.handleError(error, reply)
      }
    }
  }

  /**
   * Creates a preHandler that runs dynamic guards (needs scoped container).
   * If endContainerAfter=true, container is ended in finally block.
   * @private
   */
  private makeDynamicGuardsPreHandler(
    guards: Set<ClassType>,
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ): PreHandler {
    return async (request, reply) => {
      const container = this.createRequestContainer(request, reply)

      try {
        await runWithRequestId(request.id, async () => {
          const context = this.createExecutionContext(
            request,
            reply,
            moduleMetadata,
            controllerMetadata,
            endpoint,
            container,
          )
          await this.guardRunner.runGuards(guards as any, context, container)
        })
      } catch (error) {
        return this.handleError(error, reply)
      }
    }
  }

  /**
   * Wraps a route handler with request context, guards, and error handling.
   *
   * This method creates route handlers using one of five paths:
   * 1. Static handler + no guards: Direct handler call (fastest)
   * 2. Static handler + static guards: preHandler runs guards, handler is direct
   * 3. Static guards + dynamic handler: preHandler creates container and runs guards
   * 4. Dynamic guards + static handler: preHandler creates container, runs guards, ends container
   * 5. Dynamic guards + dynamic handler: preHandler creates container, runs guards, onResponse ends container
   *
   * @param handlerResult - The handler result from the adapter service.
   * @param guardResolution - Pre-resolved guards or resolver function.
   * @param moduleMetadata - Metadata about the module.
   * @param controllerMetadata - Metadata about the controller.
   * @param endpoint - Metadata about the endpoint handler.
   * @returns Route handlers with optional preHandler.
   * @private
   */
  private wrapHandler(
    handlerResult: FastifyHandlerResult,
    guardResolution: {
      cached: boolean
      instances: CanActivate[] | null
      classTypes: ClassType[]
    },
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ): RouteHandlers {
    const hasGuards = guardResolution.classTypes.length > 0
    const guardsAreStatic = guardResolution.cached
    const handlerIsStatic = handlerResult.isStatic

    // Path 1: No guards, static handler (fastest path)
    if (!hasGuards && handlerIsStatic) {
      return {
        handler: this.makeStaticHandler(handlerResult),
      }
    }

    // Path 2: Static guards, static handler
    if (hasGuards && guardsAreStatic && handlerIsStatic) {
      return {
        preHandler: this.makeStaticGuardsPreHandler(
          guardResolution.instances!,
          moduleMetadata,
          controllerMetadata,
          endpoint,
          false, // no container needed
        ),
        handler: this.makeStaticHandler(handlerResult),
      }
    }

    // Path 3: Static guards, dynamic handler
    if (hasGuards && guardsAreStatic && !handlerIsStatic) {
      return {
        preHandler: this.makeStaticGuardsPreHandler(
          guardResolution.instances!,
          moduleMetadata,
          controllerMetadata,
          endpoint,
          true, // setup container for handler
        ),
        handler: this.makeDynamicHandler(handlerResult),
      }
    }

    // Path 4: Dynamic guards, static handler
    if (hasGuards && !guardsAreStatic && handlerIsStatic) {
      return {
        preHandler: this.makeDynamicGuardsPreHandler(
          new Set(guardResolution.classTypes),
          moduleMetadata,
          controllerMetadata,
          endpoint,
        ),
        handler: this.makeStaticHandler(handlerResult),
      }
    }

    // Path 5: Dynamic guards + dynamic handler (or no guards + dynamic handler)
    const guards = new Set(guardResolution.classTypes)
    return {
      preHandler: hasGuards
        ? this.makeDynamicGuardsPreHandler(
            guards,
            moduleMetadata,
            controllerMetadata,
            endpoint,
          )
        : async (request, reply) => {
            // No guards, just setup container
            this.createRequestContainer(request, reply)
          },
      handler: this.makeDynamicHandler(handlerResult as FastifyDynamicHandler),
    }
  }

  /**
   * Handles errors and converts them to appropriate HTTP responses.
   * @private
   */
  private handleError(error: unknown, reply: FastifyReply) {
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
  }
}
