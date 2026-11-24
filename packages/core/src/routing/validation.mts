import type { StandardSchemaIssue, StandardSchemaV1 } from '@navios/di'

export type ValidationSource = 'urlParams' | 'query' | 'headers' | 'cookies' | 'body' | 'response'

/**
 * A value did not match its schema. `source` says which part of the request
 * (or the response) was being validated.
 */
export class ValidationError extends Error {
  constructor(
    public readonly source: ValidationSource,
    public readonly issues: ReadonlyArray<StandardSchemaIssue>,
  ) {
    super(
      `Validation failed for ${source}: ${issues
        .map((issue) => {
          const path = formatPath(issue.path)
          return path ? `${path}: ${issue.message}` : issue.message
        })
        .join('; ')}`,
    )
    this.name = 'ValidationError'
  }
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
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
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
