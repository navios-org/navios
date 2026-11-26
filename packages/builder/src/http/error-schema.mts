import type { InferSchemaOutput, Schema } from '../shared/schema.mjs'

/**
 * Record mapping HTTP status codes to schemas for error responses.
 *
 * @example
 * ```ts
 * const errorSchema = {
 *   400: z.object({ error: z.string(), field: z.string() }),
 *   404: z.object({ error: z.literal('Not Found') }),
 *   500: z.object({ error: z.string() }),
 * } satisfies ErrorSchemaRecord
 * ```
 */
export type ErrorSchemaRecord = Record<number, Schema>

/**
 * Extracts the union of all output types from an ErrorSchemaRecord.
 *
 * @example
 * ```ts
 * type Errors = InferErrorSchemaOutput<{
 *   400: z.ZodObject<{ error: z.ZodString }>,
 *   404: z.ZodObject<{ notFound: z.ZodBoolean }>
 * }>
 * // Result: { error: string } | { notFound: boolean }
 * ```
 */
export type InferErrorSchemaOutput<T extends ErrorSchemaRecord> = {
  [K in keyof T]: T[K] extends Schema ? InferSchemaOutput<T[K]> : never
}[keyof T]

/**
 * The error schemas of an endpoint declared on a builder that has shared ones
 * (`builder({ errorSchema })`): the builder's entries, with the endpoint's own
 * entry winning for a status both declare.
 */
export type MergeErrorSchemas<Shared extends ErrorSchemaRecord, Own> = Own extends ErrorSchemaRecord
  ? { [K in keyof Shared | keyof Own]: K extends keyof Own ? Own[K] : Shared[K & keyof Shared] }
  : Shared
