import { Container, inject, Injectable } from '@navios/core'
import { context as otelContext, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

import type { AttributeValue, Context, Span, SpanOptions } from '@opentelemetry/api'

import { getCurrentSpan } from '../stores/index.mjs'
import { OtelConfigToken } from '../tokens/index.mjs'

import type { ResolvedOtelConfig } from '../interfaces/index.mjs'

/**
 * Options for creating an HTTP span.
 */
export interface HttpSpanOptions {
  /**
   * HTTP method (GET, POST, etc.)
   */
  method: string

  /**
   * Full URL of the request.
   */
  url: string

  /**
   * Route pattern (e.g., '/users/:id')
   */
  route?: string

  /**
   * Controller class name.
   */
  controller?: string

  /**
   * Handler method name.
   */
  handler?: string

  /**
   * Module name.
   */
  module?: string

  /**
   * Parent context for the span.
   */
  parentContext?: Context
}

/**
 * Options for creating a child span.
 */
export interface ChildSpanOptions {
  /**
   * Span name.
   */
  name: string

  /**
   * Controller class name.
   */
  controller?: string

  /**
   * Handler method name.
   */
  handler?: string

  /**
   * Guard name.
   */
  guard?: string

  /**
   * Additional attributes.
   */
  attributes?: Record<string, AttributeValue>
}

/**
 * Service for creating spans with proper attributes.
 *
 * This service abstracts span creation and ensures consistent
 * attribute naming across the application.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { SpanFactoryService } from '@navios/otel'
 *
 * @Injectable()
 * class RequestHandler {
 *   private readonly spanFactory = inject(SpanFactoryService)
 *
 *   async handleRequest(req: Request) {
 *     const span = this.spanFactory.createHttpSpan({
 *       method: req.method,
 *       url: req.url,
 *       route: '/users/:id',
 *       controller: 'UserController',
 *       handler: 'getUser',
 *     })
 *
 *     try {
 *       const result = await this.process(req)
 *       this.spanFactory.setHttpResponse(span, 200)
 *       return result
 *     } catch (error) {
 *       this.spanFactory.recordError(span, error)
 *       throw error
 *     } finally {
 *       span.end()
 *     }
 *   }
 * }
 * ```
 */
@Injectable()
export class SpanFactoryService {
  private readonly container = inject(Container)

  /**
   * Gets the tracer from the global OpenTelemetry API.
   * This works even before explicit provider registration (returns a no-op tracer).
   */
  private get tracer() {
    return trace.getTracer('navios-otel')
  }

  /**
   * Gets the config dynamically from the container.
   * Returns null if config is not yet registered.
   */
  private getConfig(): ResolvedOtelConfig | null {
    return this.container.tryGetSync(OtelConfigToken)
  }

  /**
   * Creates a span for an incoming HTTP request.
   *
   * @param options - HTTP span options
   * @returns The created span
   */
  createHttpSpan(options: HttpSpanOptions): Span {
    const spanName = `HTTP ${options.method} ${options.route || options.url}`

    const spanOptions: SpanOptions = {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': options.method,
        'http.url': options.url,
      },
    }

    if (options.route) {
      spanOptions.attributes!['http.route'] = options.route
    }

    // Add Navios-specific attributes if enabled
    if (this.getConfig()?.includeNaviosAttributes) {
      if (options.controller) {
        spanOptions.attributes!['navios.controller'] = options.controller
      }
      if (options.handler) {
        spanOptions.attributes!['navios.handler'] = options.handler
      }
      if (options.module) {
        spanOptions.attributes!['navios.module'] = options.module
      }
    }

    // Start span with parent context if provided
    if (options.parentContext) {
      return this.tracer.startSpan(spanName, spanOptions, options.parentContext)
    }

    return this.tracer.startSpan(spanName, spanOptions)
  }

  /**
   * Creates a child span for internal operations.
   *
   * @param options - Child span options
   * @returns The created span
   */
  createChildSpan(options: ChildSpanOptions): Span {
    const parentSpan = getCurrentSpan()
    const parentContext = parentSpan ? trace.setSpan(otelContext.active(), parentSpan) : undefined

    const spanOptions: SpanOptions = {
      kind: SpanKind.INTERNAL,
      attributes: { ...options.attributes },
    }

    // Add Navios-specific attributes if enabled
    if (this.getConfig()?.includeNaviosAttributes) {
      if (options.controller) {
        spanOptions.attributes!['navios.controller'] = options.controller
      }
      if (options.handler) {
        spanOptions.attributes!['navios.handler'] = options.handler
      }
      if (options.guard) {
        spanOptions.attributes!['navios.guard'] = options.guard
      }
    }

    if (parentContext) {
      return this.tracer.startSpan(options.name, spanOptions, parentContext)
    }

    return this.tracer.startSpan(options.name, spanOptions)
  }

  /**
   * Creates a span for guard execution.
   *
   * @param guardName - Name of the guard
   * @returns The created span
   */
  createGuardSpan(guardName: string): Span {
    return this.createChildSpan({
      name: `guard:${guardName}`,
      guard: guardName,
    })
  }

  /**
   * Creates a span for handler execution.
   *
   * @param controllerName - Controller class name
   * @param handlerName - Handler method name
   * @returns The created span
   */
  createHandlerSpan(controllerName: string, handlerName: string): Span {
    return this.createChildSpan({
      name: `handler:${controllerName}.${handlerName}`,
      controller: controllerName,
      handler: handlerName,
    })
  }

  /**
   * Sets HTTP response attributes on a span.
   *
   * @param span - The span to update
   * @param statusCode - HTTP status code
   * @param contentLength - Optional response content length
   */
  setHttpResponse(span: Span, statusCode: number, contentLength?: number): void {
    span.setAttribute('http.status_code', statusCode)

    if (contentLength !== undefined) {
      span.setAttribute('http.response_content_length', contentLength)
    }

    // Set span status based on HTTP status code
    if (statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${statusCode}`,
      })
    } else {
      span.setStatus({ code: SpanStatusCode.OK })
    }
  }

  /**
   * Records an error on a span.
   *
   * @param span - The span to update
   * @param error - The error to record
   */
  recordError(span: Span, error: unknown): void {
    if (error instanceof Error) {
      span.recordException(error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      })
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: String(error),
      })
    }
  }

  /**
   * Adds attributes to a span.
   *
   * @param span - The span to update
   * @param attributes - Attributes to add
   */
  addAttributes(span: Span, attributes: Record<string, AttributeValue>): void {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value)
    }
  }
}
