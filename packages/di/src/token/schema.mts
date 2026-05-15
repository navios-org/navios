import type { StandardSchemaV1 } from '@standard-schema/spec'

export type { StandardSchemaV1 } from '@standard-schema/spec'

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly StandardSchemaV1.Issue[] }

export async function validateStandardSchema<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): Promise<ValidationResult<StandardSchemaV1.InferOutput<S>>> {
  const result = await schema['~standard'].validate(input)
  if ('issues' in result && result.issues) {
    return { ok: false, issues: result.issues }
  }
  return {
    ok: true,
    value: (result as { value: StandardSchemaV1.InferOutput<S> }).value,
  }
}
