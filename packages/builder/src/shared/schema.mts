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
  | { readonly issues: readonly SchemaIssue[] }

/**
 * One validation problem. Zod's issues satisfy this shape and keep their
 * extra fields (`code`, `expected`, ...) at runtime.
 */
export interface SchemaIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined
}

/** The type a schema accepts (what the caller passes). */
export type InferSchemaInput<S> = S extends Schema
  ? NonNullable<S['~standard']['types']>['input']
  : never

/** The type a schema produces (what the caller receives). */
export type InferSchemaOutput<S> = S extends Schema
  ? NonNullable<S['~standard']['types']>['output']
  : never
