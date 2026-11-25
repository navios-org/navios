import type { StandardSchemaV1 } from '@navios/server'

/**
 * The value schemas of the documentation attributes. They are hand-written
 * Standard Schemas so that the package needs no schema library at runtime.
 */

export function valueSchema<T>(check: (value: unknown) => string | null): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'navios',
      validate: (value) => {
        const message = check(value)
        return message === null ? { value: value as T } : { issues: [{ message }] }
      },
    },
  }
}

export function optionalField(
  value: Record<string, unknown>,
  key: string,
  type: 'string' | 'boolean',
): string | null {
  return value[key] === undefined || typeof value[key] === type
    ? null
    : `"${key}" must be a ${type}`
}

export function firstError(...errors: Array<string | null>): string | null {
  return errors.find((error) => error !== null) ?? null
}
