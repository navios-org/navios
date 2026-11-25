import { runInContext } from '@navios/core/transport'

import type { ContextHost } from '@navios/core/transport'

import { RequestContext } from '../context/request-context.mjs'
import { problem } from '../errors/problem.mjs'
import { adopt, isPromise } from '../internal/promises.mjs'

import type { ErrorPipeline } from '../errors/error-pipeline.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { RouteExecutor } from '../routing/compiled-route.mjs'
import type { HttpGuard as Guard } from '../routing/http-contracts.mjs'
import type { HttpInterceptor as Interceptor } from '../routing/http-contracts.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'
import type { RouteInput } from '../routing/route-input.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { compileFinalizer } from './compile-finalizer.mjs'
import { compileParams } from './compile-params.mjs'
import { runGuards } from './run-guards.mjs'

import type { ResponseEncoder } from './response-encoder.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RouteDefinition {
  info: RouteInfo
  /** The handler, bound to its controller. */
  invoke: (params: any, ctx: RequestContext) => unknown
  guards: Guard[]
  interceptors: Interceptor[]
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
}

/** Placeholder result for a response the handler wrote itself. */
const TAKEN_OVER: RouteResult = Object.freeze({ status: 200, body: undefined, kind: 'empty' })

/**
 * Whether the body is produced while it is being sent. Code that runs then
 * may still acquire request resources, so such a response is always released.
 */
function isLazyBody({ body }: RouteResult): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function' ||
      typeof (body as ReadableStream).getReader === 'function')
  )
}

/**
 * Stops a body that will never be sent, so that a generator runs its
 * `finally` blocks and a web stream its `cancel`.
 */
function cancelBody(body: unknown): void {
  try {
    const stream = body as { cancel?: () => unknown; return?: () => unknown }
    const pending =
      typeof stream.cancel === 'function'
        ? stream.cancel()
        : typeof stream.return === 'function'
          ? stream.return()
          : undefined
    if (isPromise(pending)) {
      pending.catch(() => {})
    }
  } catch {
    // The response it belonged to is already replaced by an error.
  }
}

function seal(result: RouteResult, ctx: RequestContext): RouteResult {
  ctx.responseStatus = result.status
  const headers = ctx.responseHeaders
  const cookies = ctx.responseCookies
  const release = ctx.needsRelease || (result.kind !== 'json' && isLazyBody(result))
  if (!release) {
    // Nothing will call release(), so nothing may be acquired from here on:
    // detached work that reaches for the request later is refused instead of
    // leaking a scope.
    ctx.released = true
    if (headers === null && cookies === null) {
      return result
    }
  }
  const sealed: RouteResult = { ...result }
  if (headers !== null) {
    sealed.headers = result.headers ? { ...headers, ...result.headers } : headers
  }
  if (cookies !== null) {
    sealed.cookies = result.cookies ? [...cookies, ...result.cookies] : cookies
  }
  if (release) {
    sealed.release = () => ctx.release()
  }
  return sealed
}

/**
 * Compiles one route into a function from an adapter's `RouteInput` to a
 * `RouteResult`.
 *
 * Stage order: interceptors enter, guards, request validation (URL params,
 * query, headers, cookies, then the body), handler, response validation,
 * interceptors exit. Anything thrown is mapped to a response at the end.
 *
 * Stages the route does not use are not part of its executor, and nothing is
 * awaited unless a stage is actually asynchronous.
 */
