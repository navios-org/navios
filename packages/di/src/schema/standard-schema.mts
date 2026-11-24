import { DIError } from '../errors/di-error.mjs'

/**
 * The Standard Schema interface (https://standardschema.dev), inlined so that
 * `@navios/di` has no runtime or type dependency on a schema library.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown,
    ...rest: any[]
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>
  readonly types?: StandardSchemaTypes<Input, Output> | undefined
}

export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  readonly input: Input
  readonly output: Output
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> }

export interface StandardSchemaIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

export type InferInput<S> = S extends StandardSchemaV1
  ? NonNullable<S['~standard']['types']>['input']
  : never

export type InferOutput<S> = S extends StandardSchemaV1
  ? NonNullable<S['~standard']['types']>['output']
  : never

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    '~standard' in (value as object)
  )
}

/**
 * Validates `value` synchronously. DI resolution is synchronous, so a schema
 * whose `validate` returns a promise is rejected.
 */
export function validateSync(schema: StandardSchemaV1, value: unknown, tokenName: string): unknown {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
    // Avoid an unhandled rejection from the validator we are not awaiting.
    result.catch(() => {})
    throw DIError.tokenValidationError(
      `Validation failed for ${tokenName}: token args schemas must validate synchronously`,
      schema,
      value,
    )
  }
  if (result.issues) {
    throw DIError.tokenValidationError(`Validation failed for ${tokenName}`, schema, value, [
      ...result.issues,
    ])
  }
  return result.value
}
