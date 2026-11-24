import type { StandardSchemaV1 } from '@navios/di'

/**
 * A minimal Standard Schema built from a type guard. Used for the framework's
 * own option objects so that core needs no schema library at runtime.
 * @internal
 */
export function schemaFromGuard<T>(
  guard: (value: unknown) => value is T,
  message: string,
): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'navios',
      validate: (value) => (guard(value) ? { value } : { issues: [{ message }] }),
    },
  }
}
