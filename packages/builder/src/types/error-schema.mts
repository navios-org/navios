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

/**
 * Extracts the union of all output types from an ErrorSchemaRecord,
 * with the HTTP status code injected as `__status` property.
 *
 * This enables runtime discrimination of error types by status code.
 *
 * @example
 * ```ts
 * type Errors = InferErrorSchemaOutputWithStatus<{
 *   400: z.ZodObject<{ error: z.ZodString }>,
 *   404: z.ZodObject<{ notFound: z.ZodBoolean }>
 * }>
 * // Result: ({ error: string } & { __status: 400 }) | ({ notFound: boolean } & { __status: 404 })
 *
 * // Usage:
 * if (result.__status === 404) {
 *   // TypeScript knows result has { notFound: boolean }
 * }
 * ```
 */
export type InferErrorSchemaOutputWithStatus<T extends ErrorSchemaRecord> = {
  [K in keyof T]: T[K] extends ZodType ? z.output<T[K]> & { readonly __status: K } : never
}[keyof T]

/**
 * Type guard to check if a result is an error response with a specific status code.
 *
 * @param result - The result to check (can be success or error response)
 * @param status - The HTTP status code to check for
 * @returns True if the result is an error response with the specified status code
 *
 * @example
 * ```ts
 * const result = await getUser({ urlParams: { id: '1' } })
 *
 * if (isErrorStatus(result, 404)) {
 *   // result is typed as the 404 error schema output
 *   console.log('Not found:', result.message)
 * } else if (isErrorStatus(result, 403)) {
 *   // result is typed as the 403 error schema output
 *   console.log('Forbidden:', result.reason)
 * } else {
 *   // result is the success response
 *   console.log('User:', result.name)
 * }
 * ```
 */
export function isErrorStatus<T, S extends number>(
  result: T,
  status: S,
): result is Extract<T, { __status: S }> {
  return (
    typeof result === 'object' &&
    result !== null &&
    '__status' in result &&
    (result as { __status: unknown }).__status === status
  )
}

/**
 * Type guard to check if a result is any error response (has __status property).
 *
 * @param result - The result to check
 * @returns True if the result has a __status property (is an error response)
 *
 * @example
 * ```ts
 * const result = await getUser({ urlParams: { id: '1' } })
 *
 * if (isErrorResponse(result)) {
 *   console.log('Error with status:', result.__status)
 * } else {
 *   console.log('Success:', result)
 * }
 * ```
 */
export function isErrorResponse<T>(result: T): result is Extract<T, { __status: number }> {
  return (
    typeof result === 'object' &&
    result !== null &&
    '__status' in result &&
    typeof (result as Record<string, unknown>).__status === 'number'
  )
}
