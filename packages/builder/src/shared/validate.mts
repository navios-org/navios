import { NaviosError } from './navios-error.mjs'
import { isZod3, isZod4, replayZod4, scanZod, trySync } from './zod.mjs'

import type { Schema, SchemaResult, StandardIssue } from './schema.mjs'
import type { Zod3Schema, Zod4Schema, ZodResult } from './zod.mjs'

export type ValidationOutcome =
  | { ok: true; value: unknown }
  /** `cause` is the `ZodError` of a Zod schema, what a schema threw, or the issues themselves. */
  | { ok: false; issues: readonly StandardIssue[]; cause: unknown }

type MaybePromise<T> = T | Promise<T>

/**
 * Validates a value with any Standard Schema, which may be asynchronous.
 *
 * The promise never rejects: a schema that throws is reported as a failed
 * outcome with the thrown value as `cause`.
 */
export async function validate(schema: Schema, value: unknown): Promise<ValidationOutcome> {
  return run(schema, value, false)
}

/**
 * Synchronous counterpart of {@link validate}. Throws on failure: the schema's
 * own error for Zod (a `ZodError`), a `NaviosError` otherwise, also for a
 * schema that validates asynchronously.
 */
export function parseSync(schema: Schema | undefined, value: unknown): unknown {
  if (!schema) return value
  const outcome = validateEager(schema, value)
  if (isPendingOutcome(outcome)) {
    throw new NaviosError('[Navios]: asynchronous schemas are not supported here')
  }
  if (outcome.ok) return outcome.value
  if (outcome.cause instanceof Error) throw outcome.cause
  throw new NaviosError(
    `[Navios]: validation failed: ${outcome.issues.map((issue) => issue.message).join('; ')}`,
    { cause: outcome.cause },
  )
}

/**
 * {@link parseSync} for a query, which may be left out when the schema accepts
 * `undefined` or has no required fields. Otherwise the failure names the fields.
 */
export function parseQuery(
  schema: Schema | undefined,
  query: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!schema) return undefined
  if (query === undefined) {
    const outcome = validateEager(schema, undefined)
    if (!isPendingOutcome(outcome) && outcome.ok) {
      return outcome.value as Record<string, unknown> | undefined
    }
  }
  return parseSync(schema, query ?? {}) as Record<string, unknown>
}

function thrownOutcome(cause: unknown): ValidationOutcome {
  const message = cause instanceof Error ? cause.message : 'The schema threw during validation'
  return { ok: false, issues: [{ message }], cause }
}

function zodOutcome(result: ZodResult): ValidationOutcome {
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, issues: result.error.issues, cause: result.error }
}

function standardOutcome(result: SchemaResult<unknown>): ValidationOutcome {
  return result.issues
    ? { ok: false, issues: result.issues, cause: result.issues }
    : { ok: true, value: result.value }
}

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function'
}

/** Applies `map` to a result that may be a promise; the promise never rejects. */
function settle<T>(
  result: T | PromiseLike<T>,
  map: (result: T) => ValidationOutcome,
): MaybePromise<ValidationOutcome> {
  if (!isThenable(result)) return map(result)
  return Promise.resolve(result).then((settled) => {
    try {
      return map(settled)
    } catch (cause) {
      return thrownOutcome(cause)
    }
  }, thrownOutcome)
}

/** Validates synchronously. A schema of `zod/v4/core` has only the Standard Schema function. */
function parseZod(schema: Zod3Schema | Zod4Schema, value: unknown): ValidationOutcome {
  return schema.safeParse
    ? zodOutcome(schema.safeParse(value))
    : standardOutcome(schema['~standard'].validate(value) as SchemaResult<unknown>)
}

function runZod4(
  schema: Zod4Schema,
  value: unknown,
  ctx: { async?: boolean },
): MaybePromise<ValidationOutcome> {
  return settle(schema._zod.run({ value, issues: [] }, ctx), (payload) =>
    payload.issues.length === 0
      ? { ok: true, value: payload.value }
      : parseZod(replayZod4(schema, payload), undefined),
  )
}

function validateZod(
  schema: Zod3Schema | Zod4Schema,
  value: unknown,
  eager: boolean,
): MaybePromise<ValidationOutcome> {
  const scan = scanZod(schema)
  if (!scan.userCode) return parseZod(schema, value)

  const zod4 = isZod4(schema) ? schema : null
  if (eager && scan.onDemand && !scan.asynchronous) {
    // Without `async` a transform of Zod Mini is synchronous, and a check may still not be
    const outcome = trySync(scan, () => (zod4 ? runZod4(zod4, value, {}) : parseZod(schema, value)))
    if (outcome) return outcome
    scan.asynchronous = true
  }
  return zod4
    ? runZod4(zod4, value, { async: true })
    : settle((schema as Zod3Schema).safeParseAsync(value), zodOutcome)
}

function run(schema: Schema, value: unknown, eager: boolean): MaybePromise<ValidationOutcome> {
  try {
    return isZod4(schema) || isZod3(schema)
      ? validateZod(schema, value, eager)
      : settle(schema['~standard'].validate(value), standardOutcome)
  } catch (cause) {
    return thrownOutcome(cause)
  }
}

/**
 * Validates like {@link validate}, but hands the outcome back synchronously
 * whenever the value is validated synchronously, and as a promise only when the
 * schema itself is asynchronous. Callers that must stay synchronous for
 * synchronous schemas (socket and EventSource message handlers) branch on
 * the return value with {@link isPendingOutcome}.
 *
 * Zod schemas keep their `ZodError` as `cause`. Every other vendor goes through
 * the Standard Schema `validate` function.
 *
 * It never throws and the promise never rejects: a schema that throws is
 * reported as a failed outcome with the thrown value as `cause`.
 */
export function validateEager(schema: Schema, value: unknown): MaybePromise<ValidationOutcome> {
  return run(schema, value, true)
}

/** True when {@link validateEager} returned a promise (an asynchronous schema). */
export function isPendingOutcome(
  outcome: ValidationOutcome | Promise<ValidationOutcome>,
): outcome is Promise<ValidationOutcome> {
  return outcome instanceof Promise
}
