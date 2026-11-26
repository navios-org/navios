import { inject, registerInjectable } from '@navios/di'
import { context as otelContext, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

import type { ExecutionContext, HandlerInfo, Interceptor } from '@navios/core'
import type { AttributeValue } from '@opentelemetry/api'

import { TracerToken } from '../sdk/tracer-token.mjs'
import { RequestSpan } from '../tracing/context.mjs'

interface HandlerSpan {
  name: string
  attributes: Record<string, AttributeValue>
}

/**
 * Opens one span around every handler run that is not an HTTP request: a
 * queue message, a command, a job. HTTP requests get their server span from
 * `OtelHttpInterceptor`, which knows the route and the status.
 *
 * The span is named `<transport> <Class>.<handler>` and is the current span
 * for everything the handler does.
 */
export class OtelHandlerInterceptor implements Interceptor {
  private readonly tracer = inject(TracerToken)
  private readonly handlers = new WeakMap<HandlerInfo, HandlerSpan>()

  private describe(kind: string, handler: HandlerInfo): HandlerSpan {
    let described = this.handlers.get(handler)
    if (described === undefined) {
      const attributes: Record<string, AttributeValue> = {
        'navios.transport': kind,
        'navios.controller': handler.controller.name,
        'navios.handler': handler.handlerName,
      }
      if (handler.module) {
        attributes['navios.module'] = handler.module.name
      }
      described = {
        name: `${kind} ${handler.controller.name}.${handler.handlerName}`,
        attributes,
      }
      this.handlers.set(handler, described)
    }
    return described
  }

  intercept(ctx: ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
    if (ctx.kind === 'http') {
      return next()
    }
    const { name, attributes } = this.describe(ctx.kind, ctx.handler)
    const parent = otelContext.active()
    const span = this.tracer.startSpan(
      name,
      { kind: SpanKind.INTERNAL, attributes: { ...attributes, 'navios.execution_id': ctx.id } },
      parent,
    )
    ctx.set(RequestSpan, span)

    let failure: string | undefined
    let failed = false
    ctx.onFinish(() => {
      span.setStatus(
        failed ? { code: SpanStatusCode.ERROR, message: failure } : { code: SpanStatusCode.OK },
      )
      span.end()
    })

    const fail = (error: unknown): never => {
      failed = true
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

registerInjectable(OtelHandlerInterceptor)
