import { inject, registerInjectable } from '@navios/di'
import { SpanKind, SpanStatusCode } from '@opentelemetry/api'

import type { Interceptor, RequestContext, RouteInfo, RouteResult } from '@navios/server'
import type { Attributes } from '@opentelemetry/api'

import { OtelConfigToken } from '../otel-config.mjs'
import { TracerToken } from '../sdk/tracer-token.mjs'
import {
  ATTR_HTTP_REQUEST_ID,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
  ATTR_USER_AGENT_ORIGINAL,
  naviosAttributes,
} from '../tracing/attributes.mjs'
import { extractTraceContext, RequestSpan } from '../tracing/context.mjs'
import { describedOnce, recordException, runInSpan } from '../tracing/span.mjs'

/**
 * Compiles `ignoreRoutes` patterns into one test. `*` matches any run of
 * characters; everything else is literal.
 */
function compileIgnoreRoutes(patterns: readonly string[]): ((path: string) => boolean) | null {
  if (patterns.length === 0) {
    return null
  }
  const exact = new Set<string>()
  const globs: RegExp[] = []
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const source = pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
      globs.push(new RegExp(`^${source}$`))
    } else {
      exact.add(pattern)
    }
  }
  return (path) => exact.has(path) || globs.some((glob) => glob.test(path))
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
  private readonly describe = describedOnce((route: RouteInfo) => ({
    name: `HTTP ${route.method} ${route.path}`,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: route.method,
      [ATTR_HTTP_ROUTE]: route.path,
      ...(this.config.includeNaviosAttributes ? naviosAttributes(route) : undefined),
    },
  }))

  intercept(ctx: RequestContext, next: () => Promise<RouteResult>): Promise<RouteResult> {
    if (this.ignored !== null && this.ignored(ctx.path)) {
      return next()
    }
    const route = this.describe(ctx.route)
    const attributes: Attributes = {
      ...route.attributes,
      [ATTR_URL_PATH]: ctx.path,
      [ATTR_HTTP_REQUEST_ID]: ctx.id,
    }
    const userAgent = ctx.headers.get('user-agent')
    if (userAgent) {
      attributes[ATTR_USER_AGENT_ORIGINAL] = userAgent
    }
    // A traceparent header makes this span a child of the caller's span.
    const parent = extractTraceContext(ctx.headers)
    const span = this.tracer.startSpan(route.name, { kind: SpanKind.SERVER, attributes }, parent)
    ctx.set(RequestSpan, span)

    let failure: string | undefined
    // The status is final, and the body sent, only once the response has
    // finished; errors are mapped to responses after interceptors exit.
    ctx.onFinish(() => {
      const status = ctx.responseStatus ?? 500
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, status)
      span.setStatus(
        status >= 400
          ? { code: SpanStatusCode.ERROR, message: failure ?? `HTTP ${status}` }
          : { code: SpanStatusCode.OK },
      )
      span.end()
    })

    return runInSpan(span, parent, next, (error) => {
      failure = recordException(span, error)
    })
  }
}

registerInjectable(OtelHttpInterceptor)
