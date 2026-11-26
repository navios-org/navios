import { runInContext } from '@navios/core/transport'

import type { ContextHost } from '@navios/core/transport'

import { LiveRequests } from '../context/live-requests.mjs'
import { RequestContext } from '../context/request-context.mjs'
import { problem } from '../errors/problem.mjs'
import { adopt, isPromise } from '../internal/promises.mjs'
import { isLazyBody, ManagedBody } from '../responses/managed-body.mjs'
import { isEventStream } from '../responses/response-headers.mjs'
import { compileRequestPath } from '../routing/route-path.mjs'

import type { RouteExecutor } from '../adapter/compiled-route.mjs'
import type { RouteInput } from '../adapter/route-input.mjs'
import type { RouteResponse } from '../adapter/route-response.mjs'
import type { LiveRequestSet } from '../context/live-requests.mjs'
import type { RequestHost } from '../context/request-host.mjs'
import type { ErrorPipeline } from '../errors/error-pipeline.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { HttpGuard as Guard } from '../routing/http-contracts.mjs'
import type { HttpInterceptor as Interceptor } from '../routing/http-contracts.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'
import type { RoutePath } from '../routing/route-path.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { compileFinalizer, PrimedGenerator } from './compile-finalizer.mjs'
import { compileParams } from './compile-params.mjs'
import { encodeResponse } from './encode-result.mjs'
import { runGuards } from './run-guards.mjs'
import { toRouteResult } from './to-route-result.mjs'

import type { ResponseEncoder } from './response-encoder.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RouteDefinition {
  info: RouteInfo
  /** `info.path`, taken apart. */
  path: RoutePath
  /** The handler, bound to its controller. */
  invoke: (params: any, ctx: RequestContext) => unknown
  guards: Guard[]
  /** Interceptors around the guards: those of the application and the transport. */
  outer: Interceptor[]
  /** Interceptors behind the guards: those of the module, the controller and the handler. */
  inner: Interceptor[]
}

export interface CompileOptions {
  host: ContextHost
  errors: ErrorPipeline
  validateResponses: boolean
  /**
   * Encoders for custom response kinds. An encoder runs inside the pipeline,
   * after the handler's value has become a result and before interceptors
   * exit, so an error it throws is mapped like any other.
   */
  encoders?: ReadonlyMap<string, ResponseEncoder>
  /** Run each request inside the async context, for `currentContext()`. */
  asyncContext?: boolean
  /** Receives the requests that hold something, and loses them once it is released. */
  live?: LiveRequestSet
}

type Stage = (ctx: RequestContext, input: RouteInput) => MaybePromise<RouteResult>

/** Makes the request the owner of a lazy body, whatever becomes of the result. */
function own(result: RouteResult, ctx: RequestContext): RouteResult {
  if (result.kind !== 'json' && isLazyBody(result.body)) {
    ctx.ownBody(result.body)
  }
  return result
}

/**
 * Compiles one route into a function from an adapter's `RouteInput` to the
 * `RouteResponse` to write.
 *
 * Stage order: outer interceptors enter, guards, inner interceptors enter,
 * request validation (URL params, query, headers, cookies, then the body),
 * handler, response validation, interceptors exit, encoding. Anything thrown
 * is mapped to a response at the end.
 *
 * Guards come before the interceptors attached to handlers because one of
 * those may answer without calling `next()`: a cached response must not be
 * given to a caller the guards would refuse.
 *
 * Stages the route does not use are not part of its executor, and nothing is
 * awaited unless a stage is actually asynchronous.
 */
