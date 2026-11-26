import { adopt, isPromise } from '../internal/promises.mjs'
import { encodeResult } from '../pipeline/encode-result.mjs'
import { toRouteResult } from '../pipeline/to-route-result.mjs'
import { validateSchema } from '../pipeline/validate-schema.mjs'

import type { RouteResponse } from '../adapter/route-response.mjs'
import type { RequestContext } from '../context/request-context.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { EndpointReply } from '../responses/reply.mjs'
import type { RouteEndpointConfig } from '../routing/endpoint-config.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { GuardDeniedError } from './guard-denied-error.mjs'
import { HttpException } from './http-exception.mjs'
import { problem } from './problem.mjs'
import { ValidationError } from './validation-error.mjs'

import type { ErrorResponder } from './error-responders.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ErrorClass<E = unknown> = abstract new (...args: any[]) => E

export type ErrorMapper<E = unknown> = (
  error: E,
  ctx: RequestContext,
) => RouteResult | EndpointReply | Promise<RouteResult | EndpointReply>

/** The request an error belongs to. */
export interface ErrorSite {
  readonly method: string
  readonly path: string
}

export interface ErrorPipelineOptions {
  notFound: ErrorResponder
  forbidden: ErrorResponder
  validation: ErrorResponder
  internal: ErrorResponder
  exposeErrorDetails: boolean
  /**
   * Called for every error that is answered with a status of 500 or above,
   * and for an error that has no response to become: one of a stream that is
   * being sent, or of work that nobody waits for any more.
   */
  onUnhandled: (error: unknown, at: ErrorSite | null) => void
}

/**
 * Turns anything thrown while handling a request into a response.
 *
 * The most specific class wins. The built-in mappings count as registered
 * for `HttpException`, for a denied guard and for a `ValidationError`,
 * so a mapper for one of these classes or a subclass replaces the built-in,
 * and a mapper for `Error` gets only what none of them handles. What nothing
 * maps goes to the internal-error responder.
 */
export class ErrorPipeline {
  private readonly mappers = new Map<ErrorClass, ErrorMapper<any>>()

  constructor(private readonly options: ErrorPipelineOptions) {}

  add<E>(errorClass: ErrorClass<E>, mapper: ErrorMapper<E>): void {
    this.mappers.set(errorClass, mapper)
  }

  private findMapper(error: unknown): ErrorMapper<any> | undefined {
    if (this.mappers.size === 0 || error === null || typeof error !== 'object') {
      return undefined
    }
    for (
      let proto = Object.getPrototypeOf(error);
      proto !== null;
      proto = Object.getPrototypeOf(proto)
    ) {
      const mapper = this.mappers.get(proto.constructor)
      if (mapper !== undefined) {
        return mapper
      }
      // The built-in mapping of this class is more specific than a mapper
      // registered further up, for `Error`.
      if (
        proto === HttpException.prototype ||
        proto === GuardDeniedError.prototype ||
        proto === ValidationError.prototype
      ) {
        return undefined
      }
    }
    return undefined
  }

  /**
   * Reports an error that has no response to become. Not one of a request
   * whose client has gone, and that failed because of it.
   */
  report(error: unknown, at: ErrorSite | null): void {
    if (isAbort(error) && isAbandoned(at)) {
      return
    }
    try {
      this.options.onUnhandled(error, at)
    } catch {
      // A failing logger must not change the response.
    }
  }

  /**
   * Reports an error of work that nobody waits for any more, unless it is one
   * that a client gets to see and nobody else.
   * @internal
   */
  reportUnseen(error: unknown, at: ErrorSite | null): void {
    const isClientError =
      (error instanceof HttpException && error.statusCode < 500) ||
      error instanceof GuardDeniedError ||
      error instanceof ValidationError
    if (!isClientError) {
      this.report(error, at)
    }
  }

  /**
   * The response for a request that matched no route.
   */
  notFound(description?: string, at: ErrorSite | null = null): RouteResult {
    return this.respond('notFound', 404, null, at, description)
  }

  /**
   * The response for a request to a path that is served for other methods.
   */
  methodNotAllowed(method: string, path: string, allowed: readonly string[]): RouteResult {
    const result = problem(405, `${path} cannot be called with ${method}`)
    result.headers!.allow = allowed.join(', ')
    return result
  }

  /**
   * The response for an error outside a route's pipeline, such as one of a
   * plugin of the native server. Reported like any other unhandled error.
   */
  unexpected(error: unknown, at: ErrorSite | null = null): RouteResponse {
    const result = this.internal(error, at)
    try {
      return encodeResult(result)
    } catch (defect) {
      this.report(defect, at)
      return encodeResult(problem(500))
    }
  }

  /**
   * The result for a result that cannot be sent.
   * @internal
   */
  defect(error: unknown, ctx: RequestContext): RouteResult {
    return this.internal(error, ctx)
  }

