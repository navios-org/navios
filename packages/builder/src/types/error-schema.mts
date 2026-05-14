import type { z, ZodType } from 'zod/v4'

/**
 * Record mapping HTTP status codes to Zod schemas for error responses.
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
export type ErrorSchemaRecord = Record<number, ZodType>

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
  [K in keyof T]: T[K] extends ZodType ? z.output<T[K]> : never
}[keyof T]
