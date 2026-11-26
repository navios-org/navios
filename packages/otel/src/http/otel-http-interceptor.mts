import { inject, registerInjectable } from '@navios/di'
import { context as otelContext, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

import type { Interceptor, RequestContext, RouteInfo, RouteResult } from '@navios/server'
import type { AttributeValue } from '@opentelemetry/api'

import { OtelConfigToken } from '../config/otel-config-token.mjs'
import { TracerToken } from '../sdk/tracer-token.mjs'
import { extractTraceContext, RequestSpan } from '../tracing/context.mjs'

import { compileIgnoreRoutes } from './ignore-routes.mjs'

interface RouteSpan {
  name: string
  attributes: Record<string, AttributeValue>
}

/**
 * Traces HTTP requests: one server span per request that matches a route.
 *
 * The span starts before guards run and ends when the response has finished:
 * after the body was sent, a stream ended, or the client went away. Its
 * status is the final status of the response, including the one an error was
 * mapped to. While the rest of the pipeline runs, the span is the active
 * OpenTelemetry span and is stored on the request context under
 * `RequestSpan`.
 *
 * The plugin registers this interceptor around every route. It uses only the
 * adapter-neutral request context, so it behaves the same on every adapter.
 */
export class OtelHttpInterceptor implements Interceptor {
  private readonly tracer = inject(TracerToken)
  private readonly config = inject(OtelConfigToken)
  private readonly ignored = compileIgnoreRoutes(this.config.ignoreRoutes)
  private readonly routes = new WeakMap<RouteInfo, RouteSpan>()

  private describe(route: RouteInfo): RouteSpan {
    let described = this.routes.get(route)
    if (described === undefined) {
      const attributes: Record<string, AttributeValue> = {
        'http.method': route.method,
        'http.route': route.path,
      }
      if (this.config.includeNaviosAttributes) {
        attributes['navios.controller'] = route.controller.name
        attributes['navios.handler'] = route.handlerName
        if (route.module) {
          attributes['navios.module'] = route.module.name
        }
      }
      described = { name: `HTTP ${route.method} ${route.path}`, attributes }
      this.routes.set(route, described)
    }
    return described
  }

  intercept(ctx: RequestContext, next: () => Promise<RouteResult>): Promise<RouteResult> {
    if (this.ignored !== null && this.ignored(ctx.path)) {
      return next()
    }
    const { name, attributes } = this.describe(ctx.route)
    // A traceparent header makes this span a child of the caller's span.
    const parent = extractTraceContext(ctx.headers)
    const span = this.tracer.startSpan(
      name,
      {
        kind: SpanKind.SERVER,
        attributes: { ...attributes, 'http.url': ctx.path, 'http.request_id': ctx.id },
      },
      parent,
    )
    const userAgent = ctx.headers.get('user-agent')
    if (userAgent) {
      span.setAttribute('http.user_agent', userAgent)
    }
    ctx.set(RequestSpan, span)

    let failure: string | undefined
    // The status is final, and the body sent, only once the response has
    // finished; errors are mapped to responses after interceptors exit.
    ctx.onFinish(() => {
      const status = ctx.responseStatus ?? 500
      span.setAttribute('http.status_code', status)
      span.setAttribute('http.response.status_code', status)
      if (status >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: failure ?? `HTTP ${status}` })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }
      span.end()
    })

    const fail = (error: unknown): never => {
      if (error instanceof Error) {
        span.recordException(error)
        failure = error.message
      } else {
        failure = String(error)
      }
      throw error
    }

    try {
      return otelContext.with(trace.setSpan(parent, span), next).catch(fail)
    } catch (error) {
      return Promise.reject(error).catch(fail)
    }
  }
}

registerInjectable(OtelHttpInterceptor)
