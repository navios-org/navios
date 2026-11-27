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
  return unwrap(validateSync(schema, value))
}

/**
 * {@link validateEager} for a caller that cannot wait.
 *
 * @throws {NaviosError} for a schema that validates asynchronously
 */
export function validateSync(schema: Schema, value: unknown): ValidationOutcome {
  return settled(validateEager(schema, value))
}

/**
 * {@link validateSync} for a query, which may be left out when the schema
 * accepts `undefined` or has no required fields. Otherwise the outcome names
 * the fields.
 */
export function validateQuerySync(
  schema: Schema,
  query: Record<string, unknown> | undefined,
): ValidationOutcome {
  const { outcome, asEmpty } = settled(validateOptional(schema, query))
  return asEmpty ?? outcome
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
  return unwrap(validateQuerySync(schema, query)) as Record<string, unknown> | undefined
}

/** What validating a value that may be left out found. */
export interface OptionalOutcome {
  outcome: ValidationOutcome
  /** The value that was accepted: the one passed, or `{}` for one left out. */
  input: unknown
  /** Why `{}` was refused as well, for a value that was left out. */
  asEmpty?: ValidationOutcome
}

/**
 * Validates the body or the query of a call. Either may be left out when its
 * schema accepts `undefined` or has no required fields (the call signature
 * makes it optional in both cases), so one that was is also tried as an empty
 * object.
 *
 * Synchronous whenever `check` is, as {@link validateEager} (the default) is
 * for a synchronous schema. HTTP calls pass {@link validate} and await it;
 * `declareWebSocket` and `declareEventSource` need the synchronous result.
 */
export function validateOptional(
  schema: Schema | undefined,
  value: unknown,
  check: (schema: Schema, value: unknown) => MaybePromise<ValidationOutcome> = validateEager,
): MaybePromise<OptionalOutcome> {
  if (!schema) return { outcome: { ok: true, value }, input: value }
  return andThen(check(schema, value), (outcome) => {
    if (outcome.ok || value !== undefined) return { outcome, input: value }
    return andThen(check(schema, {}), (asEmpty) =>
      asEmpty.ok ? { outcome: asEmpty, input: {} } : { outcome, input: value, asEmpty },
    )
  })
}

/** Applies `next` to a value that may be a promise. */
function andThen<T, R>(value: MaybePromise<T>, next: (value: T) => MaybePromise<R>) {
  return isPendingOutcome(value) ? value.then(next) : next(value)
}

/** A synchronous result, or the error of a schema that validates asynchronously. */
function settled<T>(result: MaybePromise<T>): T {
  if (isPendingOutcome(result)) {
    throw new NaviosError('[Navios]: asynchronous schemas are not supported here')
  }
  return result
}

/** The value of a valid outcome; throws the failure of an invalid one. */
function unwrap(outcome: ValidationOutcome): unknown {
  if (outcome.ok) return outcome.value
  if (outcome.cause instanceof Error) throw outcome.cause
  throw new NaviosError(
    `[Navios]: validation failed: ${outcome.issues.map((issue) => issue.message).join('; ')}`,
    { cause: outcome.cause },
  )
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
export function isPendingOutcome<T>(outcome: MaybePromise<T>): outcome is Promise<T> {
  return outcome instanceof Promise
}
