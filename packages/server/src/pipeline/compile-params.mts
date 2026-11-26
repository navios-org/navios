import { compileBodyDecoder } from '../decoding/body-decoder.mjs'
import { fieldDecoder } from '../decoding/field-decoder.mjs'
import { adopt, isPromise } from '../internal/promises.mjs'
import { compileRoutePath } from '../routing/route-path.mjs'

import type { RouteInput } from '../adapter/route-input.mjs'
import type { RequestContext } from '../context/request-context.mjs'
import type { ValidationSource } from '../errors/validation-error.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { RouteEndpointConfig, SchemaLike } from '../routing/endpoint-config.mjs'
import type { RoutePath } from '../routing/route-path.mjs'

import { validateSchema } from './validate-schema.mjs'

const EMPTY_PARAMS = Object.freeze({})

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
function urlParamsStep(
  schema: SchemaLike | undefined,
  ownUrl: string,
  params: readonly string[],
): ParamStep {
  if (schema === undefined) {
    return (target, input) => {
      target.urlParams = input.urlParams
    }
  }
  const { decode } = fieldDecoder(schema)
  const validate = validated(
    'urlParams',
    schema,
    'urlParams',
    decode === undefined ? (input) => input.urlParams : (input) => decode(input.urlParams),
  )
  const own = ownUrl === '' ? [] : compileRoutePath(ownUrl).params
  const inherited = params.filter((name) => !own.includes(name))
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

/**
 * Builds the function that produces a handler's first argument. URL params,
 * query, headers and cookies are validated before the body is read.
 *
 * `path` is that of the whole route: a module or global prefix may have params
 * of its own.
 */
export function compileParams(
  config: RouteEndpointConfig,
  path: RoutePath,
): (input: RouteInput, ctx: RequestContext) => MaybePromise<Record<string, unknown>> {
  const steps: ParamStep[] = []

  if (path.params.length > 0) {
    steps.push(urlParamsStep(config.urlParamsSchema, config.url, path.params))
  }
  if (config.querySchema) {
    const { decode } = fieldDecoder(config.querySchema)
    steps.push(
      validated(
        'params',
        config.querySchema,
        'query',
        decode === undefined ? (_input, ctx) => ctx.query : (_input, ctx) => decode(ctx.query),
      ),
    )
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
    const decode = compileBodyDecoder(config)
    steps.push(validated('data', requestSchema, 'body', (_input, ctx) => ctx.readBody(decode)))
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
