import { runInContext } from '../context/async-context.mjs'
import { RequestContext } from '../context/request-context.mjs'
import { GuardDeniedError } from '../errors/http-exception.mjs'

import type { ContextHost } from '../context/request-context.mjs'
import type { ErrorPipeline } from '../errors/error-pipeline.mjs'

import { isCustomResult, isEndpointReply } from './reply.mjs'
import { encodeSseStream, isSseStream } from './sse.mjs'
import { validateSchema } from './validation.mjs'

import type {
  RouteEndpointConfig,
  RouteExecutor,
  RouteInfo,
  RouteInput,
  RouteResult,
  SchemaLike,
} from './types.mjs'
import type { ValidationSource } from './validation.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Guard {
  canActivate(ctx: RequestContext): boolean | Promise<boolean>
}

export interface Interceptor {
  intercept(
    ctx: RequestContext,
    next: () => Promise<RouteResult>,
  ): RouteResult | Promise<RouteResult>
}

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
  encoders?: ReadonlyMap<
    string,
    (result: RouteResult, ctx: RequestContext) => RouteResult | Promise<RouteResult>
  >
  /** Run each request inside the async context, for `currentContext()`. */
  asyncContext?: boolean
}

type MaybePromise<T> = T | Promise<T>

const EMPTY_PARAMS = Object.freeze({})

/** Placeholder result for a response the handler wrote itself. */
const TAKEN_OVER: RouteResult = Object.freeze({ status: 200, body: undefined, kind: 'empty' })

function isPromise<T>(value: MaybePromise<T>): value is Promise<T> {
  return value instanceof Promise
}

// ----------------------------------------------------------------------------
// Request parameters
// ----------------------------------------------------------------------------

type ParamStep = (target: Record<string, unknown>, input: RouteInput) => void | Promise<void>

function validated(
  key: string,
  schema: SchemaLike,
  source: ValidationSource,
  read: (input: RouteInput) => unknown,
): ParamStep {
  return (target, input) => {
    const raw = read(input)
    if (isPromise(raw)) {
      return raw.then((value) => {
        const result = validateSchema(schema, value, source)
        if (isPromise(result)) {
          return result.then((settled) => {
            target[key] = settled
          })
        }
        target[key] = result
      })
    }
    const result = validateSchema(schema, raw, source)
    if (isPromise(result)) {
      return result.then((settled) => {
        target[key] = settled
      })
    }
    target[key] = result
  }
}

function headerRecord(input: RouteInput): Record<string, string> {
  const record: Record<string, string> = {}
  input.headers().forEach((value, name) => {
    record[name] = value
  })
  return record
}

/**
 * Builds the function that produces a handler's first argument. URL params,
 * query, headers and cookies are validated before the body is read.
 */
function compileParams(
  config: RouteEndpointConfig,
): (input: RouteInput, ctx: RequestContext) => MaybePromise<Record<string, unknown>> {
  const steps: ParamStep[] = []

  if (config.url.includes('$')) {
    steps.push(
      config.urlParamsSchema
        ? validated('urlParams', config.urlParamsSchema, 'urlParams', (input) => input.urlParams)
        : (target, input) => {
            target.urlParams = input.urlParams
          },
    )
  }
  if (config.querySchema) {
    steps.push(validated('params', config.querySchema, 'query', (input) => input.query()))
  }
  if (config.headersSchema) {
    steps.push(validated('headers', config.headersSchema, 'headers', headerRecord))
  }

  const cookiesSchema = config.cookiesSchema
  const requestSchema = config.requestSchema

  if (steps.length === 0 && !cookiesSchema && !requestSchema) {
    return () => EMPTY_PARAMS
  }

  if (requestSchema) {
    steps.push(validated('data', requestSchema, 'body', (input) => input.body()))
  }

  return (input, ctx) => {
    const target: Record<string, unknown> = {}
    if (cookiesSchema) {
      const result = validateSchema(cookiesSchema, ctx.cookies.all(), 'cookies')
      if (isPromise(result)) {
        return result.then((cookies) => {
          target.cookies = cookies
          return runSteps(steps, 0, target, input)
        })
      }
      target.cookies = result
    }
    return runSteps(steps, 0, target, input)
  }
}

function runSteps(
  steps: ParamStep[],
  from: number,
  target: Record<string, unknown>,
  input: RouteInput,
): MaybePromise<Record<string, unknown>> {
  for (let i = from; i < steps.length; i++) {
    const pending = steps[i](target, input)
    if (pending !== undefined) {
      return pending.then(() => runSteps(steps, i + 1, target, input))
    }
  }
  return target
}

// ----------------------------------------------------------------------------
// Response
// ----------------------------------------------------------------------------

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
function compileFinalizer(
  config: RouteEndpointConfig,
  validate: boolean,
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
  const first = await generator.next()
  async function* rest(): AsyncGenerator<unknown> {
    try {
      if (!first.done) {
        yield first.value
        yield* generator
      }
    } finally {
      await generator.return?.(undefined)
    }
  }
  return { status: 200, body: rest(), kind }
}

// ----------------------------------------------------------------------------
// Executor
// ----------------------------------------------------------------------------

function seal(result: RouteResult, ctx: RequestContext): RouteResult {
  const headers = ctx.responseHeaders
  const cookies = ctx.responseCookies
  if (headers === null && cookies === null && !ctx.needsRelease) {
    return result
  }
  const sealed: RouteResult = { ...result }
  if (headers !== null) {
    sealed.headers = result.headers ? { ...headers, ...result.headers } : headers
  }
  if (cookies !== null) {
    sealed.cookies = result.cookies ? [...cookies, ...result.cookies] : cookies
  }
  if (ctx.needsRelease) {
    sealed.release = () => ctx.release()
  }
  return sealed
}

function runGuards(guards: Guard[], from: number, ctx: RequestContext): void | Promise<void> {
  for (let i = from; i < guards.length; i++) {
    const allowed = guards[i].canActivate(ctx)
    if (isPromise(allowed)) {
      return allowed.then((value) => {
        if (!value) {
          throw new GuardDeniedError(guards[i].constructor.name)
        }
        return runGuards(guards, i + 1, ctx)
      })
    }
    if (!allowed) {
      throw new GuardDeniedError(guards[i].constructor.name)
    }
  }
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
  const params = compileParams(config)
  const finalize = compileFinalizer(config, options.validateResponses)

  // Request validation, handler and response validation.
  const handle = (ctx: RequestContext, input: RouteInput): MaybePromise<RouteResult> => {
    const args = params(input, ctx)
    const produced = isPromise(args) ? args.then((value) => invoke(value, ctx)) : invoke(args, ctx)
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
            return encoder === undefined ? result : encoder(result, ctx)
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

  let pipeline = guarded
  for (let i = interceptors.length - 1; i >= 0; i--) {
    const interceptor = interceptors[i]
    const inner = pipeline
    pipeline = (ctx, input) =>
      interceptor.intercept(ctx, () => {
        try {
          return Promise.resolve(inner(ctx, input))
        } catch (error) {
          return Promise.reject(error)
        }
      })
  }

  if (options.asyncContext) {
    const inner = pipeline
    pipeline = (ctx, input) => runInContext(ctx, () => inner(ctx, input))
  }

  const fail = (error: unknown, ctx: RequestContext): MaybePromise<RouteResult> => {
    const mapped = errors.toResult(error, ctx, config)
    return isPromise(mapped) ? mapped.then((result) => seal(result, ctx)) : seal(mapped, ctx)
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