  /**
   * The result for an error. Error mappers apply to one of a route's
   * pipeline, which has a context. For another, `at` is the request it is
   * reported with.
   */
  toResult(
    error: unknown,
    ctx: RequestContext | null,
    config: RouteEndpointConfig | null,
    at: ErrorSite | null = ctx,
  ): RouteResult | Promise<RouteResult> {
    const mapper = ctx === null ? undefined : this.findMapper(error)
    if (mapper === undefined) {
      return this.builtIn(error, at, config)
    }
    // A mapper that returns something other than a response is a defect of
    // the mapper. It is reported here, in one place, so that every adapter
    // answers it the same way.
    const refuse = (mapperError: unknown) => this.builtIn(mapperError, ctx, config)
    const settle = (mapped: unknown): MaybePromise<RouteResult> => {
      let result: RouteResult
      try {
        result = toRouteResult(mapped, () => `The error mapper for ${errorName(error)}`)
      } catch (defect) {
        return refuse(defect)
      }
      if (result.status >= 500) {
        this.report(error, ctx)
      }
      return result
    }
    let mapped: unknown
    try {
      mapped = adopt<unknown>(mapper(error, ctx!))
    } catch (mapperError) {
      return refuse(mapperError)
    }
    return isPromise(mapped) ? mapped.then(settle, refuse) : settle(mapped)
  }

  private builtIn(
    error: unknown,
    at: ErrorSite | null,
    config: RouteEndpointConfig | null,
  ): MaybePromise<RouteResult> {
    if (error instanceof HttpException) {
      const { statusCode, response } = error
      if (statusCode >= 500) {
        this.report(error, at)
      }
      if (typeof response === 'string') {
        // Not a declared body, which is an object.
        return problem(statusCode, response)
      }
      if (config?.errorSchema !== undefined && Object.hasOwn(config.errorSchema, statusCode)) {
        return this.declared(error, at, config)
      }
      return problem(statusCode, undefined, response as Record<string, unknown>)
    }
    if (error instanceof GuardDeniedError) {
      return this.respond('forbidden', 403, error, at)
    }
    if (error instanceof ValidationError) {
      return this.respond('validation', 400, error, at)
    }
    return this.internal(error, at)
  }

  /**
   * The body of an `HttpException` whose status the endpoint declares: what
   * the declared schema makes of it, so that it holds nothing the endpoint
   * does not declare.
   */
  private declared(
    { statusCode, response }: HttpException,
    at: ErrorSite | null,
    config: RouteEndpointConfig,
  ): MaybePromise<RouteResult> {
    const accept = (body: unknown): RouteResult => ({ status: statusCode, body, kind: 'json' })
    // The status was chosen on purpose, so it stays.
    const refuse = (mismatch: unknown): RouteResult => {
      this.report(
        new Error(
          `[Navios] ${config.method} ${config.url} threw an HttpException(${statusCode}) whose ` +
            `body does not match the declared errorSchema.`,
          { cause: mismatch },
        ),
        at,
      )
      return problem(statusCode)
    }
    try {
      const body = validateSchema(config.errorSchema![statusCode], response, 'response')
      return isPromise(body) ? body.then(accept, refuse) : accept(body)
    } catch (mismatch) {
      return refuse(mismatch)
    }
  }

  private internal(error: unknown, at: ErrorSite | null): RouteResult {
    this.report(error, at)
    return this.respond(
      'internal',
      500,
      error,
      at,
      this.options.exposeErrorDetails && error instanceof Error ? error.message : undefined,
    )
  }

  /** Asks a responder. One that does not answer with a response is a defect. */
  private respond(
    name: 'notFound' | 'forbidden' | 'validation' | 'internal',
    status: number,
    error: unknown,
    at: ErrorSite | null,
    description?: string,
  ): RouteResult {
    const responder = this.options[name]
    try {
      return toRouteResult(
        responder.getResponse(error, description),
        () => `The error responder ${responder.constructor.name}`,
      )
    } catch (defect) {
      this.report(defect, at)
      return problem(status)
    }
  }
}

function errorName(error: unknown): string {
  return error !== null && typeof error === 'object'
    ? (error.constructor?.name ?? 'an error')
    : typeof error
}

/** Whether an error is what work that was given an `AbortSignal` fails with, or was caused by one. */
function isAbort(error: unknown): boolean {
  let current = error
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const { name, cause } = current as { name?: unknown; cause?: unknown }
    if (name === 'AbortError' || name === 'CanceledError') {
      return true
    }
    current = cause
  }
  return false
}

/** Whether the client of a request has gone. Only the context of a request knows. */
function isAbandoned(at: ErrorSite | null): boolean {
  const signal = (at as Partial<RequestContext> | null)?.signal
  return signal instanceof AbortSignal && signal.aborted
}
