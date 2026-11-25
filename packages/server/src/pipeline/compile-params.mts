import { adopt, isPromise } from '../internal/promises.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { ValidationSource } from '../errors/validation-error.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { RouteEndpointConfig, SchemaLike } from '../routing/endpoint-config.mjs'
import type { RouteInput } from '../routing/route-input.mjs'

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
export function compileParams(
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
