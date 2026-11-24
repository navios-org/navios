import { isEndpointReply } from '../routing/reply.mjs'
import { ValidationError } from '../routing/validation.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { EndpointReply } from '../routing/reply.mjs'
import type { RouteEndpointConfig, RouteResult } from '../routing/types.mjs'

import { GuardDeniedError, HttpException } from './http-exception.mjs'
import { problem } from './problem.mjs'

import type { ErrorResponder } from './problem.mjs'

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

  toResult(
    error: unknown,
    ctx: RequestContext | null,
    config: RouteEndpointConfig | null,
  ): RouteResult | Promise<RouteResult> {
    const mapper = ctx === null ? undefined : this.findMapper(error)
    if (mapper !== undefined) {
      try {
        const mapped = mapper(error, ctx!)
        if (mapped instanceof Promise) {
          return mapped.then(normalise, (mapperError) => this.builtIn(mapperError, ctx, config))
        }
        return normalise(mapped)
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
      if (config?.errorSchema !== undefined && Object.hasOwn(config.errorSchema, statusCode)) {
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
    this.options.onUnhandled(error, ctx)
    return this.options.internal.getResponse(
      error,
      this.options.exposeErrorDetails && error instanceof Error ? error.message : undefined,
    )
  }
}

function normalise(mapped: RouteResult | EndpointReply): RouteResult {
  if (isEndpointReply(mapped)) {
    return mapped.body === undefined
      ? { status: mapped.status, body: undefined, kind: 'empty' }
      : { status: mapped.status, body: mapped.body, kind: 'json' }
  }
  return mapped
}
