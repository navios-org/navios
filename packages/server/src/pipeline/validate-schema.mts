import type { StandardSchemaIssue, StandardSchemaV1 } from '@navios/di'

import { ValidationError } from '../errors/validation-error.mjs'
import { adopt } from '../internal/promises.mjs'

import type { ValidationSource } from '../errors/validation-error.mjs'

import { mayBeAsync } from './zod-schema.mjs'

import type { ZodPayload, ZodSchema } from './zod-schema.mjs'

/**
 * How a schema is validated:
 *
 * - `standard`: with `~standard.validate`. Any schema that is not zod's, and a
 *   zod schema that cannot meet an asynchronous check.
 * - `either`: a zod schema that holds a function, which may return a promise
 *   for some values.
 * - `async`: a zod schema that has returned a promise.
 *
 * Standard Schema does not say whether a schema is asynchronous. Zod's
 * implementation validates synchronously first and, on meeting an
 * asynchronous check, starts over. The checks before it and the start of the
 * asynchronous one then happen twice, and the promise of the first attempt is
 * dropped: if it rejects, nobody handles it and the process ends. A value
 * cannot tell that a schema has no such check, only which checks it reached,
 * so a schema is classified by what it is made of.
 */
type Mode = 'standard' | 'either' | 'async'

const modes = new WeakMap<StandardSchemaV1, Mode>()

function classify(schema: StandardSchemaV1): Mode {
  const mode = mayBeAsync(schema) ? 'either' : 'standard'
  modes.set(schema, mode)
  return mode
}

async function validateAsync(
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

function validateEither(
  schema: ZodSchema,
  value: unknown,
  source: ValidationSource,
): unknown | Promise<unknown> {
  const outcome = schema._zod.run({ value, issues: [] }, { async: true })
  if (outcome instanceof Promise) {
    modes.set(schema, 'async')
    return finishAsync(outcome, schema, value, source)
  }
  // With issues, the synchronous validation below reaches the same checks and
  // puts the issues into words.
  return outcome.issues.length === 0 ? outcome.value : validateStandard(schema, value, source)
}

async function finishAsync(
  pending: Promise<ZodPayload>,
  schema: ZodSchema,
  value: unknown,
  source: ValidationSource,
): Promise<unknown> {
  const outcome = await pending
  return outcome.issues.length === 0 ? outcome.value : validateAsync(schema, value, source)
}

function validateStandard(
  schema: StandardSchemaV1,
  value: unknown,
  source: ValidationSource,
): unknown | Promise<unknown> {
  const result = adopt(schema['~standard'].validate(value))
  if (result instanceof Promise) {
    return result.then((settled) => valueOf(settled, source))
  }
  return valueOf(result, source)
}

function valueOf(
  result: { value: unknown; issues?: undefined } | { issues: ReadonlyArray<StandardSchemaIssue> },
  source: ValidationSource,
): unknown {
  if (result.issues) {
    throw new ValidationError(source, result.issues)
  }
  return result.value
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
  switch (modes.get(schema) ?? classify(schema)) {
    case 'standard':
      return validateStandard(schema, value, source)
    case 'either':
      return validateEither(schema as ZodSchema, value, source)
    default:
      return validateAsync(schema as ZodSchema, value, source)
  }
}
