import { runInContext } from '../context/async-context.mjs'
import { RequestContext } from '../context/request-context.mjs'
import { GuardDeniedError } from '../errors/http-exception.mjs'

import type { ContextHost } from '../context/request-context.mjs'
import type { ErrorPipeline } from '../errors/error-pipeline.mjs'

import { adopt } from './promises.mjs'
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

type ParamStep = (
  target: Record<string, unknown>,
  input: RouteInput,
  ctx: RequestContext,
) => void | Promise<void>

function validated(
  key: string,
  schema: SchemaLike,
  source: ValidationSource,
  read: (input: RouteInput, ctx: RequestContext) => unknown,
): ParamStep {
  return (target, input, ctx) => {
    const raw = adopt(read(input, ctx))
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

function headerRecord(input: RouteInput): Record<string, string | undefined> {
  if (input.headerRecord !== undefined) {
    return input.headerRecord()
  }
  const record: Record<string, string> = {}
  input.headers().forEach((value, name) => {
    record[name] = value
  })
  return record
}

/**
 * The step that puts the URL params of the whole path into the handler's
 * argument. A schema describes the params of the endpoint's own url, so what
 * it returns is laid over the raw params of the prefixes.
 */
function urlParamsStep(schema: SchemaLike | undefined, ownUrl: string, path: string): ParamStep {
  if (schema === undefined) {
    return (target, input) => {
      target.urlParams = input.urlParams
    }
  }
  const validate = validated('urlParams', schema, 'urlParams', (input) => input.urlParams)
  const own = paramNames(ownUrl)
  const inherited = paramNames(path).filter((name) => !own.includes(name))
  if (inherited.length === 0) {
    return validate
  }
  const merge = (target: Record<string, unknown>, input: RouteInput): void => {
    const merged: Record<string, unknown> = {}
    for (const name of inherited) {
      merged[name] = input.urlParams[name]
    }
    target.urlParams = Object.assign(merged, target.urlParams)
  }
  return (target, input, ctx) => {
    const pending = validate(target, input, ctx)
    if (pending !== undefined) {
      return pending.then(() => merge(target, input))
    }
    merge(target, input)
  }
}

function paramNames(path: string): string[] {
  return Array.from(path.matchAll(/\$([A-Za-z0-9_]+)/g), (match) => match[1])
}

/**
 * Builds the function that produces a handler's first argument. URL params,
 * query, headers and cookies are validated before the body is read.
 *
 * `path` is the full route path: a module or global prefix may have params of
 * its own.
 */
function compileParams(
  config: RouteEndpointConfig,
  path: string,
): (input: RouteInput, ctx: RequestContext) => MaybePromise<Record<string, unknown>> {
  const steps: ParamStep[] = []

  if (path.includes('$')) {
    steps.push(urlParamsStep(config.urlParamsSchema, config.url, path))
  }
  if (config.querySchema) {
    steps.push(validated('params', config.querySchema, 'query', (_input, ctx) => ctx.query))
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
          return runSteps(steps, 0, target, input, ctx)
        })
      }
      target.cookies = result
    }
    return runSteps(steps, 0, target, input, ctx)
  }
}

function runSteps(
  steps: ParamStep[],
  from: number,
  target: Record<string, unknown>,
  input: RouteInput,
  ctx: RequestContext,
): MaybePromise<Record<string, unknown>> {
  for (let i = from; i < steps.length; i++) {
    const pending = steps[i](target, input, ctx)
    if (pending !== undefined) {
      return pending.then(() => runSteps(steps, i + 1, target, input, ctx))
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
  encoders: CompileOptions['encoders'],
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

function seal(result: RouteResult, ctx: RequestContext): RouteResult {
  ctx.responseStatus = result.status
  const headers = ctx.responseHeaders
  const cookies = ctx.responseCookies
  const release = ctx.needsRelease || (result.kind !== 'json' && isLazyBody(result))
  if (headers === null && cookies === null && !release) {
    return result
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

/** Only `true` lets a request through, whatever else a guard may return. */
function runGuards(guards: Guard[], from: number, ctx: RequestContext): void | Promise<void> {
  for (let i = from; i < guards.length; i++) {
    const allowed = adopt(guards[i].canActivate(ctx))
    if (isPromise(allowed)) {
      return allowed.then((value) => {
        if (value !== true) {
          throw new GuardDeniedError(guards[i].constructor.name)
        }
        return runGuards(guards, i + 1, ctx)
      })
    }
    if (allowed !== true) {
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

  let pipeline = guarded
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
