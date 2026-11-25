import { isPromise } from '../internal/promises.mjs'
import { isCustomResult } from '../responses/custom-result.mjs'
import { isEndpointReply } from '../responses/reply.mjs'
import { encodeSseStream, isSseStream } from '../sse/sse-stream.mjs'

import type { MaybePromise } from '../internal/promises.mjs'
import type { RouteEndpointConfig, SchemaLike } from '../routing/endpoint-config.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { validateSchema } from './validate-schema.mjs'

import type { ResponseEncoder } from './response-encoder.mjs'

function describe(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'an array'
  }
  return `a value of type ${typeof value}`
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
  const result = validateSchema(schema, body, 'response')
  if (isPromise(result)) {
    return result.then((value) => ({ status, body: value, kind: 'json' }))
  }
  return { status, body: result, kind: 'json' }
}

/**
 * Builds the function that turns a handler's return value into a result,
 * checking it against what the endpoint declares.
 */
export function compileFinalizer(
  config: RouteEndpointConfig,
  validate: boolean,
  encoders: ReadonlyMap<string, ResponseEncoder> | undefined,
): (value: unknown) => MaybePromise<RouteResult> {
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
            `return reply(status, body), but it returned ${describe(value)}.`,
        )
      }
      return fromReply(value)
    }
  }

  if (kind !== 'json') {
    return (value) => {
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
      if (isSseStream(value)) {
        return {
          status: 200,
          headers: { 'cache-control': 'no-cache', 'x-accel-buffering': 'no' },
          body: encodeSseStream(value),
          kind: 'sse',
        }
      }
      if (isAsyncGenerator(value)) {
        return primeGenerator(value, kind)
      }
      if (value instanceof Blob && value.type) {
        return { status: 200, headers: { 'content-type': value.type }, body: value, kind }
      }
      return { status: 200, body: value, kind }
    }
  }

  if (responseSchema !== undefined && validate) {
    return (value) => {
      if (isEndpointReply(value)) {
        return fromReply(value)
      }
      const result = validateSchema(responseSchema, value, 'response')
      if (isPromise(result)) {
        return result.then((body) => ({ status: 200, body, kind: 'json' }))
      }
      return { status: 200, body: result, kind: 'json' }
    }
  }

  return (value) =>
    isEndpointReply(value) ? fromReply(value) : { status: 200, body: value, kind: 'json' }
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AsyncGenerator).next === 'function' &&
    typeof (value as AsyncGenerator)[Symbol.asyncIterator] === 'function'
  )
}

/**
 * Runs an async generator up to its first chunk before the response is
 * sealed. A generator's body does not run until it is first pulled, so
 * without this, headers it sets through `ctx.reply` before its first `yield`
 * would be set after the response headers were already taken.
 */
async function primeGenerator(
  generator: AsyncGenerator<unknown>,
  kind: RouteResult['kind'],
): Promise<RouteResult> {
  return { status: 200, body: new PrimedGenerator(generator, await generator.next()), kind }
}

/**
 * A generator whose first step has already been taken. It is an iterator
 * written by hand, not a second generator around the first: `return()` on a
 * generator that was never pulled skips its body, so a response dropped
 * before its first read would leave the handler's generator suspended, with
 * its `finally` blocks not run.
 */
class PrimedGenerator implements AsyncIterableIterator<unknown> {
  constructor(
    private readonly generator: AsyncGenerator<unknown>,
    private first: IteratorResult<unknown> | null,
  ) {}

  [Symbol.asyncIterator](): this {
    return this
  }

  next(): Promise<IteratorResult<unknown>> {
    const first = this.first
    if (first !== null) {
      this.first = null
      return Promise.resolve(first)
    }
    return this.generator.next()
  }

  return(value?: unknown): Promise<IteratorResult<unknown>> {
    this.first = null
    return this.generator.return(value)
  }

  throw(error?: unknown): Promise<IteratorResult<unknown>> {
    this.first = null
    return this.generator.throw(error)
  }
}