export function compileRoute(definition: RouteDefinition, options: CompileOptions): RouteExecutor {
  const { info, invoke, guards, interceptors } = definition
  const { host, errors } = options
  const config = info.endpoint
  const params = compileParams(config, info.path)
  const finalize = compileFinalizer(config, options.validateResponses, options.encoders)

  // Request validation, handler and response validation.
  const handle = (ctx: RequestContext, input: RouteInput): MaybePromise<RouteResult> => {
    const args = params(input, ctx)
    const produced = isPromise(args)
      ? args.then((value) => invoke(value, ctx))
      : adopt(invoke(args, ctx))
    if (input.responded === undefined) {
      return isPromise(produced) ? produced.then(finalize) : finalize(produced)
    }
    // The handler may have written the response itself through ctx.raw.
    const finish = (value: unknown): MaybePromise<RouteResult> =>
      input.responded!() ? TAKEN_OVER : finalize(value)
    return isPromise(produced) ? produced.then(finish) : finish(produced)
  }

  const encoders = options.encoders
  const encoded =
    encoders === undefined || encoders.size === 0
      ? handle
      : (ctx: RequestContext, input: RouteInput): MaybePromise<RouteResult> => {
          const encode = (result: RouteResult): MaybePromise<RouteResult> => {
            const encoder = encoders.get(result.kind)
            return encoder === undefined ? result : adopt(encoder(result, ctx))
          }
          const produced = handle(ctx, input)
          return isPromise(produced) ? produced.then(encode) : encode(produced)
        }

  const guarded =
    guards.length === 0
      ? encoded
      : (ctx: RequestContext, input: RouteInput): MaybePromise<RouteResult> => {
          const pending = runGuards(guards, 0, ctx)
          return pending === undefined
            ? encoded(ctx, input)
            : pending.then(() => encoded(ctx, input))
        }

  // A lazy body an interceptor received from next() and then threw away by
  // throwing. Only a route that can produce one, behind an interceptor, keeps
  // track of it.
  const discardable =
    interceptors.length > 0 && (config.response ?? 'json') !== 'json'
      ? new WeakMap<RequestContext, unknown>()
      : null

  let pipeline = guarded
  if (discardable !== null) {
    const remember = (result: RouteResult, ctx: RequestContext): RouteResult => {
      if (result.kind !== 'json' && isLazyBody(result)) {
        discardable.set(ctx, result.body)
      }
      return result
    }
    pipeline = (ctx, input) => {
      const result = guarded(ctx, input)
      return isPromise(result)
        ? result.then((value) => remember(value, ctx))
        : remember(result, ctx)
    }
  }
  for (let i = interceptors.length - 1; i >= 0; i--) {
    const interceptor = interceptors[i]
    const inner = pipeline
    const checked = (result: RouteResult): RouteResult => {
      if (typeof result?.status !== 'number') {
        throw new Error(
          `[Navios] Interceptor ${interceptor.constructor.name} did not return a result. ` +
            `Return what next() resolves to, or a result of its own.`,
        )
      }
      return result
    }
    pipeline = (ctx, input) => {
      const result = adopt(
        interceptor.intercept(ctx, () => {
          try {
            return Promise.resolve(inner(ctx, input))
          } catch (error) {
            return Promise.reject(error)
          }
        }),
      )
      return isPromise(result) ? result.then(checked) : checked(result)
    }
  }

  if (options.asyncContext) {
    const inner = pipeline
    pipeline = (ctx, input) => runInContext(ctx, () => inner(ctx, input))
  }

  // The error pipeline calls user code: mappers, responders and the logger.
  // If that throws as well, the adapter must still get a result, with the
  // release of whatever the request holds.
  const fallback = (ctx: RequestContext): RouteResult => seal(problem(500), ctx)

  const fail = (error: unknown, ctx: RequestContext): MaybePromise<RouteResult> => {
    if (discardable !== null) {
      const body = discardable.get(ctx)
      if (body !== undefined) {
        cancelBody(body)
      }
    }
    let mapped: MaybePromise<RouteResult>
    try {
      mapped = errors.toResult(error, ctx, config)
    } catch {
      return fallback(ctx)
    }
    return isPromise(mapped)
      ? mapped.then(
          (result) => seal(result, ctx),
          () => fallback(ctx),
        )
      : seal(mapped, ctx)
  }

  return (input) => {
    const ctx = new RequestContext(input, info, host)
    let result: MaybePromise<RouteResult>
    try {
      result = pipeline(ctx, input)
    } catch (error) {
      return fail(error, ctx)
    }
    if (isPromise(result)) {
      return result.then(
        (value) => seal(value, ctx),
        (error) => fail(error, ctx),
      )
    }
    return seal(result, ctx)
  }
}
