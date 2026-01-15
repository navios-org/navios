import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Span } from '@opentelemetry/api'

import type { ResolvedOtelConfig, SpanFactoryService, TraceContextService } from '@navios/otel'

import type { FastifyOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * Augment FastifyRequest to include otel span.
 */
declare module 'fastify' {
  interface FastifyRequest {
    otelSpan?: Span
  }
}

/**
 * Checks if a route should be ignored based on the ignore patterns.
 */
function shouldIgnoreRoute(url: string, ignoreRoutes?: string[]): boolean {
  if (!ignoreRoutes || ignoreRoutes.length === 0) {
    return false
  }

  for (const pattern of ignoreRoutes) {
    if (pattern.endsWith('*')) {
      // Simple glob pattern: /health/* matches /health/live, /health/ready
      const prefix = pattern.slice(0, -1)
      if (url.startsWith(prefix)) {
        return true
      }
    } else if (pattern === url) {
      return true
    }
  }

  return false
}

/**
 * Creates the onRequest hook for starting spans.
 *
 * @param traceContext - TraceContextService instance
 * @param spanFactory - SpanFactoryService instance
 * @param config - Resolved OTel configuration
 * @param options - Plugin options
 * @returns Fastify onRequest hook
 */
export function createOnRequestHook(
  traceContext: TraceContextService,
  spanFactory: SpanFactoryService,
  config: ResolvedOtelConfig,
  options: FastifyOtelPluginOptions,
) {
  return async function onRequest(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    // Check if this route should be ignored
    if (shouldIgnoreRoute(request.url, options.ignoreRoutes)) {
      return
    }

    // Skip if HTTP auto-instrumentation is disabled
    if (!config.autoInstrument.http) {
      return
    }

    // Extract parent context from incoming headers
    const parentContext = traceContext.extractFromHeaders(
      request.headers as Record<string, string>,
    )

    // Get route pattern if available
    const route = request.routeOptions?.url

    // Create span for this request
    const span = spanFactory.createHttpSpan({
      method: request.method,
      url: request.url,
      route: route?.replaceAll(':', '$'),
      parentContext,
    })

    // Add additional request attributes
    span.setAttribute('http.request_id', request.id)

    if (request.headers['user-agent']) {
      span.setAttribute('http.user_agent', request.headers['user-agent'] as string)
    }

    // Store span on request for later access
    request.otelSpan = span
  }
}
