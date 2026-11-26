import { inject, registerInjectable } from '@navios/di'
import { context as otelContext, SpanKind, SpanStatusCode } from '@opentelemetry/api'

import type { ExecutionContext, HandlerInfo, Interceptor } from '@navios/core'

import { TracerToken } from '../sdk/tracer-token.mjs'
import {
  ATTR_NAVIOS_EXECUTION_ID,
  ATTR_NAVIOS_TRANSPORT,
  naviosAttributes,
} from '../tracing/attributes.mjs'
import { RequestSpan } from '../tracing/context.mjs'
import { describedOnce, recordException, runInSpan } from '../tracing/span.mjs'

/**
 * Opens one span around every handler run that is not an HTTP request: a
 * queue message, a command. HTTP requests get their server span from
 * `OtelHttpInterceptor`, which knows the route and the status.
 *
 * The span is named `<transport> <Class>.<handler>` and is the current span
 * for everything the handler does.
 */
export class OtelHandlerInterceptor implements Interceptor {
  private readonly tracer = inject(TracerToken)
  private readonly describe = describedOnce((handler: HandlerInfo, kind: string) => ({
    name: `${kind} ${handler.controller.name}.${handler.handlerName}`,
    attributes: { [ATTR_NAVIOS_TRANSPORT]: kind, ...naviosAttributes(handler) },
  }))

  intercept(ctx: ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
    if (ctx.kind === 'http') {
      return next()
    }
    const { name, attributes } = this.describe(ctx.handler, ctx.kind)
    const parent = otelContext.active()
    const span = this.tracer.startSpan(
      name,
      {
        kind: SpanKind.INTERNAL,
        attributes: { ...attributes, [ATTR_NAVIOS_EXECUTION_ID]: ctx.id },
      },
      parent,
    )
    ctx.set(RequestSpan, span)

    let failure: string | undefined
    ctx.onFinish(() => {
      span.setStatus(
        failure === undefined
          ? { code: SpanStatusCode.OK }
          : { code: SpanStatusCode.ERROR, message: failure },
      )
      span.end()
    })

    return runInSpan(span, parent, next, (error) => {
      failure = recordException(span, error)
    })
  }
}

registerInjectable(OtelHandlerInterceptor)
