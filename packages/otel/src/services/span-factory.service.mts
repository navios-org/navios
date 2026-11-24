import { optional, registerInjectable } from '@navios/di'
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

import type { AttributeValue, Context, Span, SpanOptions } from '@opentelemetry/api'

import { OtelConfigToken, TracerToken } from '../tokens/index.mjs'
import { parentContext, recordSpanError } from '../utils/span.util.mjs'

/**
 * Options for creating an HTTP span.
 */
export interface HttpSpanOptions {
  /**
   * HTTP method (GET, POST, etc.)
   */
  method: string

  /**
   * Path of the request.
   */
  url: string

  /**
   * Route pattern (e.g., '/users/$id')
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
 * Service for creating spans with consistent names and attributes.
 *
 * The plugin's interceptor and the `@Traced` instrumentation use the same
 * conventions; inject this service to create matching spans by hand.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { SpanFactoryService } from '@navios/otel'
 *
 * @Injectable()
 * class ReportService {
 *   private readonly spans = inject(SpanFactoryService)
 *
 *   async build() {
 *     const span = this.spans.createChildSpan({ name: 'report.build' })
 *     try {
 *       return await this.render()
 *     } catch (error) {
 *       this.spans.recordError(span, error)
 *       throw error
 *     } finally {
 *       span.end()
 *     }
 *   }
 * }
 * ```
 */
export class SpanFactoryService {
  // Without the plugin there is no tracer provider; the global API then
  // hands out a no-op tracer.
  private readonly tracer = optional(TracerToken) ?? trace.getTracer('navios-otel')
  private readonly config = optional(OtelConfigToken)

  /**
   * Creates a server span for an incoming HTTP request.
   */
  createHttpSpan(options: HttpSpanOptions): Span {
    const spanName = `HTTP ${options.method} ${options.route || options.url}`

    const attributes: Record<string, AttributeValue> = {
      'http.method': options.method,
      'http.url': options.url,
    }
    if (options.route) {
      attributes['http.route'] = options.route
    }
    if (this.config?.includeNaviosAttributes) {
      if (options.controller) {
        attributes['navios.controller'] = options.controller
      }
      if (options.handler) {
        attributes['navios.handler'] = options.handler
      }
      if (options.module) {
        attributes['navios.module'] = options.module
      }
    }

    const spanOptions: SpanOptions = { kind: SpanKind.SERVER, attributes }
    return options.parentContext
      ? this.tracer.startSpan(spanName, spanOptions, options.parentContext)
      : this.tracer.startSpan(spanName, spanOptions)
  }

  /**
   * Creates an internal span whose parent is the active span.
   */
  createChildSpan(options: ChildSpanOptions): Span {
    const attributes: Record<string, AttributeValue> = { ...options.attributes }
    if (this.config?.includeNaviosAttributes) {
      if (options.controller) {
        attributes['navios.controller'] = options.controller
      }
      if (options.handler) {
        attributes['navios.handler'] = options.handler
      }
      if (options.guard) {
        attributes['navios.guard'] = options.guard
      }
    }
    return this.tracer.startSpan(
      options.name,
      { kind: SpanKind.INTERNAL, attributes },
      parentContext(),
    )
  }

  /**
   * Creates a span for guard execution.
   */
  createGuardSpan(guardName: string): Span {
    return this.createChildSpan({ name: `guard:${guardName}`, guard: guardName })
  }

  /**
   * Creates a span for handler execution.
   */
  createHandlerSpan(controllerName: string, handlerName: string): Span {
    return this.createChildSpan({
      name: `handler:${controllerName}.${handlerName}`,
      controller: controllerName,
      handler: handlerName,
    })
  }

  /**
   * Sets the response status on a span. A status of 400 or above marks the
   * span as failed.
   */
  setHttpResponse(span: Span, statusCode: number, contentLength?: number): void {
    span.setAttribute('http.status_code', statusCode)
    if (contentLength !== undefined) {
      span.setAttribute('http.response_content_length', contentLength)
    }
    if (statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${statusCode}` })
    } else {
      span.setStatus({ code: SpanStatusCode.OK })
    }
  }

  /**
   * Records an error on a span and marks the span as failed.
   */
  recordError(span: Span, error: unknown): void {
    recordSpanError(span, error)
  }

  /**
   * Adds attributes to a span.
   */
  addAttributes(span: Span, attributes: Record<string, AttributeValue>): void {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value)
    }
  }
}

registerInjectable(SpanFactoryService)
