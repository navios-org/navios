// =============================================================================
// Standard Schema (https://standardschema.dev), v1 — inlined per the spec's
// recommendation so the builder has no runtime dependency on it.
// =============================================================================

/**
 * Any schema that implements Standard Schema v1: Zod, Valibot, ArkType and
 * others. Every schema slot of an endpoint (`requestSchema`, `querySchema`,
 * `urlParamsSchema`, `responseSchema`, `errorSchema`, `responses`) accepts one.
 */
export interface Schema<Input = unknown, Output = Input> {
  readonly '~standard': SchemaProps<Input, Output>
}

export interface SchemaProps<Input = unknown, Output = Input> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>
  readonly types?: { readonly input: Input; readonly output: Output } | undefined
}

export type SchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly StandardIssue[] }

/**
 * One validation problem as a schema library reports it. What else a library
 * puts on it varies, and may include the validated value.
 */
export interface StandardIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined
}

/**
 * One validation problem as the builder's errors report it: plain data, whatever
 * the schema library. `path` leads from the validated value to the problem.
 */
export interface SchemaIssue {
  readonly message: string
  readonly path?: readonly PropertyKey[] | undefined
}

/**
 * Reduces an issue to its message and path. The object a schema library
 * reports can hold the validated value (Valibot) or values `JSON.stringify`
 * refuses (a BigInt limit), and errors are logged.
 */
export function toSchemaIssue({ message, path }: StandardIssue): SchemaIssue {
  if (path === undefined) return { message }
  return {
    message,
    path: Array.from(path, (segment) => (typeof segment === 'object' ? segment.key : segment)),
  }
}

/** The type a schema accepts (what the caller passes). */
export type InferSchemaInput<S> = S extends Schema
  ? NonNullable<S['~standard']['types']>['input']
  : never

/** The type a schema produces (what the caller receives). */
export type InferSchemaOutput<S> = S extends Schema
  ? NonNullable<S['~standard']['types']>['output']
  : never
