import type { StandardSchemaIssue, StandardSchemaV1 } from '@navios/di'

type ValidationResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> }

function ignore(): void {}

/**
 * Validates `value` with a schema that has to answer at once. A schema that
 * answers with a promise, or with a thenable of another kind, is an error
 * with `notSynchronous` as its message, and what it rejects with later is
 * handled.
 * @internal
 */
export function validateNow<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
  notSynchronous: string,
): ValidationResult<Output> {
  const result = schema['~standard'].validate(value) as
    | ValidationResult<Output>
    | PromiseLike<unknown>
  if (typeof (result as Partial<PromiseLike<unknown>>).then === 'function') {
    ;(result as PromiseLike<unknown>).then(undefined, ignore)
    throw new Error(notSynchronous)
  }
  return result as ValidationResult<Output>
}
