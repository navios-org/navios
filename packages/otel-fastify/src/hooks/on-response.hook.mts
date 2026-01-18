import type { SpanFactoryService } from '@navios/otel'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Creates the onResponse hook for ending spans.
 *
 * @param spanFactory - SpanFactoryService instance
 * @returns Fastify onResponse hook
 */
export function createOnResponseHook(spanFactory: SpanFactoryService) {
  return async function onResponse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const span = request.otelSpan
    if (!span) {
      return
    }

    // Set response attributes and status
    spanFactory.setHttpResponse(span, reply.statusCode)

    // Add response content length if available
    const contentLength = reply.getHeader('content-length')
    if (contentLength) {
      const length = typeof contentLength === 'string' ? parseInt(contentLength, 10) : contentLength
      if (!isNaN(length as number)) {
        span.setAttribute('http.response_content_length', length as number)
      }
    }

    // End the span
    span.end()
  }
}
