import type {
  CanActivate,
  ClassType,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'
import type { BunRequest } from 'bun'

import {
  Container,
  ErrorResponseProducerService,
  ExecutionContext,
  extractControllerMetadata,
  FrameworkError,
  generateRequestId,
  GuardRunnerService,
  HttpException,
  inject,
  Injectable,
  InjectionToken,
  InstanceResolverService,
  Logger,
  runWithRequestId,
} from '@navios/core'

import { ZodError } from 'zod/v4'

import type {
  BunHandlerAdapterInterface,
  BunHandlerResult,
} from '../adapters/index.mjs'

import { BunExecutionContext, BunFakeReply } from '../interfaces/index.mjs'
import {
  BunControllerAdapterToken,
  BunRequestToken,
} from '../tokens/index.mjs'
import {
  applyCorsToResponse,
  type BunCorsOptions,
} from '../utils/cors.util.mjs'

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
@Injectable({ token: BunControllerAdapterToken })
export class BunControllerAdapterService {
  private guardRunner = inject(GuardRunnerService)
  private container = inject(Container)
  private instanceResolver = inject(InstanceResolverService)
  private errorProducer = inject(ErrorResponseProducerService)
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
   * @param corsOptions - Optional CORS configuration to apply to responses.
   *
   * @throws {Error} If an endpoint is malformed (missing URL or adapter token).
   */
  async setupController(
    controller: ClassType,
    routes: BunRoutes,
    moduleMetadata: ModuleMetadata,
    globalPrefix: string,
    corsOptions: BunCorsOptions | null = null,
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

      const fullUrl = globalPrefix + url.replaceAll('$', ':')
      if (!routes[fullUrl]) {
        routes[fullUrl] = {}
      }
      routes[fullUrl][httpMethod] = this.wrapHandler(
        await adapter.provideHandler(controller, endpoint),
        guardResolution,
        moduleMetadata,
        controllerMetadata,
        endpoint,
        corsOptions,
      )

      this.logger.debug(
        `Registered ${httpMethod} ${fullUrl} for ${controller.name}:${classMethod}`,
      )
    }
  }

  /**
   * Wraps a route handler with request context, guards, error handling, and CORS.
   *
   * This method creates a complete request handler using one of three paths:
   * 1. Static handler + no guards: Direct handler call (fastest)
   * 2. Static handler + static guards: Call pre-resolved guards, then handler
   * 3. Dynamic: Full flow with scoped container
   *
   * @param handlerResult - The handler result from the adapter service.
   * @param guardResolution - Pre-resolved guards or resolver function.
   * @param moduleMetadata - Metadata about the module.
   * @param controllerMetadata - Metadata about the controller.
   * @param endpoint - Metadata about the endpoint handler.
   * @param corsOptions - Optional CORS configuration to apply to responses.
   * @returns A wrapped handler function that can be registered with Bun.
   * @private
   */
  private wrapHandler(
    handlerResult: BunHandlerResult,
    guardResolution: {
      cached: boolean
      instances: CanActivate[] | null
      classTypes: ClassType[]
    },
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
    corsOptions: BunCorsOptions | null,
  ) {
    const hasGuards = guardResolution.classTypes.length > 0

    // Path 1: Static handler, no guards (fastest)
    if (handlerResult.isStatic && !hasGuards) {
      return async (request: BunRequest) => {
        const origin = request.headers.get('Origin')
        try {
          return await runWithRequestId(generateRequestId(), async () => {
            const response = await handlerResult.handler(request)
            return applyCorsToResponse(response, origin, corsOptions)
          })
        } catch (error) {
          const errorResponse = this.handleError(error)
          return applyCorsToResponse(errorResponse, origin, corsOptions)
        }
      }
    }

    // Path 2: Static handler + static guards
    if (handlerResult.isStatic && guardResolution.cached) {
      return async (request: BunRequest) => {
        const origin = request.headers.get('Origin')
        const fakeReply = new BunFakeReply()
        const executionContext = new BunExecutionContext(
          moduleMetadata,
          controllerMetadata,
          endpoint,
          request,
          fakeReply,
        )
        try {
          return await runWithRequestId(generateRequestId(), async () => {
            const canActivate = await this.guardRunner.runGuardsStatic(
              guardResolution.instances!,
              executionContext,
            )
            if (!canActivate) {
              // Check if guard set a custom response via the fake reply
              if (fakeReply.hasResponse()) {
                return applyCorsToResponse(
                  fakeReply.toResponse(),
                  origin,
                  corsOptions,
                )
              }
              return applyCorsToResponse(
                new Response('Forbidden', { status: 403 }),
                origin,
                corsOptions,
              )
            }
            const response = await handlerResult.handler(request)
            return applyCorsToResponse(response, origin, corsOptions)
          })
        } catch (error) {
          const errorResponse = this.handleError(error)
          return applyCorsToResponse(errorResponse, origin, corsOptions)
        }
      }
    }

    // Path 3: Dynamic (default) - need scoped container
    // Get guard tokens for dynamic resolution
    const guards = new Set(guardResolution.classTypes)

    return async (request: BunRequest) => {
      const origin = request.headers.get('Origin')
      const fakeReply = new BunFakeReply()
      const executionContext = new BunExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
        request,
        fakeReply,
      )
      const requestId = generateRequestId()
      const requestContainer = this.container.beginRequest(requestId)
      requestContainer.addInstance(BunRequestToken, request)
      requestContainer.addInstance(ExecutionContext, executionContext)

      try {
        return await runWithRequestId(requestId, async () => {
          // Run guards if there are any
          if (hasGuards) {
            const canActivate = await this.guardRunner.runGuards(
              guards as any,
              executionContext,
              requestContainer,
            )
            if (!canActivate) {
              // Check if guard set a custom response via the fake reply
              if (fakeReply.hasResponse()) {
                return applyCorsToResponse(
                  fakeReply.toResponse(),
                  origin,
                  corsOptions,
                )
              }
              return applyCorsToResponse(
                new Response('Forbidden', { status: 403 }),
                origin,
                corsOptions,
              )
            }
          }

          // Handler is dynamic, needs scoped container
          if (!handlerResult.isStatic) {
            const response = await handlerResult.handler(requestContainer, request)
            return applyCorsToResponse(response, origin, corsOptions)
          }
          // Handler is static but guards are dynamic
          const response = await handlerResult.handler(request)
          return applyCorsToResponse(response, origin, corsOptions)
        })
      } catch (error) {
        const errorResponse = this.handleError(error)
        return applyCorsToResponse(errorResponse, origin, corsOptions)
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

  /**
   * Handles errors and converts them to appropriate HTTP responses.
   * Uses ErrorResponseProducerService to produce RFC 7807 compliant responses.
   * @private
   */
  private handleError(error: unknown): Response {
    let errorResponse

    if (error instanceof HttpException) {
      // For HttpException, preserve original response format for backwards compatibility
      return new Response(JSON.stringify(error.response), {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
      })
    } else if (error instanceof ZodError) {
      errorResponse = this.errorProducer.respond(
        FrameworkError.ValidationError,
        error,
      )
    } else {
      // Log unexpected errors
      const err = error as Error
      this.logger.error(`Error: ${err.message}`, err)
      errorResponse = this.errorProducer.handleUnknown(error)
    }

    return new Response(JSON.stringify(errorResponse.payload), {
      status: errorResponse.statusCode,
      headers: errorResponse.headers,
    })
  }
}