export function compileRoute(definition: RouteDefinition, options: CompileOptions): RouteExecutor {
  const { info, guards, outer, inner } = definition
  const { errors } = options
  const config = info.endpoint
  const { container, onScopedUse, logger } = options.host
  const host: RequestHost = {
    container,
    onScopedUse,
    logger,
    asyncContext: options.asyncContext ?? false,
    live: options.live ?? new LiveRequests(),
    path: compileRequestPath(definition.path),
    report: (error, ctx) => errors.report(error, ctx),
  }

  let pipeline = compileHandler(definition, options)
  const encoders = options.encoders
  if (encoders !== undefined && encoders.size > 0) {
    pipeline = encoded(pipeline, encoders)
  }
  for (let i = inner.length - 1; i >= 0; i--) {
    pipeline = intercepted(pipeline, inner[i], errors)
  }
  if (guards.length > 0) {
    const allowed = pipeline
    pipeline = (ctx, input) => {
      const pending = runGuards(guards, 0, ctx)
      return pending === undefined ? allowed(ctx, input) : pending.then(() => allowed(ctx, input))
    }
  }
  for (let i = outer.length - 1; i >= 0; i--) {
    pipeline = intercepted(pipeline, outer[i], errors)
  }

  // What error mapping answers with may not be sendable either: the result of
  // a mapper or a responder. The adapter still gets a response, a plain 500
  // without what was set through `ctx.reply`, with the release of whatever
  // the request holds.
  const respondToFailure = (result: RouteResult, ctx: RequestContext): RouteResponse => {
    try {
      return encodeResponse(result, ctx)
    } catch (defect) {
      errors.report(defect, ctx)
      ctx.responseHeaders = null
      ctx.responseCookies = null
      return encodeResponse(problem(500), ctx)
    }
  }

  // The error pipeline answers every error, and guards the code it calls.
  const fail = (error: unknown, ctx: RequestContext): MaybePromise<RouteResponse> => {
    ctx.dropSuccessHeaders()
    const mapped = errors.toResult(error, ctx, config)
    return isPromise(mapped)
      ? mapped.then((result) => respondToFailure(result, ctx))
      : respondToFailure(mapped, ctx)
  }

  const respond = (result: RouteResult, ctx: RequestContext): MaybePromise<RouteResponse> => {
    let response: RouteResponse
    try {
      response = encodeResponse(result, ctx)
    } catch (error) {
      return fail(error, ctx)
    }
    // A stream that cannot start, for example a file that is not there, is an
    // error like any other. Not so an event stream, whose headers must not
    // wait for its first event.
    const { body, headers } = response
    if (
      !(body instanceof ManagedBody) ||
      result.kind === 'sse' ||
      isEventStream(headers) ||
      ctx.method === 'HEAD'
    ) {
      return response
    }
    const first = result.body instanceof PrimedGenerator ? result.body.take() : null
    if (first !== null) {
      try {
        body.accept(first)
      } catch (error) {
        return fail(error, ctx)
      }
      return response
    }
    return body
      .prime(() => ctx.signal)
      .then(
        () => response,
        (error) => fail(error, ctx),
      )
  }

  const execute = (ctx: RequestContext, input: RouteInput): MaybePromise<RouteResponse> => {
    let result: MaybePromise<RouteResult>
    try {
      result = pipeline(ctx, input)
    } catch (error) {
      return fail(error, ctx)
    }
    return isPromise(result)
      ? result.then(
          (value) => respond(value, ctx),
          (error) => fail(error, ctx),
        )
      : respond(result, ctx)
  }

  if (host.asyncContext) {
    return (input) => {
      const ctx = new RequestContext(input, info, host)
      return runInContext(ctx, () => execute(ctx, input))
    }
  }
  return (input) => execute(new RequestContext(input, info, host), input)
}

/** Request validation, handler and response validation. */
function compileHandler(definition: RouteDefinition, options: CompileOptions): Stage {
  const { info, invoke } = definition
  const config = info.endpoint
  const params = compileParams(config, definition.path)
  const finalize = compileFinalizer(config, options.validateResponses, options.encoders)

  return (ctx, input) => {
    const args = params(input, ctx)
    const produced = isPromise(args)
      ? args.then((value) => invoke(value, ctx))
      : adopt(invoke(args, ctx))
    if (input.responded === undefined) {
      return isPromise(produced)
        ? produced.then((value) => finalize(value, ctx))
        : finalize(produced, ctx)
    }
    // The handler may have written the response itself through ctx.raw.
    const finish = (value: unknown): MaybePromise<RouteResult> => {
      if (input.responded!()) {
        ctx.takeOver()
        return { status: input.respondedStatus?.() ?? 200, body: undefined, kind: 'empty' }
      }
      return finalize(value, ctx)
    }
    return isPromise(produced) ? produced.then(finish) : finish(produced)
  }
}

function encoded(inner: Stage, encoders: ReadonlyMap<string, ResponseEncoder>): Stage {
  return (ctx, input) => {
    const encode = (result: RouteResult): MaybePromise<RouteResult> => {
      const encoder = encoders.get(result.kind)
      if (encoder === undefined) {
        return result
      }
      const accept = (value: unknown) =>
        own(
          toRouteResult(value, () => `The encoder of "${result.kind}" responses`),
          ctx,
        )
      const answer = adopt<unknown>(encoder(result, ctx))
      return isPromise(answer) ? answer.then(accept) : accept(answer)
    }
    const produced = inner(ctx, input)
    return isPromise(produced) ? produced.then(encode) : encode(produced)
  }
}

const INTERCEPTOR_ADVICE = 'Return what next() resolves to, or a result of its own.'

function intercepted(inner: Stage, interceptor: Interceptor, errors: ErrorPipeline): Stage {
  const name = () => `Interceptor ${interceptor.constructor.name}`
  return (ctx, input) => {
    let settled = false
    const next = (): Promise<RouteResult> => {
      let pending: Promise<RouteResult>
      try {
        pending = Promise.resolve(inner(ctx, input))
      } catch (error) {
        pending = Promise.reject(error)
      }
      // The interceptor may not wait for it, and then nobody else sees it fail.
      pending.catch((error) => {
        if (settled) {
          errors.reportUnseen(error, ctx)
        }
      })
      return pending
    }
    const accept = (value: unknown): RouteResult => {
      settled = true
      return own(toRouteResult(value, name, INTERCEPTOR_ADVICE), ctx)
    }
    const refuse = (error: unknown): never => {
      settled = true
      throw error
    }
    let answer: unknown
    try {
      answer = adopt<unknown>(interceptor.intercept(ctx, next))
    } catch (error) {
      return refuse(error)
    }
    return isPromise(answer) ? answer.then(accept, refuse) : accept(answer)
  }
}
