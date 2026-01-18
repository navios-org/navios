import {
  BunControllerAdapterService,
  type BunHandlerResult,
  type BunRoutes,
  type BunCorsOptions,
} from '@navios/adapter-bun'
import { BunExecutionContext, BunFakeReply, BunRequestToken } from '@navios/adapter-bun'
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
  InjectionToken,
  InstanceResolverService,
  Logger,
  runWithRequestId,
} from '@navios/core'
import { runWithSpanContext, SpanFactoryService, TraceContextService } from '@navios/otel'
import { ZodError } from 'zod/v4'

import type { BunStaticHandler } from '@navios/adapter-bun'
import type { BunHandlerAdapterInterface } from '@navios/adapter-bun'
import type { CanActivate, ControllerMetadata, HandlerMetadata, ModuleMetadata } from '@navios/core'
import type { ClassType } from '@navios/di'
import type { Span } from '@opentelemetry/api'
import type { BunRequest } from 'bun'

import { BunOtelOptionsToken } from '../tokens/index.mjs'

/**
 * Traced controller adapter service for Bun.
 *
 * This service extends the base BunControllerAdapterService to add
 * automatic OpenTelemetry tracing for all HTTP requests. It creates
 * spans for each request with proper attributes and context propagation.
 *
 * This service is automatically registered by the OTel plugin when
 * `autoInstrument.http` is enabled (default: true).
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineBunEnvironment } from '@navios/adapter-bun'
 * import { defineOtelPlugin } from '@navios/otel-bun'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * // Register OTel plugins (enables HTTP tracing automatically)
 * for (const plugin of defineOtelPlugin({
 *   serviceName: 'my-api',
 *   exporter: 'otlp',
 * })) {
 *   app.usePlugin(plugin)
 * }
 *
 * await app.listen({ port: 3000 })
 * ```
 */
export class TracedBunControllerAdapterService extends BunControllerAdapterService {
  private tracedGuardRunner = inject(GuardRunnerService)
  private tracedContainer = inject(Container)
  private tracedInstanceResolver = inject(InstanceResolverService)
  private tracedErrorProducer = inject(ErrorResponseProducerService)
  private tracedLogger = inject(Logger, {
    context: TracedBunControllerAdapterService.name,
  })

  // OTel services
  private traceContext = inject(TraceContextService)
  private spanFactory = inject(SpanFactoryService)
  private pluginOptions = inject(BunOtelOptionsToken)

  /**
   * Sets up route handlers for a controller with tracing enabled.
   */
  override async setupController(
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
        throw new Error(`[Navios] Malformed Endpoint ${controller.name}:${classMethod}`)
      }
      const adapter = await this.tracedContainer.get(
        adapterToken as InjectionToken<BunHandlerAdapterInterface>,
      )

