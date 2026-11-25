import { adopt } from '../internal/promises.mjs'
import { isEndpointReply } from '../responses/reply.mjs'

import type { RequestContext } from '../context/request-context.mjs'
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

export interface ErrorPipelineOptions {
  notFound: ErrorResponder
  forbidden: ErrorResponder
  validation: ErrorResponder
  internal: ErrorResponder
  exposeErrorDetails: boolean
  /**
   * Check the body of a thrown `HttpException` against the endpoint's
   * `errorSchema` and report a mismatch through `onUnhandled`. The response
   * is sent either way.
   */
  checkDeclaredErrors?: boolean
  /** Called for every error that becomes a 500. */
  onUnhandled: (error: unknown, ctx: RequestContext | null) => void
}

/**
 * Turns anything thrown while handling a request into a response.
 *
 * Order: a mapper registered for the error's class (most specific class
 * first), `HttpException`, a denied guard, request validation errors, and
 * finally the internal-error responder.
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
    }
    return undefined
  }

  /**
   * The response for a request that matched no route.
   */
  notFound(description?: string): RouteResult {
    return this.options.notFound.getResponse(null, description)
  }

  /**
   * The response for an error outside a route's pipeline, such as a body an
   * adapter could not serialise. Reported like any other unhandled error.
   */
  unexpected(error: unknown): RouteResult {
    return this.internal(error, null)
  }

  toResult(
    error: unknown,
    ctx: RequestContext | null,
    config: RouteEndpointConfig | null,
  ): RouteResult | Promise<RouteResult> {
    const mapper = ctx === null ? undefined : this.findMapper(error)
    if (mapper !== undefined) {
      // A mapper that returns something other than a response is a defect of
      // the mapper. It is reported here, in one place, so that every adapter
      // answers it the same way.
      const settle = (mapped: RouteResult | EndpointReply): RouteResult => {
        const result = normalise(mapped)
        if (typeof result?.status !== 'number') {
          return this.builtIn(
            new Error(
              `[Navios] The error mapper for ${errorName(error)} did not return a response. ` +
                `Return reply(status, body), problem(status, detail) or a RouteResult.`,
            ),
            ctx,
            config,
          )
        }
        return result
      }
      try {
        const mapped = adopt(mapper(error, ctx!))
        if (mapped instanceof Promise) {
          return mapped.then(settle, (mapperError) => this.builtIn(mapperError, ctx, config))
        }
        return settle(mapped)
      } catch (mapperError) {
        return this.builtIn(mapperError, ctx, config)
      }
    }
    return this.builtIn(error, ctx, config)
  }

  private builtIn(
    error: unknown,
    ctx: RequestContext | null,
    config: RouteEndpointConfig | null,
  ): RouteResult {
    if (error instanceof HttpException) {
      const { statusCode, response } = error
      // An object response on a status the endpoint declares is the declared
      // body. A string cannot be one, so it is reported as a problem.
      if (
        typeof response !== 'string' &&
        config?.errorSchema !== undefined &&
        Object.hasOwn(config.errorSchema, statusCode)
      ) {
        if (this.options.checkDeclaredErrors) {
          const checked = adopt(config.errorSchema[statusCode]['~standard'].validate(response))
          if (checked instanceof Promise) {
            checked.catch(() => {})
          } else if (checked.issues) {
            this.options.onUnhandled(
              new Error(
                `${config.method} ${config.url} threw an HttpException(${statusCode}) whose body ` +
                  `does not match the declared errorSchema: ${checked.issues
                    .map((issue) => issue.message)
                    .join('; ')}`,
              ),
              ctx,
            )
          }
        }
        return { status: statusCode, body: response, kind: 'json' }
      }
      return typeof response === 'string'
        ? problem(statusCode, response)
        : problem(statusCode, undefined, response as Record<string, unknown>)
    }
    if (error instanceof GuardDeniedError) {
      return this.options.forbidden.getResponse(error)
    }
    if (error instanceof ValidationError && error.source !== 'response') {
      return this.options.validation.getResponse(error)
    }
    return this.internal(error, ctx)
  }

  private internal(error: unknown, ctx: RequestContext | null): RouteResult {
    this.options.onUnhandled(error, ctx)
    return this.options.internal.getResponse(
      error,
      this.options.exposeErrorDetails && error instanceof Error ? error.message : undefined,
    )
  }
}

function errorName(error: unknown): string {
  return error !== null && typeof error === 'object'
    ? (error.constructor?.name ?? 'an error')
    : typeof error
}

function normalise(mapped: RouteResult | EndpointReply): RouteResult {
  if (isEndpointReply(mapped)) {
    return mapped.body === undefined
      ? { status: mapped.status, body: undefined, kind: 'empty' }
      : { status: mapped.status, body: mapped.body, kind: 'json' }
  }
  return mapped
}
