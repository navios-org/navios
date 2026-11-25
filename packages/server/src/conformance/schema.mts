import type { StandardSchemaV1 } from '@navios/di'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Check<T> = (value: unknown, path: PropertyKey[]) => { value: T } | { issues: Issue[] }
export interface Issue {
  message: string
  path: PropertyKey[]
}

function schema<T>(check: Check<T>): StandardSchemaV1<unknown, T> & { check: Check<T> } {
  return {
    check,
    '~standard': {
      version: 1,
      vendor: 'navios-conformance',
      validate: (value) => check(value, []) as any,
    },
  }
}

type Checked<T> = StandardSchemaV1<unknown, T> & { check: Check<T> }

/**
 * A tiny hand-written Standard Schema library. The conformance suite uses it
 * so that it depends on no schema vendor, which also proves that the server
 * works with any Standard Schema.
 * @internal
 */
export const s = {
  string: (options: { min?: number } = {}): Checked<string> =>
    schema<string>((value, path) =>
      typeof value === 'string' && value.length >= (options.min ?? 0)
        ? { value }
        : { issues: [{ message: 'Expected a string', path }] },
    ),
  number: (options: { coerce?: boolean } = {}): Checked<number> =>
    schema<number>((value, path) => {
      const candidate = options.coerce && typeof value === 'string' ? Number(value) : value
      return typeof candidate === 'number' && !Number.isNaN(candidate)
        ? { value: candidate }
        : { issues: [{ message: 'Expected a number', path }] }
    }),
  boolean: (): Checked<boolean> =>
    schema<boolean>((value, path) =>
      typeof value === 'boolean'
        ? { value }
        : { issues: [{ message: 'Expected a boolean', path }] },
    ),
  file: (): Checked<File> =>
    schema<File>((value, path) =>
      value instanceof File ? { value } : { issues: [{ message: 'Expected a file', path }] },
    ),
  optional: <T,>(inner: Checked<T>): Checked<T | undefined> =>
    schema<T | undefined>((value, path) =>
      value === undefined ? { value: undefined } : inner.check(value, path),
    ),
  nullable: <T,>(inner: Checked<T>): Checked<T | null> =>
    schema<T | null>((value, path) =>
      value === null ? { value: null } : inner.check(value, path),
    ),
  array: <T,>(inner: Checked<T>): Checked<T[]> =>
    schema<T[]>((value, path) => {
      if (!Array.isArray(value)) {
        return { issues: [{ message: 'Expected an array', path }] }
      }
      const out: T[] = []
      const issues: Issue[] = []
      value.forEach((item, index) => {
        const result = inner.check(item, [...path, index])
        if ('issues' in result) {
          issues.push(...result.issues)
        } else {
          out.push(result.value)
        }
      })
      return issues.length > 0 ? { issues } : { value: out }
    }),
  /** Unknown keys are dropped, as most schema libraries do by default. */
  object: <Shape extends Record<string, Checked<any>>>(
    shape: Shape,
  ): Checked<{ [K in keyof Shape]: Shape[K] extends Checked<infer T> ? T : never }> =>
    schema((value, path) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { issues: [{ message: 'Expected an object', path }] }
      }
      const out: Record<string, unknown> = {}
      const issues: Issue[] = []
      for (const key of Object.keys(shape)) {
        const result = shape[key].check((value as Record<string, unknown>)[key], [...path, key])
        if ('issues' in result) {
          issues.push(...result.issues)
        } else if (result.value !== undefined) {
          out[key] = result.value
        }
      }
      return issues.length > 0 ? { issues } : { value: out as any }
    }),
}
