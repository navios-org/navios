import { NaviosError } from './navios-error.mjs'

import type { Schema, SchemaIssue } from './schema.mjs'

export type ValidationOutcome =
  | { ok: true; value: unknown }
  | { ok: false; issues: readonly SchemaIssue[]; cause: unknown }

interface SafeParsing {
  safeParse: (
    value: unknown,
  ) =>
    | { success: true; data: unknown }
    | { success: false; error: { issues: readonly SchemaIssue[] } }
}

function hasSafeParse(schema: object): schema is SafeParsing {
  return 'safeParse' in schema && typeof schema.safeParse === 'function'
}

/**
 * Validates a value with any Standard Schema.
 *
 * Zod schemas go through `safeParse`, so a failure keeps the original
 * `ZodError` as `cause`; a Zod schema with asynchronous checks falls back to
 * its Standard Schema `validate`. Every other vendor goes through the
 * Standard Schema `validate` function, which may be asynchronous.
 *
 * The promise never rejects: a schema that throws is reported as a failed
 * outcome with the thrown value as `cause`.
 */
export async function validate(schema: Schema, value: unknown): Promise<ValidationOutcome> {
  return validateEager(schema, value)
}

/**
 * Synchronous counterpart of {@link validate} for the standalone request
 * helpers. Throws on failure: the schema's own error for Zod (a `ZodError`),
 * a `NaviosError` otherwise. A schema that validates asynchronously cannot be
 * used here.
 */
export function parseSync(schema: Schema | undefined, value: unknown): unknown {
  if (!schema) return value
  if ('parse' in schema && typeof schema.parse === 'function') {
    return schema.parse(value)
  }
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
    throw new NaviosError('[Navios]: this helper does not support asynchronous schemas')
  }
  if (result.issues) {
    throw new NaviosError(
      `[Navios]: validation failed: ${result.issues.map((issue) => issue.message).join('; ')}`,
    )
  }
  return result.value
}

function thrownOutcome(cause: unknown): ValidationOutcome {
  const message = cause instanceof Error ? cause.message : 'The schema threw during validation'
  return { ok: false, issues: [{ message }], cause }
}

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function'
}

/**
 * Validates like {@link validate}, but hands the outcome back synchronously
 * whenever the schema validates synchronously, and as a promise only when the
 * schema itself is asynchronous. Callers that must stay synchronous for
 * synchronous schemas (socket and EventSource message handlers) branch on
 * the return value with {@link isPendingOutcome}.
 *
 * It never throws and the promise never rejects: a schema that throws is
 * reported as a failed outcome with the thrown value as `cause`.
 */
export function validateEager(
  schema: Schema,
  value: unknown,
): ValidationOutcome | Promise<ValidationOutcome> {
  if (hasSafeParse(schema)) {
    try {
      const parsed = schema.safeParse(value)
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, issues: parsed.error.issues, cause: parsed.error }
    } catch {
      // Zod throws from `safeParse` when the schema has asynchronous checks.
      // Its Standard Schema `validate` handles those, so fall through to it.
    }
  }

  try {
    const result = schema['~standard'].validate(value)
    if (isThenable(result)) {
      return Promise.resolve(result).then(
        (resolved): ValidationOutcome =>
          resolved.issues
            ? { ok: false, issues: resolved.issues, cause: undefined }
            : { ok: true, value: resolved.value },
        thrownOutcome,
      )
    }
    return result.issues
      ? { ok: false, issues: result.issues, cause: undefined }
      : { ok: true, value: result.value }
  } catch (cause) {
    return thrownOutcome(cause)
  }
}

/** True when {@link validateEager} returned a promise (an asynchronous schema). */
export function isPendingOutcome(
  outcome: ValidationOutcome | Promise<ValidationOutcome>,
): outcome is Promise<ValidationOutcome> {
  return outcome instanceof Promise
}
