import { describeValue } from '../internal/describe-value.mjs'
import { ignore, isPromise } from '../internal/promises.mjs'
import { isCustomResult } from '../responses/custom-result.mjs'
import { isLazyBody } from '../responses/managed-body.mjs'
import { isEndpointReply } from '../responses/reply.mjs'
import { isEventStream } from '../responses/response-headers.mjs'
import { SseBody } from '../sse/sse-body.mjs'
import { isSseStream } from '../sse/sse-stream.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { RouteEndpointConfig, SchemaLike } from '../routing/endpoint-config.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { validateSchema } from './validate-schema.mjs'

import type { ResponseEncoder } from './response-encoder.mjs'

/** A JSON result of what `schema` makes of `body`. */
function validatedBody(
  status: number,
  schema: SchemaLike,
  body: unknown,
): MaybePromise<RouteResult> {
  const result = validateSchema(schema, body, 'response')
  if (isPromise(result)) {
    return result.then((value) => ({ status, body: value, kind: 'json' }))
  }
  return { status, body: result, kind: 'json' }
}

function withBody(
  status: number,
  schema: SchemaLike | null | undefined,
  body: unknown,
  validate: boolean,
): MaybePromise<RouteResult> {
  if (schema === null) {
    return { status, body: undefined, kind: 'empty' }
  }
  if (schema === undefined || !validate) {
    return { status, body, kind: 'json' }
  }
  return validatedBody(status, schema, body)
}

/**
 * Builds the function that turns a handler's return value into a result,
 * checking it against what the endpoint declares.
 */
export function compileFinalizer(
  config: RouteEndpointConfig,
  validate: boolean,
  encoders: ReadonlyMap<string, ResponseEncoder> | undefined,
): (value: unknown, ctx: RequestContext) => MaybePromise<RouteResult> {
  const endpoint = `${config.method} ${config.url}`
  const { responses, errorSchema, responseSchema } = config
  const kind = config.response ?? 'json'

  const fromReply = (value: { status: number; body: unknown }): MaybePromise<RouteResult> => {
    const { status, body } = value
    if (responses !== undefined && Object.hasOwn(responses, status)) {
      return withBody(status, responses[status], body, validate)
    }
    if (errorSchema !== undefined && Object.hasOwn(errorSchema, status)) {
      return withBody(status, errorSchema[status], body, validate)
    }
    const declared = [...Object.keys(responses ?? {}), ...Object.keys(errorSchema ?? {})]
    throw new Error(
      `[Navios] ${endpoint} replied with status ${status}, which the endpoint does not declare ` +
        `(declared: ${declared.length > 0 ? declared.join(', ') : 'none'}).`,
    )
  }

  if (kind === 'void') {
    return (value) =>
      isEndpointReply(value) ? fromReply(value) : { status: 204, body: undefined, kind: 'empty' }
  }

  if (responses !== undefined) {
    return (value) => {
      if (!isEndpointReply(value)) {
        throw new Error(
          `[Navios] ${endpoint} is declared with a per-status responses map, so its handler must ` +
            `return reply(status, body), but it returned ${describeValue(value)}.`,
        )
      }
      return fromReply(value)
    }
  }

  if (kind !== 'json') {
    return (value, ctx) => {
      if (isEndpointReply(value)) {
        return fromReply(value)
      }
      if (isCustomResult(value)) {
        if (encoders === undefined || !encoders.has(value.kind)) {
          throw new Error(
            `[Navios] ${endpoint} returned a result of kind "${value.kind}", but no encoder is ` +
              `registered for that kind. Register the plugin that provides it with app.usePlugin().`,
          )
        }
        return value.headers === undefined
          ? { status: value.status, body: value.body, kind: value.kind }
          : { status: value.status, headers: value.headers, body: value.body, kind: value.kind }
      }
      // The request owns a lazy body from here on, so that one that is never
      // sent, whatever the reason, is closed with the request.
      if (isSseStream(value)) {
        const body = new SseBody(value)
        ctx.ownBody(body)
        return { status: 200, body, kind: 'sse' }
      }
      if (isAsyncGenerator(value)) {
        // Run up to its first chunk, for the headers it sets before it. An
        // interceptor that wraps the body still reads that chunk first.
        const body = ctx.ownBody(value)
        const result: RouteResult = { status: 200, body, kind }
        const first = body.start()
        // An event stream may have nothing to send for a long time: its
        // headers are those that the generator has set until it first waits.
        if (isEventStream(ctx.responseHeaders)) {
          // Whoever reads it sees the rejection. Nobody may.
          first.catch(ignore)
          return result
        }
        return body.prime(() => ctx.signal).then(() => result)
      }
      if (isLazyBody(value)) {
        ctx.ownBody(value)
      }
      return { status: 200, body: value, kind }
    }
  }

  if (responseSchema !== undefined && validate) {
    return (value) =>
      isEndpointReply(value) ? fromReply(value) : validatedBody(200, responseSchema, value)
  }

  return (value) =>
    isEndpointReply(value) ? fromReply(value) : { status: 200, body: value, kind: 'json' }
}

function isAsyncGenerator(value: unknown): value is AsyncIterableIterator<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AsyncIterableIterator<unknown>).next === 'function' &&
    typeof (value as AsyncIterableIterator<unknown>)[Symbol.asyncIterator] === 'function'
  )
}
