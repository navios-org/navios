import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

import type { SpanFactoryService } from '@navios/otel'

/**
 * Creates the onError hook for recording errors on spans.
 *
 * @param spanFactory - SpanFactoryService instance
 * @returns Fastify onError hook
 */
export function createOnErrorHook(spanFactory: SpanFactoryService) {
  return async function onError(
    request: FastifyRequest,
    _reply: FastifyReply,
    error: FastifyError,
  ): Promise<void> {
    const span = request.otelSpan
    if (!span) {
      return
    }

    // Record the error on the span
    spanFactory.recordError(span, error)
  }
}
