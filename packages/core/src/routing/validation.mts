import type { StandardSchemaIssue, StandardSchemaV1 } from '@navios/di'

import { resumeStacks, suspendStacks } from '../errors/client-error-stacks.mjs'

import { adopt } from './promises.mjs'

export type ValidationSource = 'urlParams' | 'query' | 'headers' | 'cookies' | 'body' | 'response'

/**
 * A value did not match its schema. `source` says which part of the request
 * (or the response) was being validated. For a request, the stack is captured
 * as the `clientErrorStacks` application option says.
 */
export class ValidationError extends Error {
  static {
    Object.defineProperties(this.prototype, {
      name: { value: 'ValidationError', writable: true, configurable: true },
      // The response is built from `issues`, so without a stack the message
      // is only formatted when something reads it.
      message: {
        get(this: ValidationError): string {
          return describeIssues(this.source, this.issues)
        },
        set(this: ValidationError, value: string) {
          Object.defineProperty(this, 'message', { value, writable: true, configurable: true })
        },
        configurable: true,
      },
    })
  }

  constructor(
    public readonly source: ValidationSource,
    public readonly issues: ReadonlyArray<StandardSchemaIssue>,
  ) {
    // A response that does not match is a defect of the server.
    const limit = source === 'response' ? undefined : suspendStacks()
    super(limit === undefined ? describeIssues(source, issues) : undefined)
    resumeStacks(limit)
  }
}

function describeIssues(
  source: ValidationSource,
  issues: ReadonlyArray<StandardSchemaIssue>,
): string {
  return `Validation failed for ${source}: ${issues
    .map((issue) => {
      const path = formatPath(issue.path)
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')}`
}

export function formatPath(path: StandardSchemaIssue['path']): string {
  if (!path || path.length === 0) {
    return ''
  }
  return path
    .map((segment) =>
      String(typeof segment === 'object' && segment !== null ? segment.key : segment),
    )
    .join('.')
}

interface Payload {
  value: unknown
  issues: unknown[]
}

/** What a zod 4 schema (classic or mini) offers besides Standard Schema. */
interface ZodSchema extends StandardSchemaV1 {
  _zod: { run(payload: Payload, ctx: { async: boolean }): Payload | Promise<Payload> }
  safeParseAsync(
    value: unknown,
  ): Promise<
    | { success: true; data: unknown }
    | { success: false; error: { issues: ReadonlyArray<StandardSchemaIssue> } }
  >
}

function isZod(schema: StandardSchemaV1): schema is ZodSchema {
  const { _zod, safeParseAsync } = schema as Partial<ZodSchema>
  return (
    schema['~standard'].vendor === 'zod' &&
    typeof _zod?.run === 'function' &&
    typeof safeParseAsync === 'function'
  )
}

/**
 * Schemas whose way of validating is known: `true` for a zod schema with
 * asynchronous checks, which is validated with `safeParseAsync`, and `false`
 * for every other.
 *
 * Standard Schema does not say whether a schema is asynchronous. Zod's
 * implementation validates synchronously first and, on meeting an
 * asynchronous check, starts over. The checks before it and the start of the
 * asynchronous one then happen twice, and the promise of the first attempt is
 * dropped: if it rejects, nobody handles it and the process ends.
 */
const isAsync = new WeakMap<StandardSchemaV1, boolean>()

function ignore(): void {}

async function validateZodAsync(
  schema: ZodSchema,
  value: unknown,
  source: ValidationSource,
): Promise<unknown> {
  const result = await schema.safeParseAsync(value)
  if (!result.success) {
    throw new ValidationError(source, result.error.issues)
  }
  return result.data
}

/**
 * Finds out how a schema validates from a value. A valid value that meets no
 * asynchronous check settles it; an invalid one may have stopped before it.
 */
function learn(schema: StandardSchemaV1, value: unknown): boolean {
  if (!isZod(schema)) {
    isAsync.set(schema, false)
    return false
  }
  let outcome: Payload | Promise<Payload>
  try {
    outcome = schema._zod.run({ value, issues: [] }, { async: true })
  } catch {
    // A check threw. Validating reports it.
    return false
  }
  if (outcome instanceof Promise) {
    outcome.catch(ignore)
    isAsync.set(schema, true)
    return true
  }
  if (outcome.issues.length === 0) {
    isAsync.set(schema, false)
  }
  return false
}

/**
 * Validates `value` with any Standard Schema. Returns the validated value
 * directly when the schema validates synchronously, and a promise only when
 * the schema itself is asynchronous.
 */
export function validateSchema(
  schema: StandardSchemaV1,
  value: unknown,
  source: ValidationSource,
): unknown | Promise<unknown> {
  if (isAsync.get(schema) ?? learn(schema, value)) {
    return validateZodAsync(schema as ZodSchema, value, source)
  }
  const result = adopt(schema['~standard'].validate(value))
  if (result instanceof Promise) {
    if (isZod(schema)) {
      // An asynchronous check in a branch that no value has reached before.
      isAsync.set(schema, true)
    }
    return result.then((settled) => {
      if (settled.issues) {
        throw new ValidationError(source, settled.issues)
      }
      return settled.value
    })
  }
  if (result.issues) {
    throw new ValidationError(source, result.issues)
  }
  return result.value
}