      // Pre-resolve guards (reversed order: module → controller → endpoint)
      const guards = this.tracedGuardRunner.makeContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )
      const guardResolution = await this.tracedInstanceResolver.resolveMany<CanActivate>(
        Array.from(guards).reverse() as ClassType[],
      )

      const fullUrl = globalPrefix + url.replaceAll('$', ':')
      if (!routes[fullUrl]) {
        routes[fullUrl] = {}
      }

      // Check if this route should be ignored
      const shouldTrace = this.shouldTraceRoute(fullUrl)

      routes[fullUrl][httpMethod] = this.wrapTracedHandler(
        await adapter.provideHandler(controller, endpoint),
        guardResolution,
        moduleMetadata,
        controllerMetadata,
        endpoint,
        corsOptions,
        fullUrl,
        shouldTrace,
      )

      this.tracedLogger.debug(
        `Registered ${httpMethod} ${fullUrl} for ${controller.name}:${classMethod}${shouldTrace ? ' (traced)' : ''}`,
      )
    }
  }

  /**
   * Checks if a route should be traced based on plugin options.
   */
  private shouldTraceRoute(route: string): boolean {
    const ignoreRoutes = this.pluginOptions.ignoreRoutes ?? []
    return !ignoreRoutes.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
        return regex.test(route)
      }
      return route === pattern
    })
  }

  /**
   * Wraps a handler with OpenTelemetry tracing.
   */
  private wrapTracedHandler(
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
    route: string,
    shouldTrace: boolean,
  ): (req: BunRequest) => Response | Promise<Response> {
    const hasGuards = guardResolution.classTypes.length > 0

    // If tracing is disabled for this route, use non-traced path
    if (!shouldTrace) {
      return this.createNonTracedHandler(
        handlerResult,
        guardResolution,
        moduleMetadata,
        controllerMetadata,
        endpoint,
        corsOptions,
      )
    }

    // Path 1: Static handler, no guards (fastest traced path)
    if (handlerResult.isStatic && !hasGuards) {
      return this.createTracedStaticHandler(
        handlerResult,
        controllerMetadata,
        endpoint,
        corsOptions,
        route,
      )
    }

    // Path 2: Static handler + static guards
    if (handlerResult.isStatic && guardResolution.cached) {
      return this.createTracedStaticGuardHandler(
        handlerResult,
        guardResolution,
        moduleMetadata,
        controllerMetadata,
        endpoint,
        corsOptions,
        route,
      )
    }

    // Path 3: Dynamic (default) - need scoped container
    return this.createTracedDynamicHandler(
      handlerResult,
      guardResolution,
      moduleMetadata,
      controllerMetadata,
      endpoint,
      corsOptions,
      route,
    )
  }

  /**
   * Creates a non-traced handler (fallback for ignored routes).
   */
  private createNonTracedHandler(
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
  ): (req: BunRequest) => Response | Promise<Response> {
    const hasGuards = guardResolution.classTypes.length > 0

    // Static handler, no guards
    if (handlerResult.isStatic && !hasGuards) {
      return async (request: BunRequest) => {
        const origin = request.headers.get('Origin')
        try {
          return await runWithRequestId(generateRequestId(), async () => {
            const response = await handlerResult.handler(request)
            return this.applyCors(response, origin, corsOptions)
          })
        } catch (error) {
          const errorResponse = this.handleTracedError(error)
          return this.applyCors(errorResponse, origin, corsOptions)
        }
      }
    }

    // Static handler + static guards
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
            const canActivate = await this.tracedGuardRunner.runGuardsStatic(
              guardResolution.instances!,
              executionContext,
            )
            if (!canActivate) {
              if (fakeReply.hasResponse()) {
                return this.applyCors(fakeReply.toResponse(), origin, corsOptions)
              }
              return this.applyCors(new Response('Forbidden', { status: 403 }), origin, corsOptions)
            }
            const response = await handlerResult.handler(request)
            return this.applyCors(response, origin, corsOptions)
          })
        } catch (error) {
          const errorResponse = this.handleTracedError(error)
          return this.applyCors(errorResponse, origin, corsOptions)
        }
      }
    }

    // Dynamic path
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
      const requestContainer = this.tracedContainer.beginRequest(requestId)
      requestContainer.addInstance(BunRequestToken, request)
      requestContainer.addInstance(ExecutionContext, executionContext)

      try {
        return await runWithRequestId(requestId, async () => {
          if (guardResolution.classTypes.length > 0) {
            const canActivate = await this.tracedGuardRunner.runGuards(
              guards as any,
              executionContext,
              requestContainer,
            )
            if (!canActivate) {
              if (fakeReply.hasResponse()) {
                return this.applyCors(fakeReply.toResponse(), origin, corsOptions)
              }
              return this.applyCors(new Response('Forbidden', { status: 403 }), origin, corsOptions)
            }
          }

          if (!handlerResult.isStatic) {
            const response = await handlerResult.handler(requestContainer, request)
            return this.applyCors(response, origin, corsOptions)
          }
          const response = await handlerResult.handler(request)
          return this.applyCors(response, origin, corsOptions)
        })
      } catch (error) {
        const errorResponse = this.handleTracedError(error)
        return this.applyCors(errorResponse, origin, corsOptions)
      } finally {
        requestContainer.endRequest().catch((err: any) => {
          this.tracedLogger.error(`Error ending request context ${requestId}: ${err.message}`, err)
        })
      }
    }
  }

  /**
   * Creates a traced handler for static handlers without guards.
   */
  private createTracedStaticHandler(
    handlerResult: BunStaticHandler,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
    corsOptions: BunCorsOptions | null,
    route: string,
  ): (req: BunRequest) => Response | Promise<Response> {
    return async (request: BunRequest) => {
      const origin = request.headers.get('Origin')

      // Extract parent context from headers
      const headers = this.extractHeaders(request)
      const parentContext = this.traceContext.extractFromHeaders(headers)

      // Create HTTP span
      const span = this.spanFactory.createHttpSpan({
        method: request.method,
        url: request.url,
        route,
        controller: controllerMetadata.name,
        handler: endpoint.classMethod,
        parentContext,
      })

      try {
        return await runWithRequestId(generateRequestId(), async () => {
          return await runWithSpanContext({ span }, async () => {
            const response = await handlerResult.handler(request)
            this.spanFactory.setHttpResponse(span, response.status)
            return this.applyCors(response, origin, corsOptions)
          })
        })
      } catch (error) {
        this.spanFactory.recordError(span, error)
        const errorResponse = this.handleTracedError(error)
        this.spanFactory.setHttpResponse(span, errorResponse.status)
        return this.applyCors(errorResponse, origin, corsOptions)
      } finally {
        span.end()
      }
    }
  }

  /**
   * Creates a traced handler for static handlers with static guards.
   */
  private createTracedStaticGuardHandler(
    handlerResult: BunStaticHandler,
    guardResolution: {
      cached: boolean
      instances: CanActivate[] | null
      classTypes: ClassType[]
    },
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
    corsOptions: BunCorsOptions | null,
    route: string,
  ): (req: BunRequest) => Response | Promise<Response> {
    return async (request: BunRequest) => {
      const origin = request.headers.get('Origin')

      // Extract parent context from headers
      const headers = this.extractHeaders(request)
      const parentContext = this.traceContext.extractFromHeaders(headers)

      // Create HTTP span
      const span = this.spanFactory.createHttpSpan({
        method: request.method,
        url: request.url,
        route,
        controller: controllerMetadata.name,
        handler: endpoint.classMethod,
        parentContext,
      })

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
          return await runWithSpanContext({ span }, async () => {
            // Run guards with tracing
            const canActivate = await this.runGuardsWithTracing(
              guardResolution.instances!,
              executionContext,
              span,
            )

            if (!canActivate) {
              const response = fakeReply.hasResponse()
                ? fakeReply.toResponse()
                : new Response('Forbidden', { status: 403 })
              this.spanFactory.setHttpResponse(span, response.status)
              return this.applyCors(response, origin, corsOptions)
            }

            const response = await handlerResult.handler(request)
            this.spanFactory.setHttpResponse(span, response.status)
            return this.applyCors(response, origin, corsOptions)
          })
        })
      } catch (error) {
        this.spanFactory.recordError(span, error)
        const errorResponse = this.handleTracedError(error)
        this.spanFactory.setHttpResponse(span, errorResponse.status)
        return this.applyCors(errorResponse, origin, corsOptions)
      } finally {
        span.end()
      }
    }
  }

  /**
   * Creates a traced handler for dynamic handlers.
   */
  private createTracedDynamicHandler(
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
    route: string,
  ): (req: BunRequest) => Response | Promise<Response> {
    const guards = new Set(guardResolution.classTypes)
    const hasGuards = guardResolution.classTypes.length > 0

    return async (request: BunRequest) => {
      const origin = request.headers.get('Origin')

      // Extract parent context from headers
      const headers = this.extractHeaders(request)
      const parentContext = this.traceContext.extractFromHeaders(headers)

      // Create HTTP span
      const span = this.spanFactory.createHttpSpan({
        method: request.method,
        url: request.url,
        route,
        controller: controllerMetadata.name,
        handler: endpoint.classMethod,
        parentContext,
      })

      const fakeReply = new BunFakeReply()
      const executionContext = new BunExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
        request,
        fakeReply,
      )
      const requestId = generateRequestId()
      const requestContainer = this.tracedContainer.beginRequest(requestId)
      requestContainer.addInstance(BunRequestToken, request)
      requestContainer.addInstance(ExecutionContext, executionContext)

      try {
        return await runWithRequestId(requestId, async () => {
          return await runWithSpanContext({ span }, async () => {
            // Run guards if there are any
            if (hasGuards) {
              const canActivate = await this.tracedGuardRunner.runGuards(
                guards as any,
                executionContext,
                requestContainer,
              )
              if (!canActivate) {
                const response = fakeReply.hasResponse()
                  ? fakeReply.toResponse()
                  : new Response('Forbidden', { status: 403 })
                this.spanFactory.setHttpResponse(span, response.status)
                return this.applyCors(response, origin, corsOptions)
              }
            }

            // Handler is dynamic, needs scoped container
            if (!handlerResult.isStatic) {
              const response = await handlerResult.handler(requestContainer, request)
              this.spanFactory.setHttpResponse(span, response.status)
              return this.applyCors(response, origin, corsOptions)
            }

            // Handler is static but guards are dynamic
            const response = await handlerResult.handler(request)
            this.spanFactory.setHttpResponse(span, response.status)
            return this.applyCors(response, origin, corsOptions)
          })
        })
      } catch (error) {
        this.spanFactory.recordError(span, error)
        const errorResponse = this.handleTracedError(error)
        this.spanFactory.setHttpResponse(span, errorResponse.status)
        return this.applyCors(errorResponse, origin, corsOptions)
      } finally {
        span.end()
        requestContainer.endRequest().catch((err: any) => {
          this.tracedLogger.error(`Error ending request context ${requestId}: ${err.message}`, err)
        })
      }
    }
  }

  /**
   * Runs guards with tracing spans.
   */
  private async runGuardsWithTracing(
    guards: CanActivate[],
    context: BunExecutionContext,
    _parentSpan: Span,
  ): Promise<boolean> {
    for (const guard of guards) {
      const guardName = guard.constructor.name

      // Create guard span if handler tracing is enabled
      let guardSpan: Span | undefined
      if (this.pluginOptions.autoInstrument?.handlers) {
        guardSpan = this.spanFactory.createGuardSpan(guardName)
      }

      try {
        const result = await guard.canActivate(context)
        if (!result) {
          guardSpan?.end()
          return false
        }
      } catch (error) {
        if (guardSpan) {
          this.spanFactory.recordError(guardSpan, error)
        }
        guardSpan?.end()
        throw error
      }

      guardSpan?.end()
    }

    return true
  }

  /**
   * Extracts headers from BunRequest as a plain object.
   */
  private extractHeaders(request: BunRequest): Record<string, string> {
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    return headers
  }

  /**
   * Applies CORS headers to a response.
   */
  private applyCors(
    response: Response,
    origin: string | null,
    corsOptions: BunCorsOptions | null,
  ): Response {
    if (!corsOptions || !origin) {
      return response
    }

    // Apply CORS using the same logic as the base adapter
    const newHeaders = new Headers(response.headers)

    if (corsOptions.origin === true || corsOptions.origin === '*') {
      newHeaders.set('Access-Control-Allow-Origin', origin)
    } else if (typeof corsOptions.origin === 'string') {
      newHeaders.set('Access-Control-Allow-Origin', corsOptions.origin)
    } else if (Array.isArray(corsOptions.origin)) {
      if (corsOptions.origin.includes(origin)) {
        newHeaders.set('Access-Control-Allow-Origin', origin)
      }
    }

    if (corsOptions.credentials) {
      newHeaders.set('Access-Control-Allow-Credentials', 'true')
    }

    if (corsOptions.exposedHeaders) {
      const exposedHeadersValue = Array.isArray(corsOptions.exposedHeaders)
        ? corsOptions.exposedHeaders.join(', ')
        : corsOptions.exposedHeaders
      newHeaders.set('Access-Control-Expose-Headers', exposedHeadersValue)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }

  /**
   * Handles errors and converts them to appropriate HTTP responses.
   */
  private handleTracedError(error: unknown): Response {
    let errorResponse

    if (error instanceof HttpException) {
      return new Response(JSON.stringify(error.response), {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
      })
    } else if (error instanceof ZodError) {
      errorResponse = this.tracedErrorProducer.respond(FrameworkError.ValidationError, error)
    } else {
      const err = error as Error
      this.tracedLogger.error(`Error: ${err.message}`, err)
      errorResponse = this.tracedErrorProducer.handleUnknown(error)
    }

    return new Response(JSON.stringify(errorResponse.payload), {
      status: errorResponse.statusCode,
      headers: errorResponse.headers,
    })
  }
}
